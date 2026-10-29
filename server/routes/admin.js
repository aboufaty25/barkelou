import { Router } from 'express'
import { z } from 'zod'
import { exec, many, one, tx } from '../db.js'
import { checkPassword, requireAdmin } from '../lib/auth.js'
import { audit, bad, forbidden, notFound, parse } from '../lib/http.js'
import { config } from '../config.js'
import { adminView, getSettings, saveSettings, settingsSchema, SECRET_KEYS } from '../lib/settings.js'
import { executePayout, publicWithdrawal } from './withdrawals.js'
import { likeEscape } from './campaigns.js'

const r = Router()
r.use(requireAdmin)

const page = z.object({
  q: z.string().max(80).optional(),
  status: z.string().max(20).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
})

async function confirmAdminPassword(req, password) {
  const u = await one('SELECT password_hash FROM users WHERE id = ?', [req.user.id])
  if (!password || !(await checkPassword(String(password), u.password_hash))) {
    await audit(req, 'admin.bad_password')
    throw bad('Mot de passe administrateur incorrect.')
  }
}

/** Construit une clause WHERE à partir de conditions optionnelles */
function where(conds) {
  const parts = []
  const params = []
  for (const [sql, ...vals] of conds) {
    if (vals.some((v) => v === undefined || v === '' || v === null)) continue
    parts.push(sql)
    params.push(...vals)
  }
  return { sql: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params }
}

/* ---------- Tableau de bord ---------- */
r.get('/overview', async (_req, res) => {
  const totals = await one(`SELECT
    COALESCE((SELECT SUM(amount) FROM contributions WHERE status = 'paid'), 0) AS raised,
    COALESCE((SELECT SUM(total_charged) FROM contributions WHERE status = 'paid'), 0) AS collected,
    COALESCE((SELECT SUM(commission) FROM contributions WHERE status = 'paid'), 0) AS commissions,
    COALESCE((SELECT SUM(fee) FROM withdrawals WHERE status = 'success'), 0) AS withdrawal_fees,
    COALESCE((SELECT SUM(payout) FROM withdrawals WHERE status = 'success'), 0) AS paid_out,
    COALESCE((SELECT SUM(net) FROM contributions WHERE status = 'paid'), 0)
      - COALESCE((SELECT SUM(amount) FROM withdrawals WHERE status IN ('pending_review','processing','success')), 0) AS owed,
    (SELECT COUNT(*) FROM contributions WHERE status = 'paid') AS payments,
    (SELECT COUNT(*) FROM users) AS users,
    (SELECT COUNT(*) FROM campaigns) AS campaigns,
    (SELECT COUNT(*) FROM campaigns WHERE status = 'pending') AS campaigns_pending,
    (SELECT COUNT(*) FROM withdrawals WHERE status = 'pending_review') AS withdrawals_pending,
    (SELECT COUNT(*) FROM withdrawals WHERE status = 'processing') AS withdrawals_processing`)

  // Collecte par jour sur 30 jours (les jours sans paiement sont complétés à 0)
  const rows = await many(`
    SELECT DATE_FORMAT(paid_at, '%Y-%m-%d') AS day, SUM(amount) AS amount, SUM(commission) AS commission
    FROM contributions WHERE status = 'paid' AND paid_at >= UTC_DATE() - INTERVAL 29 DAY
    GROUP BY day`)
  const byDay = Object.fromEntries(rows.map((d) => [d.day, d]))
  const daily = Array.from({ length: 30 }, (_, i) => {
    const day = new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10)
    return { day, amount: Number(byDay[day]?.amount || 0), commission: Number(byDay[day]?.commission || 0) }
  })

  const s = await getSettings()
  res.json({
    totals,
    daily,
    payments: { configured: !!(s.paydunya_master_key && s.paydunya_private_key && s.paydunya_token), mode: s.paydunya_mode, simulated: config.paydunyaMock },
  })
})

/* ---------- Paramètres ---------- */
r.get('/settings', async (_req, res) => {
  res.json({ settings: adminView(await getSettings({ fresh: true })), simulated: config.paydunyaMock })
})

r.put('/settings', async (req, res) => {
  const { password, ...rest } = req.body || {}
  await confirmAdminPassword(req, password)
  const patch = parse(settingsSchema, rest)
  const current = await getSettings({ fresh: true })
  const min = patch.min_contribution ?? current.min_contribution
  const max = patch.max_contribution ?? current.max_contribution
  if (min > max) throw bad('Le montant minimum de participation dépasse le maximum.')
  const changed = await saveSettings(patch, req.user.id)
  await audit(req, 'admin.settings_update', null, {
    changed,
    values: Object.fromEntries(changed.map((k) => [k, SECRET_KEYS.includes(k) ? '(secret modifié)' : patch[k]])),
  })
  res.json({ settings: adminView(await getSettings({ fresh: true })), changed })
})

/* ---------- Cagnottes ---------- */
r.get('/campaigns', async (req, res) => {
  const q = parse(page, req.query)
  const like = q.q ? likeEscape(q.q) : undefined
  const w = where([
    ['c.status = ?', q.status],
    ['(c.title LIKE ? OR u.name LIKE ? OR u.phone LIKE ?)', like, like, like],
  ])
  const rows = await many(
    `SELECT c.id, c.slug, c.title, c.category, c.status, c.featured, c.goal, c.created_at, u.name AS owner_name, u.phone AS owner_phone,
       COALESCE((SELECT SUM(amount) FROM contributions WHERE campaign_id = c.id AND status = 'paid'), 0) AS raised,
       COALESCE((SELECT SUM(net) FROM contributions WHERE campaign_id = c.id AND status = 'paid'), 0)
         - COALESCE((SELECT SUM(amount) FROM withdrawals WHERE campaign_id = c.id AND status IN ('pending_review','processing','success')), 0) AS available,
       (SELECT COUNT(*) FROM contributions WHERE campaign_id = c.id AND status = 'paid') AS count
     FROM campaigns c JOIN users u ON u.id = c.owner_id
     ${w.sql} ORDER BY c.created_at DESC LIMIT ? OFFSET ?`,
    [...w.params, q.limit, q.offset]
  )
  res.json({ campaigns: rows })
})

r.patch('/campaigns/:id', async (req, res) => {
  const data = parse(z.object({ status: z.enum(['pending', 'active', 'closed', 'suspended']).optional(), featured: z.boolean().optional() }), req.body)
  const c = await one('SELECT id FROM campaigns WHERE id = ?', [req.params.id])
  if (!c) throw notFound()
  await exec(
    `UPDATE campaigns SET status = COALESCE(?, status), featured = COALESCE(?, featured), updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
    [data.status ?? null, data.featured ?? null, c.id]
  )
  await audit(req, 'admin.campaign_update', c.id, data)
  res.json({ campaign: await one('SELECT id, status, featured FROM campaigns WHERE id = ?', [c.id]) })
})

/* ---------- Paiements ---------- */
r.get('/payments', async (req, res) => {
  const q = parse(page, req.query)
  const like = q.q ? likeEscape(q.q) : undefined
  const w = where([
    ['k.status = ?', q.status],
    ['(k.donor_name LIKE ? OR c.title LIKE ? OR k.provider_token LIKE ?)', like, like, like],
  ])
  const rows = await many(
    `SELECT k.id, k.donor_name, k.anonymous, k.amount, k.donor_fee, k.commission, k.net, k.total_charged, k.channel, k.status,
       k.provider_token, k.provider_mode, k.receipt_url, k.created_at, k.paid_at, c.title, c.slug
     FROM contributions k JOIN campaigns c ON c.id = k.campaign_id
     ${w.sql} ORDER BY k.created_at DESC LIMIT ? OFFSET ?`,
    [...w.params, q.limit, q.offset]
  )
  res.json({ payments: rows })
})

/* ---------- Retraits ---------- */
r.get('/withdrawals', async (req, res) => {
  const q = parse(page, req.query)
  const w = where([['w.status = ?', q.status]])
  const rows = await many(
    `SELECT w.*, c.title, c.slug, u.name AS owner_name, u.phone AS owner_phone
     FROM withdrawals w JOIN campaigns c ON c.id = w.campaign_id JOIN users u ON u.id = w.owner_id
     ${w.sql} ORDER BY w.created_at DESC LIMIT ? OFFSET ?`,
    [...w.params, q.limit, q.offset]
  )
  res.json({ withdrawals: rows })
})

r.post('/withdrawals/:id/approve', async (req, res) => {
  await confirmAdminPassword(req, req.body?.password)
  const w = await tx(async (db) => {
    const row = await db.one('SELECT * FROM withdrawals WHERE id = ? FOR UPDATE', [req.params.id])
    if (!row) throw notFound()
    if (row.status !== 'pending_review') throw bad('Ce retrait a déjà été traité.')
    await db.exec(`UPDATE withdrawals SET status = 'processing', reviewed_by = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`, [req.user.id, row.id])
    return { ...row, status: 'processing' }
  })
  await audit(req, 'admin.withdrawal_approve', w.id, { amount: w.amount })
  res.json({ withdrawal: publicWithdrawal(await executePayout(w, req)) })
})

r.post('/withdrawals/:id/reject', async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(200) }), req.body)
  const upd = await exec(
    `UPDATE withdrawals SET status = 'rejected', failure_reason = ?, reviewed_by = ?, updated_at = CURRENT_TIMESTAMP(3)
     WHERE id = ? AND status = 'pending_review'`,
    [reason, req.user.id, req.params.id]
  )
  if (!upd.affectedRows) throw bad('Ce retrait ne peut plus être refusé.')
  await audit(req, 'admin.withdrawal_reject', req.params.id, { reason })
  res.json({ withdrawal: publicWithdrawal(await one('SELECT * FROM withdrawals WHERE id = ?', [req.params.id])) })
})

/* ---------- Utilisateurs ---------- */
r.get('/users', async (req, res) => {
  const q = parse(page, req.query)
  const like = q.q ? likeEscape(q.q) : undefined
  const w = where([['(name LIKE ? OR phone LIKE ? OR email LIKE ?)', like, like, like]])
  const rows = await many(
    `SELECT id, name, phone, email, role, status, created_at, last_login_at,
       (SELECT COUNT(*) FROM campaigns WHERE owner_id = users.id) AS campaigns
     FROM users ${w.sql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...w.params, q.limit, q.offset]
  )
  res.json({ users: rows })
})

r.patch('/users/:id', async (req, res) => {
  const data = parse(z.object({ status: z.enum(['active', 'suspended']).optional(), role: z.enum(['user', 'admin']).optional(), password: z.string().optional() }), req.body)
  if (req.params.id === req.user.id) throw forbidden('Vous ne pouvez pas modifier votre propre compte ici.')
  if (data.role) await confirmAdminPassword(req, data.password)
  const u = await one('SELECT id FROM users WHERE id = ?', [req.params.id])
  if (!u) throw notFound()
  // Suspension ou changement de rôle : toutes les sessions de l'utilisateur sont invalidées
  const revoke = data.status === 'suspended' || !!data.role
  await exec(
    `UPDATE users SET status = COALESCE(?, status), role = COALESCE(?, role), token_version = token_version + ? WHERE id = ?`,
    [data.status ?? null, data.role ?? null, revoke ? 1 : 0, u.id]
  )
  await audit(req, 'admin.user_update', u.id, { status: data.status, role: data.role })
  res.json({ user: await one('SELECT id, name, role, status FROM users WHERE id = ?', [u.id]) })
})

/* ---------- Journal ---------- */
r.get('/audit', async (req, res) => {
  const q = parse(page, req.query)
  const w = where([['a.action LIKE ?', q.q ? likeEscape(q.q) : undefined]])
  const rows = await many(
    `SELECT a.id, a.action, a.target, a.meta, a.ip, a.created_at, u.name AS actor_name
     FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
     ${w.sql} ORDER BY a.id DESC LIMIT ? OFFSET ?`,
    [...w.params, q.limit, q.offset]
  )
  res.json({ logs: rows.map((l) => ({ ...l, meta: safeJson(l.meta) })) })
})

const safeJson = (s) => {
  try {
    return s ? JSON.parse(s) : null
  } catch {
    return null
  }
}

export default r
