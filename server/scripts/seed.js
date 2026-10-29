/** Données de démonstration (développement uniquement) : npm run seed */
import { config } from '../config.js'
import { migrate, one, pool, query } from '../db.js'
import { hashPassword } from '../lib/auth.js'
import { splitContribution } from '../lib/money.js'
import { getSettings } from '../lib/settings.js'
import { seedState } from '../../src/data/seed.js'

if (config.isProd) {
  console.error('Le jeu de données de démonstration est interdit en production.')
  process.exit(1)
}

await migrate()
if (await one('SELECT 1 FROM campaigns LIMIT 1')) {
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
    owners[c.ownerName] = (await one(`INSERT INTO users(name, phone, password_hash) VALUES ($1,$2,$3) RETURNING id`, [c.ownerName, phone, pw])).id
  }
  const row = await one(
    `INSERT INTO campaigns(slug, owner_id, title, category, city, story, goal, deadline, featured, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [c.slug, owners[c.ownerName], c.title, c.category, c.city, c.story, c.goal, c.deadline, !!c.featured, c.createdAt]
  )
  for (const k of contributions.filter((x) => x.campaignId === c.id)) {
    const sp = splitContribution(k.amount, s)
    await query(
      `INSERT INTO contributions(campaign_id, donor_name, anonymous, message, amount, donor_fee, commission, net, total_charged, channel, status, provider_token, created_at, paid_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'paid',$11,$12,$12)`,
      [row.id, k.name, k.anonymous, k.message || null, sp.amount, sp.donor_fee, sp.commission, sp.net, sp.total_charged, k.method, `seed_${k.id}`, k.createdAt]
    )
  }
}
console.log(`✓ ${campaigns.length} cagnottes et ${contributions.length} participations de démonstration créées.`)
await pool.end()
