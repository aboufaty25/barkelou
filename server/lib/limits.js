import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { config } from '../config.js'

const make = (windowMs, limit, message, byUser = false) =>
  rateLimit({
    windowMs,
    limit: config.isTest ? 10_000 : limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: byUser ? (req) => req.user?.id || ipKeyGenerator(req.ip) : (req) => ipKeyGenerator(req.ip),
    handler: (_req, res) => res.status(429).json({ error: message }),
  })

export const limiter = {
  global: make(15 * 60_000, 600, 'Trop de requêtes, réessayez dans un instant.'),
  auth: make(15 * 60_000, 20, 'Trop de tentatives de connexion. Réessayez dans 15 minutes.'),
  payment: make(10 * 60_000, 30, 'Trop de paiements lancés. Patientez quelques minutes.'),
  withdraw: make(60 * 60_000, 10, 'Trop de demandes de retrait. Réessayez plus tard.', true),
  write: make(10 * 60_000, 60, 'Trop de modifications. Patientez un instant.', true),
}
