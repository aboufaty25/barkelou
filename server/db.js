import pg from 'pg'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { config } from './config.js'

// bigint (int8) -> Number : les montants FCFA restent largement sous 2^53
pg.types.setTypeParser(20, (v) => Number(v))
// numeric (résultat des SUM) -> Number
pg.types.setTypeParser(1700, (v) => Number(v))

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
  max: 10,
})

export const query = (text, params) => pool.query(text, params)
export const one = async (text, params) => (await pool.query(text, params)).rows[0] || null
export const many = async (text, params) => (await pool.query(text, params)).rows

/** Exécute fn dans une transaction (BEGIN/COMMIT/ROLLBACK) */
export async function tx(fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

export async function migrate() {
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`)
  const dir = join(config.root, 'server', 'migrations')
  const done = new Set((await many('SELECT name FROM schema_migrations')).map((r) => r.name))
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue
    await tx(async (c) => {
      await c.query(readFileSync(join(dir, file), 'utf8'))
      await c.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file])
    })
    if (!config.isTest) console.log(`✓ migration ${file}`)
  }
}
