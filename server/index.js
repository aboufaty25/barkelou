import { config } from './config.js'
import { exec, many, migrate, one } from './db.js'
import { createApp } from './app.js'
import { reconcile } from './routes/payments.js'
import { refreshPendingPayouts } from './routes/withdrawals.js'

await migrate()

/*
 * Premier administrateur sans SSH : inscrivez-vous normalement sur le site,
 * puis définissez ADMIN_PHONE=77XXXXXXX dans les variables d'environnement et redémarrez.
 */
if (process.env.ADMIN_PHONE) {
  const phone = process.env.ADMIN_PHONE.replace(/\D/g, '').replace(/^221/, '')
  const u = await one('SELECT id, role FROM users WHERE phone = ?', [phone])
  if (u && u.role !== 'admin') {
    await exec(`UPDATE users SET role = 'admin', token_version = token_version + 1 WHERE id = ?`, [u.id])
    console.log(`✓ ${phone} est maintenant administrateur (ADMIN_PHONE)`)
  } else if (!u) console.warn(`ADMIN_PHONE : aucun compte avec le numéro ${phone}. Inscrivez-vous d'abord sur le site.`)
}

/*
 * Tâche de fond : rattrape les notifications PayDunya manquées
 * (paiements restés « en attente », retraits « en cours »).
 * Sur Hostinger, l'application peut être mise en veille quand personne ne la visite :
 * la tâche est donc aussi déclenchée par les visites (au plus une fois par minute).
 */
let lastSweep = 0
let sweeping = false
async function sweep() {
  if (sweeping || Date.now() - lastSweep < 55_000) return
  sweeping = true
  lastSweep = Date.now()
  try {
    const pending = await many(
      `SELECT provider_token FROM contributions WHERE status = 'pending' AND provider_token IS NOT NULL
       AND created_at < CURRENT_TIMESTAMP(3) - INTERVAL 2 MINUTE AND created_at > CURRENT_TIMESTAMP(3) - INTERVAL 2 DAY
       ORDER BY created_at LIMIT 30`
    )
    for (const { provider_token } of pending) await reconcile(provider_token, null).catch(() => {})
    await refreshPendingPayouts()
  } catch (e) {
    console.error('sweep', e.message)
  } finally {
    sweeping = false
  }
}

const app = createApp({ onRequest: () => setImmediate(sweep) })
app.listen(config.port, () => {
  console.log(`Barkelou prêt sur le port ${config.port} (${config.isProd ? 'production' : 'développement'})`)
  if (config.paydunyaMock) console.log('⚠ PayDunya simulé (PAYDUNYA_MOCK) : aucun argent réel ne circule')
})
setInterval(sweep, 60_000).unref()
