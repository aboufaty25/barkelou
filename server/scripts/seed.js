/** Données de démonstration (développement uniquement) : npm run seed */
import { config } from '../config.js'
import { exec, migrate, one, pool, uuid } from '../db.js'
import { hashPassword } from '../lib/auth.js'
import { splitContribution } from '../lib/money.js'
import { getSettings } from '../lib/settings.js'
import { seedState } from '../../src/data/seed.js'

if (config.isProd) {
  console.error('Le jeu de données de démonstration est interdit en production.')
  process.exit(1)
}

await migrate()
if (await one('SELECT 1 AS x FROM campaigns LIMIT 1')) {
  console.log('La base contient déjà des cagnottes : rien à faire.')
  process.exit(0)
}

const s = await getSettings()
const { campaigns, contributions } = seedState()
const owners = {}
let n = 0
const pw = await hashPassword('demo-barkelou-2026')

for (const c of campaigns) {
  if (!owners[c.ownerName]) {
    const phone = `77000${String(++n).padStart(4, '0')}`
    owners[c.ownerName] = uuid()
    await exec('INSERT INTO users(id, name, phone, password_hash) VALUES (?, ?, ?, ?)', [owners[c.ownerName], c.ownerName, phone, pw])
  }
  const row = { id: uuid() }
  await exec(
    `INSERT INTO campaigns(id, slug, owner_id, title, category, city, story, goal, deadline, featured, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, c.slug, owners[c.ownerName], c.title, c.category, c.city, c.story, c.goal, c.deadline, !!c.featured, new Date(c.createdAt)]
  )
  for (const k of contributions.filter((x) => x.campaignId === c.id)) {
    const sp = splitContribution(k.amount, s)
    await exec(
      `INSERT INTO contributions(id, campaign_id, donor_name, anonymous, message, amount, donor_fee, commission, net, total_charged, channel, status, provider_token, created_at, paid_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?, ?)`,
      [uuid(), row.id, k.name, k.anonymous, k.message || null, sp.amount, sp.donor_fee, sp.commission, sp.net, sp.total_charged, k.method, `seed_${k.id}`, new Date(k.createdAt), new Date(k.createdAt)]
    )
  }
}
console.log(`✓ ${campaigns.length} cagnottes et ${contributions.length} participations de démonstration créées.`)
await pool.end()
