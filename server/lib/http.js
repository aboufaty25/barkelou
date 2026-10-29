import { query } from '../db.js'

export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message)
    this.status = status
    this.extra = extra
  }
}

export const bad = (msg, extra) => new HttpError(400, msg, extra)
export const forbidden = (msg = 'Action non autorisée.') => new HttpError(403, msg)
export const notFound = (msg = 'Introuvable.') => new HttpError(404, msg)

/** Valide req.body avec un schéma zod et renvoie les données nettoyées */
export function parse(schema, data) {
  const r = schema.safeParse(data)
  if (!r.success) {
    const issue = r.error.issues[0]
    const field = issue?.path?.join('.')
    throw bad(field ? `Champ invalide : ${field}` : 'Données invalides.', { field, issues: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) })
  }
  return r.data
}

export const clientIp = (req) => req.ip || req.socket?.remoteAddress || ''

export async function audit(req, action, target, meta) {
  try {
    await query('INSERT INTO audit_logs(actor_id, action, target, meta, ip) VALUES ($1, $2, $3, $4, $5)', [
      req?.user?.id || null,
      action,
      target ? String(target) : null,
      meta ? JSON.stringify(meta) : null,
      req ? clientIp(req) : null,
    ])
  } catch (e) {
    console.error('audit failed', e.message)
  }
}

export const normalizePhone = (v = '') => String(v).replace(/\D/g, '').replace(/^221/, '')
export const isSnPhone = (v) => /^7[05678]\d{7}$/.test(normalizePhone(v))
