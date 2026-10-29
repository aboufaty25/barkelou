import { z } from 'zod'
import { exec, many } from '../db.js'
import { decrypt, encrypt, mask } from './crypto.js'

/**
 * Tous les paramètres modifiables depuis l'espace admin, avec leurs valeurs par défaut.
 * Les montants sont en FCFA, les taux en pourcentage (ex : 5 = 5 %).
 */
export const DEFAULTS = {
  // Général
  site_name: 'Barkelou',
  contact_email: 'contact@barkelou.com',
  contact_whatsapp: '221770000000',
  maintenance_mode: false,
  maintenance_message: 'Barkelou est en maintenance, revenez dans quelques minutes.',
  allow_signups: true,
  auto_publish_campaigns: true,

  // Commission plateforme sur chaque participation
  commission_rate: 5,
  commission_fixed: 0,
  fee_payer: 'organizer', // 'organizer' : déduite de la cagnotte · 'donor' : ajoutée au paiement du donateur

  // Participations
  min_contribution: 500,
  max_contribution: 2_000_000,
  max_campaign_goal: 100_000_000,
  channels: { wave: true, orange: true, free: true, card: true },

  // Retraits
  withdrawal_mode: 'automatic', // 'automatic' : envoi immédiat via PayDunya · 'manual' : validation admin
  withdrawal_fee_rate: 0,
  withdrawal_fee_fixed: 0,
  min_withdrawal: 1000,
  max_withdrawal_per_day: 5_000_000,
  withdraw_to_account_phone_only: true,
  withdrawal_methods: { wave: true, orange: true, free: true },

  // PayDunya (les clés sont chiffrées en base et jamais renvoyées en clair)
  paydunya_mode: 'test', // 'test' | 'live'
  paydunya_master_key: '',
  paydunya_private_key: '',
  paydunya_token: '',
  paydunya_store_name: 'Barkelou',
}

export const SECRET_KEYS = ['paydunya_master_key', 'paydunya_private_key', 'paydunya_token']

const money = z.number().int().min(0).max(1_000_000_000)
const rate = z.number().min(0).max(50)

export const settingsSchema = z
  .object({
    site_name: z.string().trim().min(1).max(60),
    contact_email: z.union([z.literal(''), z.email()]),
    contact_whatsapp: z.string().regex(/^\d{0,15}$/),
    maintenance_mode: z.boolean(),
    maintenance_message: z.string().max(300),
    allow_signups: z.boolean(),
    auto_publish_campaigns: z.boolean(),
    commission_rate: rate,
    commission_fixed: money,
    fee_payer: z.enum(['organizer', 'donor']),
    min_contribution: money.min(100),
    max_contribution: money,
    max_campaign_goal: money,
    channels: z.object({ wave: z.boolean(), orange: z.boolean(), free: z.boolean(), card: z.boolean() }),
    withdrawal_mode: z.enum(['automatic', 'manual']),
    withdrawal_fee_rate: rate,
    withdrawal_fee_fixed: money,
    min_withdrawal: money.min(100),
    max_withdrawal_per_day: money,
    withdraw_to_account_phone_only: z.boolean(),
    withdrawal_methods: z.object({ wave: z.boolean(), orange: z.boolean(), free: z.boolean() }),
    paydunya_mode: z.enum(['test', 'live']),
    paydunya_master_key: z.string().max(200),
    paydunya_private_key: z.string().max(200),
    paydunya_token: z.string().max(200),
    paydunya_store_name: z.string().trim().min(1).max(60),
  })
  .partial()

let cache = null
let cacheAt = 0

export async function getSettings({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cacheAt < 10_000) return cache
  const rows = await many('SELECT setting_key, value FROM settings')
  const s = structuredClone(DEFAULTS)
  for (const { setting_key: key, value } of rows) {
    if (!(key in DEFAULTS)) continue
    try {
      const v = JSON.parse(value)
      s[key] = SECRET_KEYS.includes(key) ? safeDecrypt(v) : v
    } catch {
      /* valeur illisible : on garde la valeur par défaut */
    }
  }
  cache = s
  cacheAt = Date.now()
  return s
}

const safeDecrypt = (v) => {
  try {
    return decrypt(v)
  } catch {
    return ''
  }
}

export function invalidateSettings() {
  cache = null
}

/** Enregistre un sous-ensemble validé de paramètres. Les secrets vides sont ignorés (= inchangés). */
export async function saveSettings(patch, actorId) {
  const changed = []
  for (const [key, raw] of Object.entries(patch)) {
    if (!(key in DEFAULTS)) continue
    if (SECRET_KEYS.includes(key) && (raw === '' || raw == null)) continue
    const value = SECRET_KEYS.includes(key) ? encrypt(raw.trim()) : raw
    await exec(
      `INSERT INTO settings(setting_key, value, updated_by, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP(3)`,
      [key, JSON.stringify(value), actorId]
    )
    changed.push(key)
  }
  invalidateSettings()
  return changed
}

/** Vue admin : secrets masqués */
export function adminView(s) {
  const out = { ...s }
  for (const k of SECRET_KEYS) {
    out[k] = ''
    out[`${k}_set`] = !!s[k]
    out[`${k}_hint`] = mask(s[k])
  }
  return out
}

/** Vue publique : uniquement ce dont l'application a besoin */
export function publicView(s) {
  return {
    site_name: s.site_name,
    contact_email: s.contact_email,
    contact_whatsapp: s.contact_whatsapp,
    maintenance_mode: s.maintenance_mode,
    maintenance_message: s.maintenance_message,
    allow_signups: s.allow_signups,
    commission_rate: s.commission_rate,
    commission_fixed: s.commission_fixed,
    fee_payer: s.fee_payer,
    min_contribution: s.min_contribution,
    max_contribution: s.max_contribution,
    max_campaign_goal: s.max_campaign_goal,
    channels: s.channels,
    withdrawal_mode: s.withdrawal_mode,
    withdrawal_fee_rate: s.withdrawal_fee_rate,
    withdrawal_fee_fixed: s.withdrawal_fee_fixed,
    min_withdrawal: s.min_withdrawal,
    max_withdrawal_per_day: s.max_withdrawal_per_day,
    withdraw_to_account_phone_only: s.withdraw_to_account_phone_only,
    withdrawal_methods: s.withdrawal_methods,
    payments_ready: !!(s.paydunya_master_key && s.paydunya_private_key && s.paydunya_token),
    payments_mode: s.paydunya_mode,
  }
}
