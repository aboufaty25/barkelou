import { Router } from 'express'
import { z } from 'zod'
import { many, one, tx } from '../db.js'
import { checkPassword, requireAdmin } from '../lib/auth.js'
import { audit, bad, forbidden, notFound, parse } from '../lib/http.js'
import { config } from '../config.js'
import { adminView, getSettings, saveSettings, settingsSchema, SECRET_KEYS } from '../lib/settings.js'
import { executePayout, publicWithdrawal } from './withdrawals.js'

const r = Router()
r.use(requireAdmin)

const page = z.object({
  q: z.string().max(80).optional(),
  status: z.string().max(20).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
})

async function confirmAdminPassword(req, password) {
  const u = await one('SELECT password_hash FROM users WHERE id = $1', [req.user.id])
  if (!password || !(await checkPassword(String(password), u.password_hash))) {
    await audit(req, 'admin.bad_password')
    throw bad('Mot de passe administrateur incorrect.')
  }
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
    (SELECT COUNT(*) FROM contributions WHERE status = 'paid')::int AS payments,
    (SELECT COUNT(*) FROM users)::int AS users,
    (SELECT COUNT(*) FROM campaigns)::int AS campaigns,
    (SELECT COUNT(*) FROM campaigns WHERE status = 'pending')::int AS campaigns_pending,
    (SELECT COUNT(*) FROM withdrawals WHERE status = 'pending_review')::int AS withdrawals_pending,
    (SELECT COUNT(*) FROM withdrawals WHERE status = 'processing')::int AS withdrawals_processing`)
  const daily = await many(`
    SELECT to_char(d, 'YYYY-MM-DD') AS day,
      COALESCE(SUM(k.amount), 0) AS amount, COALESCE(SUM(k.commission), 0) AS commission
    FROM generate_series(current_date - 29, current_date, interval '1 day') d
    LEFT JOIN contributions k ON k.status = 'paid' AND k.paid_at::date = d::date
    GROUP BY d ORDER BY d`)
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
  if (patch.min_contribution && patch.max_contribution && patch.min_contribution > patch.max_contribution) {
    throw bad('Le montant minimum de participation dépasse le maximum.')
  }
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
  const params = []
  const where = []
  if (q.status) {
    params.push(q.status)
    where.push(`c.status = $${params.length}`)
  }
  if (q.q) {
    params.push(`%${q.q}%`)
    where.push(`(c.title ILIKE $${params.length} OR u.name ILIKE $${params.length} OR u.phone ILIKE $${params.length})`)
  }
  params.push(q.limit, q.offset)
  const rows = await many(
    `SELECT c.id, c.slug, c.title, c.category, c.status, c.featured, c.goal, c.created_at, u.name AS owner_name, u.phone AS owner_phone,
       COALESCE((SELECT SUM(amount) FROM contributions WHERE campaign_id = c.id AND status = 'paid'), 0) AS raised,
       COALESCE((SELECT SUM(net) FROM contributions WHERE campaign_id = c.id AND status = 'paid'), 0)
         - COALESCE((SELECT SUM(amount) FROM withdrawals WHERE campaign_id = c.id AND status IN ('pending_review','processing','success')), 0) AS available,
       (SELECT COUNT(*) FROM contributions WHERE campaign_id = c.id AND status = 'paid')::int AS count
     FROM campaigns c JOIN users u ON u.id = c.owner_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY c.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  )
  res.json({ campaigns: rows })
})

r.patch('/campaigns/:id', async (req, res) => {
  const data = parse(z.object({ status: z.enum(['pending', 'active', 'closed', 'suspended']).optional(), featured: z.boolean().optional() }), req.body)
  const c = await one(
    `UPDATE campaigns SET status = COALESCE($2, status), featured = COALESCE($3, featured), updated_at = now()
     WHERE id = $1 RETURNING id, status, featured`,
    [req.params.id, data.status ?? null, data.featured ?? null]
  )
  if (!c) throw notFound()
  await audit(req, 'admin.campaign_update', c.id, data)
  res.json({ campaign: c })
})

/* ---------- Paiements ---------- */
r.get('/payments', async (req, res) => {
  const q = parse(page, req.query)
  const params = []
  const where = []
  if (q.status) {
    params.push(q.status)
    where.push(`k.status = $${params.length}`)
  }
  if (q.q) {
    params.push(`%${q.q}%`)
    where.push(`(k.donor_name ILIKE $${params.length} OR c.title ILIKE $${params.length} OR k.provider_token ILIKE $${params.length})`)
  }
  params.push(q.limit, q.offset)
  const rows = await many(
    `SELECT k.id, k.donor_name, k.anonymous, k.amount, k.donor_fee, k.commission, k.net, k.total_charged, k.channel, k.status,
       k.provider_token, k.provider_mode, k.receipt_url, k.created_at, k.paid_at, c.title, c.slug
     FROM contributions k JOIN campaigns c ON c.id = k.campaign_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY k.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  )
  res.json({ payments: rows })
})

/* ---------- Retraits ---------- */
r.get('/withdrawals', async (req, res) => {
  const q = parse(page, req.query)
  const params = []
  const where = []
  if (q.status) {
    params.push(q.status)
    where.push(`w.status = $${params.length}`)
  }
  params.push(q.limit, q.offset)
  const rows = await many(
    `SELECT w.*, c.title, c.slug, u.name AS owner_name, u.phone AS owner_phone
     FROM withdrawals w JOIN campaigns c ON c.id = w.campaign_id JOIN users u ON u.id = w.owner_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY w.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  )
  res.json({ withdrawals: rows })
})

r.post('/withdrawals/:id/approve', async (req, res) => {
  await confirmAdminPassword(req, req.body?.password)
  const w = await tx(async (db) => {
    const row = (await db.query('SELECT * FROM withdrawals WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0]
    if (!row) throw notFound()
    if (row.status !== 'pending_review') throw bad('Ce retrait a déjà été traité.')
    return (await db.query(`UPDATE withdrawals SET status = 'processing', reviewed_by = $2, updated_at = now() WHERE id = $1 RETURNING *`, [row.id, req.user.id])).rows[0]
  })
  await audit(req, 'admin.withdrawal_approve', w.id, { amount: w.amount })
  res.json({ withdrawal: publicWithdrawal(await executePayout(w, req)) })
})

r.post('/withdrawals/:id/reject', async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(200) }), req.body)
  const w = await one(
    `UPDATE withdrawals SET status = 'rejected', failure_reason = $2, reviewed_by = $3, updated_at = now()
     WHERE id = $1 AND status = 'pending_review' RETURNING *`,
    [req.params.id, reason, req.user.id]
  )
  if (!w) throw bad('Ce retrait ne peut plus être refusé.')
  await audit(req, 'admin.withdrawal_reject', w.id, { reason })
  res.json({ withdrawal: publicWithdrawal(w) })
})

/* ---------- Utilisateurs ---------- */
r.get('/users', async (req, res) => {
  const q = parse(page, req.query)
  const params = []
  const where = []
  if (q.q) {
    params.push(`%${q.q}%`)
    where.push(`(name ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1)`)
  }
  params.push(q.limit, q.offset)
  const rows = await many(
    `SELECT id, name, phone, email, role, status, created_at, last_login_at,
       (SELECT COUNT(*) FROM campaigns WHERE owner_id = users.id)::int AS campaigns
     FROM users ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  )
  res.json({ users: rows })
})

r.patch('/users/:id', async (req, res) => {
  const data = parse(z.object({ status: z.enum(['active', 'suspended']).optional(), role: z.enum(['user', 'admin']).optional(), password: z.string().optional() }), req.body)
  if (req.params.id === req.user.id) throw forbidden('Vous ne pouvez pas modifier votre propre compte ici.')
  if (data.role) await confirmAdminPassword(req, data.password)
  const u = await one(
    `UPDATE users SET status = COALESCE($2, status), role = COALESCE($3, role),
       token_version = CASE WHEN $2 = 'suspended' OR $3 IS NOT NULL THEN token_version + 1 ELSE token_version END
     WHERE id = $1 RETURNING id, name, role, status`,
    [req.params.id, data.status ?? null, data.role ?? null]
  )
  if (!u) throw notFound()
  await audit(req, 'admin.user_update', u.id, { status: data.status, role: data.role })
  res.json({ user: u })
})

/* ---------- Journal ---------- */
r.get('/audit', async (req, res) => {
  const q = parse(page, req.query)
  const rows = await many(
    `SELECT a.id, a.action, a.target, a.meta, a.ip, a.created_at, u.name AS actor_name
     FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
     ${q.q ? `WHERE a.action ILIKE $3` : ''}
     ORDER BY a.id DESC LIMIT $1 OFFSET $2`,
    q.q ? [q.limit, q.offset, `%${q.q}%`] : [q.limit, q.offset]
  )
  res.json({ logs: rows })
})

export default r
