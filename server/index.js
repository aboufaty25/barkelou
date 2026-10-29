import { config } from './config.js'
import { many, migrate } from './db.js'
import { createApp } from './app.js'
import { reconcile } from './routes/payments.js'
import { refreshPendingPayouts } from './routes/withdrawals.js'

await migrate()

const app = createApp()
app.listen(config.port, () => {
  console.log(`Barkelou API prête sur le port ${config.port} (${config.isProd ? 'production' : 'développement'})`)
  if (config.paydunyaMock) console.log('⚠ PayDunya simulé (PAYDUNYA_MOCK) : aucun argent réel ne circule')
})

/* Tâches de fond : rattrape les notifications PayDunya manquées */
async function sweep() {
  try {
    const pending = await many(
      `SELECT provider_token FROM contributions WHERE status = 'pending' AND provider_token IS NOT NULL
       AND created_at < now() - interval '2 minutes' AND created_at > now() - interval '2 days' ORDER BY created_at LIMIT 30`
    )
    for (const { provider_token } of pending) await reconcile(provider_token, null).catch(() => {})
    await refreshPendingPayouts()
  } catch (e) {
    console.error('sweep', e.message)
  }
}
setInterval(sweep, 60_000).unref()
