import express from 'express'
import helmet from 'helmet'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { config } from './config.js'
import { csrfGuard, loadUser } from './lib/auth.js'
import { HttpError } from './lib/http.js'
import { limiter } from './lib/limits.js'
import { getSettings, publicView } from './lib/settings.js'
import { isConfigured } from './lib/paydunya.js'
import authRoutes from './routes/auth.js'
import campaignRoutes from './routes/campaigns.js'
import paymentRoutes from './routes/payments.js'
import withdrawalRoutes from './routes/withdrawals.js'
import adminRoutes from './routes/admin.js'

export function createApp({ onRequest } = {}) {
  const app = express()
  app.disable('x-powered-by')
  const tp = config.trustProxy
  app.set('trust proxy', tp === 'false' ? false : tp === 'true' ? true : /^\d+$/.test(tp) ? Number(tp) : tp)

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'https://fonts.gstatic.com'],
          'img-src': ["'self'", 'data:', 'blob:'],
          'connect-src': ["'self'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
          'frame-ancestors': ["'none'"],
          'form-action': ["'self'"],
          'object-src': ["'none'"],
          'base-uri': ["'self'"],
          'upgrade-insecure-requests': config.isProd ? [] : null,
        },
      },
      strictTransportSecurity: config.isProd ? { maxAge: 63072000, includeSubDomains: true, preload: true } : false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      crossOriginEmbedderPolicy: false,
    })
  )
  app.use((_req, res, next) => {
    res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
    next()
  })
  app.use(compression())
  app.use(cookieParser())

  /* ---------------- API ---------------- */
  const api = express.Router()
  api.use(express.json({ limit: '2.5mb' }))
  api.use(limiter.global)
  api.use(loadUser)
  api.use(csrfGuard(['/payments/ipn', '/withdrawals/callback']))
  api.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })

  if (onRequest) api.use((_req, _res, next) => (onRequest(), next()))
  api.get('/health', (_req, res) => res.json({ ok: true }))
  api.get('/settings', async (_req, res) => {
    const s = await getSettings()
    res.json({ ...publicView(s), payments_ready: isConfigured(s), payments_simulated: config.paydunyaMock })
  })

  // Mode maintenance : seules les lectures, la connexion, l'admin et les notifications PayDunya passent
  api.use(async (req, _res, next) => {
    if (['GET', 'HEAD'].includes(req.method)) return next()
    if (/^\/(auth\/(login|logout|me)|admin|payments\/ipn|withdrawals\/callback)/.test(req.path)) return next()
    if (req.user?.role === 'admin') return next()
    const s = await getSettings()
    if (s.maintenance_mode) return next(new HttpError(503, s.maintenance_message))
    next()
  })

  api.use('/auth', authRoutes)
  api.use('/admin', adminRoutes)
  api.use(campaignRoutes)
  api.use(paymentRoutes)
  api.use(withdrawalRoutes)
  api.use((_req, _res, next) => next(new HttpError(404, 'Route inconnue.')))
  app.use('/api', api)

  /* ---------------- Application (fichiers statiques) ---------------- */
  const dist = join(config.root, 'dist')
  if (existsSync(dist)) {
    app.use(
      express.static(dist, {
        index: false,
        setHeaders(res, path) {
          if (/[\\/]assets[\\/]/.test(path)) res.set('Cache-Control', 'public, max-age=31536000, immutable')
          else if (/(sw\.js|workbox-.*\.js|manifest\.webmanifest)$/.test(path)) res.set('Cache-Control', 'no-cache')
        },
      })
    )
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.set('Cache-Control', 'no-cache').sendFile(join(dist, 'index.html'))
    })
  }

  /* ---------------- Erreurs ---------------- */
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Fichier ou requête trop volumineux.' })
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Requête invalide.' })
    const status = err instanceof HttpError ? err.status : 500
    if (status >= 500 && !(err instanceof HttpError)) console.error(`[${req.method} ${req.path}]`, err)
    res.status(status).json({
      error: err instanceof HttpError ? err.message : 'Une erreur est survenue. Réessayez dans un instant.',
      ...(err instanceof HttpError && err.extra ? { details: err.extra } : {}),
    })
  })

  return app
}
