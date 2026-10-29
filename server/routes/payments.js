import { Router } from 'express'
import express from 'express'
import { z } from 'zod'
import { config } from '../config.js'
import { one, query } from '../db.js'
import { HttpError, audit, bad, notFound, parse } from '../lib/http.js'
import { limiter } from '../lib/limits.js'
import { splitContribution } from '../lib/money.js'
import { PaymentError, confirmCheckout, createCheckout, isConfigured, mock, verifyHash } from '../lib/paydunya.js'
import { getSettings } from '../lib/settings.js'

const r = Router()

const schema = z.object({
  campaignId: z.uuid(),
  amount: z.number().int().positive(),
  name: z.string().trim().max(60).optional().default(''),
  anonymous: z.boolean().optional().default(false),
  message: z.string().trim().max(280).optional().default(''),
  channel: z.enum(['wave', 'orange', 'free', 'card']),
})

/** Devis : ce que paiera le donateur et ce que recevra la cagnotte */
r.get('/payments/quote', async (req, res) => {
  const s = await getSettings()
  const amount = parse(z.coerce.number().int().positive().max(1_000_000_000), req.query.amount)
  res.json(splitContribution(amount, s))
})

/** Lance un paiement : crée la participation « en attente » puis la facture PayDunya */
r.post('/payments', limiter.payment, async (req, res) => {
  const s = await getSettings()
  if (!isConfigured(s)) throw new HttpError(503, 'Les paiements ne sont pas encore activés. Réessayez bientôt.')
  const data = parse(schema, req.body)
  if (!s.channels[data.channel]) throw bad('Ce moyen de paiement est momentanément indisponible.')
  if (data.amount < s.min_contribution) throw bad(`Montant minimum : ${s.min_contribution.toLocaleString('fr-FR')} F`)
  if (data.amount > s.max_contribution) throw bad(`Montant maximum : ${s.max_contribution.toLocaleString('fr-FR')} F`)
  if (!data.anonymous && data.name.length < 2) throw bad('Indiquez votre nom.')

  const c = await one('SELECT id, title, status, deadline FROM campaigns WHERE id = $1', [data.campaignId])
  if (!c) throw notFound('Cagnotte introuvable.')
  if (c.status !== 'active') throw bad('Cette cagnotte ne reçoit plus de participations.')
  if (c.deadline && new Date(c.deadline).setHours(23, 59, 59) < Date.now()) throw bad('La date limite de cette cagnotte est dépassée.')

  const split = splitContribution(data.amount, s)
  const k = await one(
    `INSERT INTO contributions(campaign_id, user_id, donor_name, anonymous, message, amount, donor_fee, commission, net, total_charged, channel)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [c.id, req.user?.id || null, data.name || 'Anonyme', data.anonymous, data.message || null, split.amount, split.donor_fee, split.commission, split.net, split.total_charged, data.channel]
  )

  try {
    const { token, checkoutUrl } = await createCheckout(s, {
      contributionId: k.id,
      campaign: c,
      amountToPay: split.total_charged,
      description: `Participation à « ${c.title} »`,
      channel: data.channel,
      customer: { name: data.name },
    })
    await query('UPDATE contributions SET provider_token = $2, provider_mode = $3 WHERE id = $1', [k.id, token, s.paydunya_mode])
    res.status(201).json({ checkoutUrl, token, contributionId: k.id, ...split })
  } catch (e) {
    await query(`UPDATE contributions SET status = 'failed' WHERE id = $1`, [k.id])
    if (e instanceof PaymentError) {
      console.error('PayDunya create:', e.details)
      throw new HttpError(502, e.message)
    }
    throw e
  }
})

/**
 * Rapproche une participation avec PayDunya. On ne fait JAMAIS confiance au navigateur
 * ni au contenu de la notification : seul l'appel « confirm » à PayDunya fait foi,
 * et le montant payé doit correspondre exactement au montant attendu.
 */
export async function reconcile(token, req) {
  const k = await one('SELECT * FROM contributions WHERE provider_token = $1', [token])
  if (!k) return null
  if (k.status !== 'pending') return k
  const s = await getSettings()
  const info = await confirmCheckout(s, token)

  if (info.status === 'completed') {
    const amountOk = info.totalAmount === Number(k.total_charged)
    const linkOk = !info.customData?.contribution_id || info.customData.contribution_id === k.id
    const modeOk = config.paydunyaMock || !info.mode || info.mode === k.provider_mode
    if (!amountOk || !linkOk || !modeOk) {
      await query(`UPDATE contributions SET status = 'failed' WHERE id = $1 AND status = 'pending'`, [k.id])
      await audit(req, 'payment.rejected_mismatch', k.id, { expected: k.total_charged, received: info.totalAmount, mode: info.mode })
      return { ...k, status: 'failed' }
    }
    const upd = await one(
      `UPDATE contributions SET status = 'paid', paid_at = now(), receipt_url = $2, customer_phone = $3
       WHERE id = $1 AND status = 'pending' RETURNING *`,
      [k.id, info.receiptUrl || null, info.customerPhone || null]
    )
    if (upd) await audit(req, 'payment.paid', k.id, { amount: k.amount, commission: k.commission, campaign: k.campaign_id })
    return upd || (await one('SELECT * FROM contributions WHERE id = $1', [k.id]))
  }
  if (info.status === 'cancelled' || info.status === 'canceled' || info.status === 'failed') {
    const st = info.status === 'failed' ? 'failed' : 'cancelled'
    await query(`UPDATE contributions SET status = $2 WHERE id = $1 AND status = 'pending'`, [k.id, st])
    return { ...k, status: st }
  }
  return k
}

/** Notification instantanée (IPN) envoyée par PayDunya — x-www-form-urlencoded, champs data[...] */
r.post('/payments/ipn', express.urlencoded({ extended: true, limit: '100kb' }), async (req, res) => {
  const data = req.body?.data || {}
  const s = await getSettings()
  if (!verifyHash(s, data.hash)) {
    await audit(req, 'payment.ipn_bad_hash', null, { token: data?.invoice?.token })
    return res.status(401).json({ error: 'signature invalide' })
  }
  const token = data?.invoice?.token
  if (typeof token !== 'string' || token.length > 100) return res.status(400).json({ error: 'token manquant' })
  try {
    await reconcile(token, req)
  } catch (e) {
    console.error('IPN reconcile', e.message)
    return res.status(500).json({ error: 'réessayer' })
  }
  res.json({ ok: true })
})

/** Statut d'un paiement (page de retour) */
r.get('/payments/:token', async (req, res) => {
  const token = req.params.token
  if (!/^[A-Za-z0-9_-]{4,100}$/.test(token)) throw notFound()
  let k
  try {
    k = await reconcile(token, req)
  } catch (e) {
    if (!(e instanceof PaymentError)) throw e
    k = await one('SELECT * FROM contributions WHERE provider_token = $1', [token])
  }
  if (!k) throw notFound('Paiement introuvable.')
  const c = await one('SELECT slug, title FROM campaigns WHERE id = $1', [k.campaign_id])
  res.json({
    status: k.status,
    amount: k.amount,
    totalCharged: k.total_charged,
    name: k.anonymous ? null : k.donor_name,
    campaign: c,
  })
})

/* Simulateur PayDunya — disponible uniquement hors production */
if (config.paydunyaMock) {
  r.post('/dev/paydunya/settle', async (req, res) => {
    const { token, outcome } = req.body || {}
    if (!mock.settle(token, outcome === 'completed' ? 'completed' : 'cancelled')) throw notFound()
    await reconcile(token, req)
    res.json({ ok: true })
  })
}

export default r
