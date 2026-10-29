/**
 * Crée (ou promeut) un compte administrateur.
 * Usage : npm run create-admin -- --phone 771234567 --name "Abou Faty" --password "MotDePasseTrèsSolide"
 * Si le numéro existe déjà, le compte est simplement promu administrateur.
 */
import { parseArgs } from 'node:util'
import { migrate, one, pool } from '../db.js'
import { hashPassword } from '../lib/auth.js'
import { isSnPhone, normalizePhone } from '../lib/http.js'

const { values } = parseArgs({
  options: { phone: { type: 'string' }, name: { type: 'string' }, password: { type: 'string' } },
})
const phone = normalizePhone(values.phone || '')
if (!isSnPhone(phone)) {
  console.error('Numéro invalide. Exemple : --phone 771234567')
  process.exit(1)
}

await migrate()
const existing = await one('SELECT id FROM users WHERE phone = $1', [phone])
if (existing) {
  await one(`UPDATE users SET role = 'admin', status = 'active', token_version = token_version + 1 WHERE id = $1 RETURNING id`, [existing.id])
  console.log(`✓ Le compte ${phone} est maintenant administrateur.`)
} else {
  if (!values.password || values.password.length < 12) {
    console.error('Mot de passe administrateur requis (12 caractères minimum) : --password "..."')
    process.exit(1)
  }
  await one(`INSERT INTO users(name, phone, password_hash, role) VALUES ($1, $2, $3, 'admin') RETURNING id`, [
    values.name || 'Administrateur',
    phone,
    await hashPassword(values.password),
  ])
  console.log(`✓ Administrateur ${phone} créé.`)
}
await pool.end()
