import { Router } from 'express'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { many, one, query } from '../db.js'
import { requireUser } from '../lib/auth.js'
import { audit, bad, forbidden, notFound, parse } from '../lib/http.js'
import { limiter } from '../lib/limits.js'
import { campaignBalance } from '../lib/money.js'
import { getSettings } from '../lib/settings.js'

const r = Router()

export const CATEGORIES = ['mariage', 'bapteme', 'sante', 'education', 'solidarite', 'projet', 'religion', 'deces', 'sport', 'anniversaire']

const slugify = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'cagnotte'

/** Vérifie qu'une image envoyée est bien un JPEG/PNG/WebP de taille raisonnable */
function validCover(dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!m) return false
  const buf = Buffer.from(m[2], 'base64')
  if (buf.length > 1_500_000) return false
  const sig = buf.subarray(0, 12)
  if (m[1] === 'jpeg') return sig[0] === 0xff && sig[1] === 0xd8 && sig[2] === 0xff
  if (m[1] === 'png') return sig.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  return sig.subarray(0, 4).toString() === 'RIFF' && sig.subarray(8, 12).toString() === 'WEBP'
}

const campaignSchema = z.object({
  title: z.string().trim().min(6).max(80),
  category: z.enum(CATEGORIES),
  city: z.string().trim().max(40).optional().default(''),
  story: z.string().trim().min(30).max(3000),
  goal: z.number().int().min(10_000),
  deadline: z.union([z.null(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional().default(null),
  cover: z.union([z.null(), z.string().max(2_100_000)]).optional(),
  hide_amounts: z.boolean().optional().default(false),
})

// Agrégats publics : on affiche le montant donné (pas le net après commission)
const STATS = `
  COALESCE(st.raised, 0) AS raised, COALESCE(st.count, 0) AS count
  FROM campaigns c
  JOIN users u ON u.id = c.owner_id
  LEFT JOIN LATERAL (
    SELECT SUM(amount) AS raised, COUNT(*)::int AS count FROM contributions k
    WHERE k.campaign_id = c.id AND k.status = 'paid'
  ) st ON true`

const FIELDS = `c.id, c.slug, c.title, c.category, c.city, c.goal, c.deadline, c.hide_amounts, c.featured, c.status,
  c.created_at, c.updated_at, c.owner_id, u.name AS owner_name, (c.cover IS NOT NULL) AS has_cover`

export function serialize(c) {
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    category: c.category,
    city: c.city || '',
    story: c.story,
    goal: c.goal,
    deadline: c.deadline ? new Date(c.deadline).toISOString().slice(0, 10) : null,
    hideAmounts: c.hide_amounts,
    featured: c.featured,
    status: c.status,
    createdAt: c.created_at,
    ownerId: c.owner_id,
    ownerName: c.owner_name,
    cover: c.has_cover ? `/api/campaigns/${c.id}/cover?v=${new Date(c.updated_at).getTime()}` : null,
    raised: c.hide_amounts && c.viewer_is_owner !== true ? null : c.raised,
    percent: c.hide_amounts && c.viewer_is_owner !== true ? null : c.goal ? Math.min(100, Math.round((c.raised / c.goal) * 100)) : 0,
    count: c.count,
  }
}

r.get('/stats', async (_req, res) => {
  const s = await one(`SELECT
    COALESCE((SELECT SUM(amount) FROM contributions WHERE status = 'paid'), 0) AS raised,
    (SELECT COUNT(*) FROM contributions WHERE status = 'paid')::int AS contributions,
    (SELECT COUNT(*) FROM campaigns WHERE status IN ('active', 'closed'))::int AS campaigns`)
  res.set('Cache-Control', 'public, max-age=60').json(s)
})

r.get('/campaigns', async (req, res) => {
  const q = parse(
    z.object({
      q: z.string().max(80).optional(),
      cat: z.enum(CATEGORIES).optional(),
      sort: z.enum(['populaire', 'recent', 'urgent', 'proche', 'une']).optional().default('populaire'),
      limit: z.coerce.number().int().min(1).max(50).optional().default(24),
      offset: z.coerce.number().int().min(0).max(10_000).optional().default(0),
    }),
    req.query
  )
  const params = []
  const where = [`c.status = 'active'`]
  if (q.cat) {
    params.push(q.cat)
    where.push(`c.category = $${params.length}`)
  }
  if (q.q) {
    params.push(`%${q.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`)
    where.push(`(unaccent_simple(c.title) ILIKE unaccent_simple($${params.length}) OR unaccent_simple(coalesce(c.city,'')) ILIKE unaccent_simple($${params.length}) OR unaccent_simple(u.name) ILIKE unaccent_simple($${params.length}))`)
  }
  const order = {
    populaire: 'count DESC, c.created_at DESC',
    recent: 'c.created_at DESC',
    urgent: 'c.deadline ASC NULLS LAST, c.created_at DESC',
    proche: '(COALESCE(st.raised,0)::float / c.goal) DESC',
    une: 'c.featured DESC, count DESC',
  }[q.sort]
  params.push(q.limit, q.offset)
  const rows = await many(
    `SELECT ${FIELDS}, ${STATS} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  )
  res.json({ campaigns: rows.map(serialize) })
})

r.get('/campaigns/mine', requireUser, async (req, res) => {
  const rows = await many(`SELECT ${FIELDS}, true AS viewer_is_owner, ${STATS} WHERE c.owner_id = $1 ORDER BY c.created_at DESC`, [req.user.id])
  const out = []
  for (const c of rows) out.push({ ...serialize(c), balance: await campaignBalance(c.id) })
  res.json({ campaigns: out })
})

r.get('/campaigns/:slug', async (req, res) => {
  const c = await one(`SELECT ${FIELDS}, c.story, ${STATS} WHERE c.slug = $1`, [req.params.slug])
  if (!c) throw notFound('Cette cagnotte n’existe pas.')
  const isOwner = req.user?.id === c.owner_id
  const isAdmin = req.user?.role === 'admin'
  if (!['active', 'closed'].includes(c.status) && !isOwner && !isAdmin) throw notFound('Cette cagnotte n’existe pas.')
  c.viewer_is_owner = isOwner || isAdmin

  const contributions = await many(
    `SELECT id, donor_name, anonymous, message, amount, channel, paid_at FROM contributions
     WHERE campaign_id = $1 AND status = 'paid' ORDER BY paid_at DESC LIMIT 200`,
    [c.id]
  )
  const showAmounts = !c.hide_amounts || isOwner || isAdmin
  const fav = req.user ? await one('SELECT 1 FROM favorites WHERE user_id = $1 AND campaign_id = $2', [req.user.id, c.id]) : null

  res.json({
    campaign: { ...serialize(c), isOwner, isFavorite: !!fav },
    contributions: contributions.map((k) => ({
      id: k.id,
      name: k.anonymous && !isOwner && !isAdmin ? 'Anonyme' : k.donor_name,
      anonymous: k.anonymous,
      message: k.message || '',
      amount: showAmounts ? k.amount : null,
      method: k.channel,
      createdAt: k.paid_at,
    })),
    balance: isOwner ? await campaignBalance(c.id) : undefined,
  })
})

r.get('/campaigns/:id/cover', async (req, res) => {
  if (!z.uuid().safeParse(req.params.id).success) throw notFound()
  const c = await one('SELECT cover FROM campaigns WHERE id = $1', [req.params.id])
  if (!c?.cover) throw notFound()
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(c.cover)
  if (!m) throw notFound()
  res.set({ 'Content-Type': m[1], 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' })
  res.send(Buffer.from(m[2], 'base64'))
})

r.post('/campaigns', requireUser, limiter.write, async (req, res) => {
  const s = await getSettings()
  const data = parse(campaignSchema, req.body)
  if (data.goal > s.max_campaign_goal) throw bad(`Objectif maximum : ${s.max_campaign_goal.toLocaleString('fr-FR')} F`)
  if (data.cover && !validCover(data.cover)) throw bad('Image de couverture invalide (JPEG, PNG ou WebP, 1,5 Mo max).')
  if (data.deadline && data.deadline <= new Date().toISOString().slice(0, 10)) throw bad('La date limite doit être dans le futur.')

  let slug = slugify(data.title)
  if (await one('SELECT 1 FROM campaigns WHERE slug = $1', [slug])) slug = `${slug}-${randomBytes(3).toString('hex')}`

  const c = await one(
    `INSERT INTO campaigns(slug, owner_id, title, category, city, story, goal, deadline, cover, hide_amounts, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, slug, status`,
    [slug, req.user.id, data.title, data.category, data.city, data.story, data.goal, data.deadline, data.cover || null, data.hide_amounts, s.auto_publish_campaigns ? 'active' : 'pending']
  )
  await audit(req, 'campaign.create', c.id, { title: data.title, goal: data.goal })
  res.status(201).json({ campaign: c })
})

r.patch('/campaigns/:id', requireUser, limiter.write, async (req, res) => {
  const c = await one('SELECT * FROM campaigns WHERE id = $1', [req.params.id])
  if (!c) throw notFound()
  if (c.owner_id !== req.user.id) throw forbidden()
  const s = await getSettings()
  const data = parse(campaignSchema.partial().extend({ status: z.enum(['active', 'closed']).optional() }), req.body)
  if (data.status && c.status === 'suspended') throw forbidden('Cette cagnotte a été suspendue par l’équipe Barkelou.')
  if (data.status && c.status === 'pending') throw forbidden('Cette cagnotte est en attente de validation.')
  if (data.goal && data.goal > s.max_campaign_goal) throw bad('Objectif trop élevé.')
  if (data.cover && !validCover(data.cover)) throw bad('Image de couverture invalide.')

  const cols = ['title', 'category', 'city', 'story', 'goal', 'deadline', 'cover', 'hide_amounts', 'status']
  const sets = []
  const vals = [c.id]
  for (const k of cols) {
    if (data[k] === undefined || !(k in req.body)) continue
    vals.push(data[k])
    sets.push(`${k} = $${vals.length}`)
  }
  if (sets.length) await query(`UPDATE campaigns SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, vals)
  await audit(req, 'campaign.update', c.id, { fields: Object.keys(req.body).filter((k) => cols.includes(k)) })
  res.json({ ok: true })
})

r.delete('/campaigns/:id', requireUser, async (req, res) => {
  const c = await one('SELECT * FROM campaigns WHERE id = $1', [req.params.id])
  if (!c) throw notFound()
  if (c.owner_id !== req.user.id) throw forbidden()
  const hasMoney = await one(`SELECT 1 FROM contributions WHERE campaign_id = $1 AND status IN ('paid', 'pending') LIMIT 1`, [c.id])
  if (hasMoney) throw bad('Une cagnotte qui a reçu des participations ne peut pas être supprimée. Vous pouvez la clôturer.')
  await query(`DELETE FROM contributions WHERE campaign_id = $1`, [c.id])
  await query('DELETE FROM campaigns WHERE id = $1', [c.id])
  await audit(req, 'campaign.delete', c.id, { title: c.title })
  res.json({ ok: true })
})

/* Favoris */
r.get('/favorites', requireUser, async (req, res) => {
  const rows = await many(
    `SELECT ${FIELDS}, ${STATS} JOIN favorites f ON f.campaign_id = c.id AND f.user_id = $1
     WHERE c.status IN ('active', 'closed') ORDER BY f.created_at DESC`,
    [req.user.id]
  )
  res.json({ campaigns: rows.map(serialize) })
})

r.put('/campaigns/:id/favorite', requireUser, async (req, res) => {
  if (!z.uuid().safeParse(req.params.id).success) throw notFound()
  await query('INSERT INTO favorites(user_id, campaign_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.user.id, req.params.id])
  res.json({ favorite: true })
})

r.delete('/campaigns/:id/favorite', requireUser, async (req, res) => {
  await query('DELETE FROM favorites WHERE user_id = $1 AND campaign_id = $2', [req.user.id, req.params.id])
  res.json({ favorite: false })
})

/* Activité de l'utilisateur */
r.get('/me/activity', requireUser, async (req, res) => {
  const received = await many(
    `SELECT k.id, k.donor_name, k.anonymous, k.amount, k.channel, k.paid_at, c.title, c.slug
     FROM contributions k JOIN campaigns c ON c.id = k.campaign_id
     WHERE c.owner_id = $1 AND k.status = 'paid' ORDER BY k.paid_at DESC LIMIT 10`,
    [req.user.id]
  )
  const given = await many(
    `SELECT k.id, k.amount, k.channel, k.paid_at, c.title, c.slug
     FROM contributions k JOIN campaigns c ON c.id = k.campaign_id
     WHERE k.user_id = $1 AND k.status = 'paid' ORDER BY k.paid_at DESC LIMIT 20`,
    [req.user.id]
  )
  const withdrawals = await many(
    `SELECT w.id, w.amount, w.fee, w.payout, w.method, w.phone, w.status, w.failure_reason, w.created_at, c.title, c.slug
     FROM withdrawals w JOIN campaigns c ON c.id = w.campaign_id WHERE w.owner_id = $1 ORDER BY w.created_at DESC LIMIT 20`,
    [req.user.id]
  )
  res.json({ received, given, withdrawals })
})

export default r
