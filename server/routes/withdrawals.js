import { Router } from 'express'
import express from 'express'
import { z } from 'zod'
import { many, one, query, tx } from '../db.js'
import { checkPassword, requireUser } from '../lib/auth.js'
import { HttpError, audit, bad, forbidden, isSnPhone, normalizePhone, notFound, parse } from '../lib/http.js'
import { limiter } from '../lib/limits.js'
import { campaignBalance, withdrawalFee } from '../lib/money.js'
import { PaymentError, checkDisburse, disburse, isConfigured, verifyHash } from '../lib/paydunya.js'
import { getSettings } from '../lib/settings.js'

const r = Router()

const schema = z.object({
  amount: z.number().int().positive(),
  method: z.enum(['wave', 'orange', 'free']),
  phone: z.string().transform(normalizePhone).refine(isSnPhone, 'Numéro invalide'),
  password: z.string().min(1).max(128),
})

/** Solde et conditions de retrait d'une cagnotte (propriétaire uniquement) */
r.get('/campaigns/:id/balance', requireUser, async (req, res) => {
  const c = await one('SELECT id, owner_id FROM campaigns WHERE id = $1', [req.params.id])
  if (!c) throw notFound()
  if (c.owner_id !== req.user.id) throw forbidden()
  const history = await many(
    `SELECT id, amount, fee, payout, method, phone, status, failure_reason, created_at FROM withdrawals
     WHERE campaign_id = $1 ORDER BY created_at DESC LIMIT 30`,
    [c.id]
  )
  res.json({ balance: await campaignBalance(c.id), withdrawals: history })
})

/**
 * Demande de retrait. Sécurités :
 *  - mot de passe redemandé (confirmation forte)
 *  - verrou de ligne sur la cagnotte : deux retraits simultanés ne peuvent pas dépasser le solde
 *  - plafond journalier, montant minimum, numéro du compte imposé si l'admin l'exige
 */
r.post('/campaigns/:id/withdrawals', requireUser, limiter.withdraw, async (req, res) => {
  const s = await getSettings()
  const data = parse(schema, req.body)
  const user = await one('SELECT id, phone, password_hash, status FROM users WHERE id = $1', [req.user.id])

  if (!(await checkPassword(data.password, user.password_hash))) {
    await audit(req, 'withdrawal.bad_password', req.params.id)
    throw bad('Mot de passe incorrect.')
  }
  if (!isConfigured(s)) throw new HttpError(503, 'Les retraits ne sont pas encore activés.')
  if (!s.withdrawal_methods[data.method]) throw bad('Ce moyen de retrait est momentanément indisponible.')
  if (data.amount < s.min_withdrawal) throw bad(`Montant minimum de retrait : ${s.min_withdrawal.toLocaleString('fr-FR')} F`)
  if (s.withdraw_to_account_phone_only && data.phone !== user.phone) {
    throw bad('Pour votre sécurité, les retraits sont envoyés uniquement au numéro de votre compte.')
  }

  const fee = withdrawalFee(data.amount, s)
  if (data.amount - fee <= 0) throw bad('Montant trop faible par rapport aux frais de retrait.')

  const w = await tx(async (db) => {
    const c = (await db.query('SELECT id, owner_id, status FROM campaigns WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0]
    if (!c) throw notFound()
    if (c.owner_id !== req.user.id) throw forbidden()
    if (c.status === 'suspended') throw forbidden('Cette cagnotte est suspendue : les retraits sont bloqués. Contactez le support.')

    const { available } = await campaignBalance(c.id, db)
    if (data.amount > available) throw bad(`Solde insuffisant. Disponible : ${available.toLocaleString('fr-FR')} F`)

    const today = (
      await db.query(
        `SELECT COALESCE(SUM(amount), 0) AS t FROM withdrawals WHERE owner_id = $1
         AND status IN ('pending_review', 'processing', 'success') AND created_at > now() - interval '24 hours'`,
        [req.user.id]
      )
    ).rows[0].t
    if (Number(today) + data.amount > s.max_withdrawal_per_day) {
      throw bad(`Plafond de retrait sur 24 h atteint (${s.max_withdrawal_per_day.toLocaleString('fr-FR')} F).`)
    }

    return (
      await db.query(
        `INSERT INTO withdrawals(campaign_id, owner_id, amount, fee, payout, method, phone, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [c.id, req.user.id, data.amount, fee, data.amount - fee, data.method, data.phone, s.withdrawal_mode === 'automatic' ? 'processing' : 'pending_review']
      )
    ).rows[0]
  })

  await audit(req, 'withdrawal.request', w.id, { campaign: w.campaign_id, amount: w.amount, method: w.method, phone: w.phone })
  const result = w.status === 'processing' ? await executePayout(w, req) : w
  res.status(201).json({ withdrawal: publicWithdrawal(result) })
})

export const publicWithdrawal = (w) => ({
  id: w.id,
  amount: w.amount,
  fee: w.fee,
  payout: w.payout,
  method: w.method,
  phone: w.phone,
  status: w.status,
  failure_reason: w.failure_reason,
  created_at: w.created_at,
})

/** Envoie réellement l'argent via PayDunya et met à jour le statut */
export async function executePayout(w, req) {
  const s = await getSettings()
  let out
  try {
    out = await disburse(s, { withdrawalId: w.id, phone: w.phone, amount: Number(w.payout), method: w.method })
  } catch (e) {
    // Erreur réseau : on ne sait pas si l'argent est parti → on reste « en cours » et la tâche de fond vérifiera
    if (e instanceof PaymentError) {
      await audit(req, 'withdrawal.network_error', w.id, { error: e.details })
      return (await one(`UPDATE withdrawals SET failure_reason = $2, updated_at = now() WHERE id = $1 RETURNING *`, [w.id, 'Vérification en cours auprès de l’opérateur'])) || w
    }
    throw e
  }
  const status = out.status === 'success' ? 'success' : out.status === 'failed' ? 'failed' : 'processing'
  const upd = await one(
    `UPDATE withdrawals SET status = $2, provider_token = $3, provider_tx = $4, failure_reason = $5, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [w.id, status, out.token, out.transactionId || null, status === 'failed' ? out.reason || 'Refusé par l’opérateur' : null]
  )
  await audit(req, `withdrawal.${status}`, w.id, { amount: w.payout, tx: out.transactionId, reason: out.reason })
  return upd
}

/** Vérifie auprès de PayDunya les retraits encore « en cours » */
export async function refreshPendingPayouts() {
  const s = await getSettings()
  const rows = await many(
    `SELECT * FROM withdrawals WHERE status = 'processing' AND updated_at < now() - interval '30 seconds' ORDER BY updated_at LIMIT 20`
  )
  for (const w of rows) {
    try {
      if (!w.provider_token) {
        // Jamais transmis (erreur réseau avant la création) : on retente une seule fois après 2 minutes
        if (Date.now() - new Date(w.created_at).getTime() > 120_000) await executePayout(w, null)
        continue
      }
      const st = await checkDisburse(s, w.provider_token)
      if (st.status === 'pending') {
        await query('UPDATE withdrawals SET updated_at = now() WHERE id = $1', [w.id])
        continue
      }
      await query(
        `UPDATE withdrawals SET status = $2, provider_tx = COALESCE($3, provider_tx), failure_reason = $4, updated_at = now()
         WHERE id = $1 AND status = 'processing'`,
        [w.id, st.status, st.transactionId, st.status === 'failed' ? 'Refusé par l’opérateur' : null]
      )
      await audit(null, `withdrawal.${st.status}`, w.id, { via: 'check-status' })
    } catch (e) {
      console.error('refresh payout', w.id, e.message)
    }
  }
}

/** Notification de PayDunya à la fin d'un déboursement */
r.post('/withdrawals/callback', express.urlencoded({ extended: true, limit: '50kb' }), async (req, res) => {
  const body = req.body?.data || req.body || {}
  const s = await getSettings()
  if (!verifyHash(s, body.hash)) return res.status(401).json({ error: 'signature invalide' })
  const w = await one('SELECT * FROM withdrawals WHERE provider_token = $1', [String(body.token || '')])
  if (!w || w.status !== 'processing') return res.json({ ok: true })
  // Le statut est revérifié directement auprès de PayDunya
  const st = await checkDisburse(s, w.provider_token).catch(() => ({ status: 'pending' }))
  if (st.status !== 'pending') {
    await query(
      `UPDATE withdrawals SET status = $2, provider_tx = COALESCE($3, provider_tx), failure_reason = $4, updated_at = now()
       WHERE id = $1 AND status = 'processing'`,
      [w.id, st.status, st.transactionId, st.status === 'failed' ? 'Refusé par l’opérateur' : null]
    )
    await audit(req, `withdrawal.${st.status}`, w.id, { via: 'callback' })
  }
  res.json({ ok: true })
})

export default r
