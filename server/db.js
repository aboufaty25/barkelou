import mysql from 'mysql2/promise'
import { randomUUID } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { config } from './config.js'

/**
 * Connexion MySQL / MariaDB (Hostinger : hôte 127.0.0.1, port 3306).
 * - DECIMAL (résultats des SUM) convertis en nombres
 * - TINYINT(1) convertis en booléens
 * - dates en UTC, colonnes DATE renvoyées telles quelles ('AAAA-MM-JJ')
 */
const base = {
  waitForConnections: true,
  connectionLimit: 10,
  timezone: 'Z',
  dateStrings: ['DATE'],
  decimalNumbers: true,
  charset: 'utf8mb4_unicode_ci',
  ssl: config.db.ssl ? { rejectUnauthorized: false } : undefined,
  typeCast(field, next) {
    if (field.type === 'TINY' && field.length === 1) {
      const v = field.string()
      return v === null ? null : v === '1'
    }
    return next()
  },
}

export const pool = config.db.url
  ? mysql.createPool({ uri: config.db.url, ...base })
  : mysql.createPool({ host: config.db.host, port: config.db.port, user: config.db.user, password: config.db.password, database: config.db.name, ...base })

// Toutes les heures enregistrées par la base sont en UTC
pool.pool.on('connection', (conn) => conn.query("SET time_zone = '+00:00'"))

/** Fonctions d'accès, identiques pour le pool et pour une transaction */
const helpers = (runner) => ({
  /** Liste de lignes */
  many: async (sql, params = []) => (await runner.query(sql, params))[0],
  /** Première ligne ou null */
  one: async (sql, params = []) => (await runner.query(sql, params))[0][0] || null,
  /** INSERT / UPDATE / DELETE : renvoie { affectedRows, insertId } */
  exec: async (sql, params = []) => (await runner.query(sql, params))[0],
})

export const { many, one, exec } = helpers(pool)
export const uuid = () => randomUUID()

/** Exécute fn(db) dans une transaction : COMMIT si tout va bien, ROLLBACK sinon */
export async function tx(fn) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const result = await fn(helpers(conn))
    await conn.commit()
    return result
  } catch (e) {
    await conn.rollback().catch(() => {})
    throw e
  } finally {
    conn.release()
  }
}

/** Applique les fichiers server/migrations/*.sql pas encore exécutés */
export async function migrate() {
  await exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name VARCHAR(100) PRIMARY KEY,
    applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  const dir = join(config.root, 'server', 'migrations')
  const done = new Set((await many('SELECT name FROM schema_migrations')).map((r) => r.name))
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue
    const statements = readFileSync(join(dir, file), 'utf8')
      .replace(/^\s*--.*$/gm, '')
      .split(/;\s*(?:\r?\n|$)/)
      .map((s) => s.trim())
      .filter(Boolean)
    // MySQL valide chaque CREATE TABLE immédiatement : pas de transaction possible ici
    for (const st of statements) await exec(st)
    await exec('INSERT INTO schema_migrations(name) VALUES (?)', [file])
    if (!config.isTest) console.log(`✓ migration ${file}`)
  }
}
