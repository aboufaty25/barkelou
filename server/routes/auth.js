import { Router } from 'express'
import { z } from 'zod'
import { one, query } from '../db.js'
import { DUMMY_HASH, checkPassword, clearSession, hashPassword, publicUser, requireUser, setSession } from '../lib/auth.js'
import { HttpError, audit, bad, isSnPhone, normalizePhone, parse } from '../lib/http.js'
import { getSettings } from '../lib/settings.js'
import { limiter } from '../lib/limits.js'

const r = Router()

const password = z.string().min(8, '8 caractères minimum').max(128)
const phone = z.string().transform(normalizePhone).refine(isSnPhone, 'Numéro sénégalais invalide')

const registerSchema = z.object({
  name: z.string().trim().min(2).max(60),
  phone,
  email: z.union([z.literal(''), z.email().max(120)]).optional(),
  password,
})

const LOCK_AFTER = 5
const LOCK_MINUTES = 15

r.post('/register', limiter.auth, async (req, res) => {
  const s = await getSettings()
  if (!s.allow_signups) throw new HttpError(403, 'Les inscriptions sont momentanément fermées.')
  const data = parse(registerSchema, req.body)
  if (await one('SELECT 1 FROM users WHERE phone = $1', [data.phone])) {
    throw bad('Un compte existe déjà avec ce numéro.')
  }
  const user = await one(
    `INSERT INTO users(name, phone, email, password_hash, last_login_at) VALUES ($1, $2, $3, $4, now())
     RETURNING id, name, phone, email, role, status, token_version, created_at`,
    [data.name, data.phone, data.email || null, await hashPassword(data.password)]
  )
  setSession(res, user)
  req.user = user
  await audit(req, 'user.register', user.id)
  res.status(201).json({ user: publicUser(user) })
})

r.post('/login', limiter.auth, async (req, res) => {
  const data = parse(z.object({ phone: z.string().max(30), password: z.string().max(128) }), req.body)
  const user = await one('SELECT * FROM users WHERE phone = $1', [normalizePhone(data.phone)])
  const generic = bad('Numéro ou mot de passe incorrect.')

  if (!user) {
    await checkPassword(data.password, DUMMY_HASH)
    throw generic
  }
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new HttpError(429, 'Trop de tentatives. Réessayez dans quelques minutes.')
  }
  if (!(await checkPassword(data.password, user.password_hash))) {
    const fails = user.failed_logins + 1
    const lock = fails >= LOCK_AFTER
    await query(
      `UPDATE users SET failed_logins = $2,
         locked_until = CASE WHEN $3 THEN now() + interval '${LOCK_MINUTES} minutes' ELSE locked_until END
       WHERE id = $1`,
      [user.id, lock ? 0 : fails, lock]
    )
    if (lock) await audit(req, 'user.locked', user.id)
    throw generic
  }
  if (user.status !== 'active') throw new HttpError(403, 'Ce compte est suspendu. Contactez le support.')

  await query('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [user.id])
  setSession(res, user)
  req.user = user
  await audit(req, 'user.login', user.id)
  res.json({ user: publicUser(user) })
})

r.post('/logout', (req, res) => {
  clearSession(res)
  res.json({ ok: true })
})

/** Déconnecte toutes les sessions (tous appareils) */
r.post('/logout-all', requireUser, async (req, res) => {
  await query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [req.user.id])
  clearSession(res)
  await audit(req, 'user.logout_all', req.user.id)
  res.json({ ok: true })
})

r.get('/me', (req, res) => {
  res.json({ user: publicUser(req.user) || null })
})

r.patch('/me', requireUser, async (req, res) => {
  const data = parse(
    z.object({ name: z.string().trim().min(2).max(60).optional(), email: z.union([z.literal(''), z.email().max(120)]).optional() }),
    req.body
  )
  const user = await one(
    `UPDATE users SET name = COALESCE($2, name), email = CASE WHEN $3::text IS NULL THEN email ELSE NULLIF($3, '') END
     WHERE id = $1 RETURNING id, name, phone, email, role, status, token_version, created_at`,
    [req.user.id, data.name ?? null, data.email ?? null]
  )
  res.json({ user: publicUser(user) })
})

r.post('/password', requireUser, limiter.auth, async (req, res) => {
  const data = parse(z.object({ current: z.string().max(128), next: password }), req.body)
  const u = await one('SELECT password_hash FROM users WHERE id = $1', [req.user.id])
  if (!(await checkPassword(data.current, u.password_hash))) throw bad('Mot de passe actuel incorrect.')
  const updated = await one(
    'UPDATE users SET password_hash = $2, token_version = token_version + 1 WHERE id = $1 RETURNING id, token_version',
    [req.user.id, await hashPassword(data.next)]
  )
  setSession(res, updated)
  await audit(req, 'user.password_changed', req.user.id)
  res.json({ ok: true })
})

export default r
