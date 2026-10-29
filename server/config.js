import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Charge un fichier .env simple (KEY=VALUE) sans dépendance externe
const envFile = join(root, '.env')
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const env = process.env
const isProd = env.NODE_ENV === 'production'

function required(name, { minLength = 1 } = {}) {
  const v = env[name]
  if (!v || v.length < minLength) {
    if (isProd) throw new Error(`Variable d'environnement manquante ou trop courte : ${name}`)
    return null
  }
  return v
}

export const config = {
  root,
  isProd,
  isTest: env.NODE_ENV === 'test',
  port: Number(env.PORT) || 3000,
  publicUrl: (env.PUBLIC_URL || 'http://localhost:5173').replace(/\/$/, ''),
  // MySQL / MariaDB. Sur Hostinger : DB_HOST=127.0.0.1 (et non « localhost »)
  db: {
    url: env.DATABASE_URL || '',
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT) || 3306,
    user: env.DB_USER || 'barkelou',
    password: env.DB_PASSWORD || '',
    name: env.DB_NAME || 'barkelou',
    ssl: env.DB_SSL === 'true',
  },
  // Secret de signature des sessions (64 caractères aléatoires recommandés)
  jwtSecret: required('JWT_SECRET', { minLength: 32 }) || 'dev-only-insecure-jwt-secret-change-me-please-123456',
  // Clé de chiffrement des secrets stockés en base (clés PayDunya) : 64 caractères hexadécimaux
  encryptionKey: required('ENCRYPTION_KEY', { minLength: 64 }) || '0'.repeat(64),
  trustProxy: env.TRUST_PROXY ?? (isProd ? '1' : 'false'),
  // Passerelle simulée (développement / tests uniquement, interdite en production)
  paydunyaMock: !isProd && env.PAYDUNYA_MOCK !== 'false',
}

if (isProd && !config.db.url && !env.DB_PASSWORD) throw new Error('Configurez DB_HOST, DB_USER, DB_PASSWORD et DB_NAME (ou DATABASE_URL)')
if (config.db.url && !config.db.url.startsWith('mysql://')) throw new Error('DATABASE_URL doit commencer par mysql://')
if (isProd && config.paydunyaMock) throw new Error('PAYDUNYA_MOCK est interdit en production')
if (!/^[0-9a-f]{64}$/i.test(config.encryptionKey)) throw new Error('ENCRYPTION_KEY doit contenir 64 caractères hexadécimaux')
