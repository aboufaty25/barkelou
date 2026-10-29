import { Router } from 'express'
import { z } from 'zod'
import { exec, one, uuid } from '../db.js'
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

const USER_FIELDS = 'id, name, phone, email, role, status, token_version, created_at'
const LOCK_AFTER = 5
const LOCK_MINUTES = 15

r.post('/register', limiter.auth, async (req, res) => {
  const s = await getSettings()
  if (!s.allow_signups) throw new HttpError(403, 'Les inscriptions sont momentanément fermées.')
  const data = parse(registerSchema, req.body)
  if (await one('SELECT 1 FROM users WHERE phone = ?', [data.phone])) {
    throw bad('Un compte existe déjà avec ce numéro.')
  }
  const id = uuid()
  try {
    await exec(
      'INSERT INTO users(id, name, phone, email, password_hash, last_login_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3))',
      [id, data.name, data.phone, data.email || null, await hashPassword(data.password)]
    )
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw bad('Un compte existe déjà avec ce numéro.')
    throw e
  }
  const user = await one(`SELECT ${USER_FIELDS} FROM users WHERE id = ?`, [id])
  setSession(res, user)
  req.user = user
  await audit(req, 'user.register', user.id)
  res.status(201).json({ user: publicUser(user) })
})

r.post('/login', limiter.auth, async (req, res) => {
  const data = parse(z.object({ phone: z.string().max(30), password: z.string().max(128) }), req.body)
  const user = await one('SELECT * FROM users WHERE phone = ?', [normalizePhone(data.phone)])
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
    await exec(
      `UPDATE users SET failed_logins = ?,
         locked_until = IF(?, CURRENT_TIMESTAMP(3) + INTERVAL ${LOCK_MINUTES} MINUTE, locked_until)
       WHERE id = ?`,
      [lock ? 0 : fails, lock, user.id]
    )
    if (lock) await audit(req, 'user.locked', user.id)
    throw generic
  }
  if (user.status !== 'active') throw new HttpError(403, 'Ce compte est suspendu. Contactez le support.')

  await exec('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = CURRENT_TIMESTAMP(3) WHERE id = ?', [user.id])
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
  await exec('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [req.user.id])
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
  if (data.name !== undefined) await exec('UPDATE users SET name = ? WHERE id = ?', [data.name, req.user.id])
  if (data.email !== undefined) await exec('UPDATE users SET email = ? WHERE id = ?', [data.email || null, req.user.id])
  const user = await one(`SELECT ${USER_FIELDS} FROM users WHERE id = ?`, [req.user.id])
  res.json({ user: publicUser(user) })
})

r.post('/password', requireUser, limiter.auth, async (req, res) => {
  const data = parse(z.object({ current: z.string().max(128), next: password }), req.body)
  const u = await one('SELECT password_hash FROM users WHERE id = ?', [req.user.id])
  if (!(await checkPassword(data.current, u.password_hash))) throw bad('Mot de passe actuel incorrect.')
  await exec('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', [await hashPassword(data.next), req.user.id])
  const updated = await one('SELECT id, token_version FROM users WHERE id = ?', [req.user.id])
  setSession(res, updated)
  await audit(req, 'user.password_changed', req.user.id)
  res.json({ ok: true })
})

export default r
