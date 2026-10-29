import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { config } from '../config.js'
import { one } from '../db.js'
import { HttpError } from './http.js'

export const COOKIE = config.isProd ? '__Host-barkelou' : 'barkelou_session'
const MAX_AGE = 7 * 24 * 3600 * 1000

export const hashPassword = (pw) => bcrypt.hash(pw, 12)
export const checkPassword = (pw, hash) => bcrypt.compare(pw, hash)

// Hachage factice pour garder un temps de réponse constant quand le compte n'existe pas
export const DUMMY_HASH = bcrypt.hashSync('barkelou-dummy-password', 12)

export function setSession(res, user) {
  const token = jwt.sign({ sub: user.id, v: user.token_version }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: '7d',
  })
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  })
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { httpOnly: true, secure: config.isProd, sameSite: 'lax', path: '/' })
}

/** Charge l'utilisateur de la session (si valide) dans req.user */
export async function loadUser(req, _res, next) {
  const token = req.cookies?.[COOKIE]
  if (!token) return next()
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] })
    const user = await one(
      'SELECT id, name, phone, email, role, status, token_version, created_at FROM users WHERE id = $1',
      [payload.sub]
    )
    if (user && user.status === 'active' && user.token_version === payload.v) req.user = user
  } catch {
    /* jeton expiré ou falsifié : on ignore */
  }
  next()
}

export function requireUser(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Connectez-vous pour continuer.'))
  next()
}

export function requireAdmin(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Connectez-vous pour continuer.'))
  if (req.user.role !== 'admin') return next(new HttpError(403, 'Accès réservé aux administrateurs.'))
  next()
}

export const publicUser = (u) => u && { id: u.id, name: u.name, phone: u.phone, email: u.email || '', role: u.role, created_at: u.created_at }

/**
 * Protection CSRF : toute requête qui modifie des données doit
 * 1) porter l'en-tête X-Barkelou (impossible à envoyer depuis un autre site sans CORS)
 * 2) provenir de notre propre origine si l'en-tête Origin est présent.
 * Les notifications serveur-à-serveur de PayDunya sont exemptées (elles sont vérifiées par hash).
 */
export function csrfGuard(exempt = []) {
  const allowed = new Set([config.publicUrl])
  return (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
    if (exempt.some((p) => req.path === p)) return next()
    const origin = req.get('origin')
    if (origin && !allowed.has(origin) && !(!config.isProd && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))) {
      return next(new HttpError(403, 'Origine refusée.'))
    }
    if (req.get('x-barkelou') !== '1') return next(new HttpError(403, 'Requête refusée.'))
    next()
  }
}
