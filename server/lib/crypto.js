import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { config } from '../config.js'

const KEY = Buffer.from(config.encryptionKey, 'hex')

/** Chiffre une chaîne (AES-256-GCM). Format : v1:iv:tag:données (base64) */
export function encrypt(plain) {
  if (plain == null || plain === '') return ''
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', KEY, iv)
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':')
}

export function decrypt(blob) {
  if (!blob) return ''
  const [v, iv, tag, data] = blob.split(':')
  if (v !== 'v1') throw new Error('Format chiffré inconnu')
  const decipher = createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')
}

export const sha512 = (s) => createHash('sha512').update(String(s)).digest('hex')

export function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''))
  const y = Buffer.from(String(b || ''))
  return x.length === y.length && timingSafeEqual(x, y)
}

export const mask = (s) => (s ? `••••${String(s).slice(-4)}` : '')
