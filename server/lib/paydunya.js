/**
 * Client PayDunya (API HTTP/JSON).
 * Doc : https://developers.paydunya.com/doc/EN/http_json  ·  Déboursement : https://developers.paydunya.com/doc/EN/api_deboursement
 *
 * En développement (PAYDUNYA_MOCK, actif par défaut hors production), une passerelle
 * simulée remplace PayDunya pour tester tout le parcours sans argent réel.
 */
import { randomBytes } from 'node:crypto'
import { config } from '../config.js'
import { safeEqual, sha512 } from './crypto.js'

export const CHECKOUT_CHANNELS = {
  wave: 'wave-senegal',
  orange: 'orange-money-senegal',
  free: 'free-money-senegal',
  card: 'card',
}

export const DISBURSE_MODES = {
  wave: 'wave-senegal',
  orange: 'orange-money-senegal',
  free: 'free-money-senegal',
}

export class PaymentError extends Error {
  constructor(message, details) {
    super(message)
    this.details = details
  }
}

const bases = (mode) =>
  mode === 'live'
    ? { checkout: 'https://app.paydunya.com/api/v1', disburse: 'https://app.paydunya.com/api/v2/disburse' }
    : { checkout: 'https://app.paydunya.com/sandbox-api/v1', disburse: 'https://app.paydunya.com/sandbox-api/v2/disburse' }

export function isConfigured(s) {
  return config.paydunyaMock || !!(s.paydunya_master_key && s.paydunya_private_key && s.paydunya_token)
}

async function call(s, url, { method = 'POST', body } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 25_000)
  try {
    const res = await fetch(url, {
      method,
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'PAYDUNYA-MASTER-KEY': s.paydunya_master_key,
        'PAYDUNYA-PRIVATE-KEY': s.paydunya_private_key,
        'PAYDUNYA-TOKEN': s.paydunya_token,
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    return { httpStatus: res.status, data }
  } catch (e) {
    throw new PaymentError('PayDunya est injoignable pour le moment.', e.message)
  } finally {
    clearTimeout(timer)
  }
}

/* ------------------------------------------------------------------ */
/* Encaissement                                                        */
/* ------------------------------------------------------------------ */

/** Crée une facture de paiement et renvoie { token, checkoutUrl } */
export async function createCheckout(s, { contributionId, campaign, amountToPay, description, channel, customer }) {
  if (config.paydunyaMock) return mock.createCheckout({ contributionId, amountToPay })
  const { data } = await call(s, `${bases(s.paydunya_mode).checkout}/checkout-invoice/create`, {
    body: {
      invoice: {
        total_amount: amountToPay,
        description: description.slice(0, 250),
        channels: channel ? [CHECKOUT_CHANNELS[channel]] : undefined,
        customer: customer?.phone ? { name: customer.name, phone: customer.phone } : undefined,
      },
      store: {
        name: s.paydunya_store_name || s.site_name,
        website_url: config.publicUrl,
        logo_url: `${config.publicUrl}/pwa-512x512.png`,
      },
      custom_data: { contribution_id: contributionId, campaign_id: campaign.id },
      actions: {
        return_url: `${config.publicUrl}/paiement/retour`,
        cancel_url: `${config.publicUrl}/paiement/retour?annule=1`,
        callback_url: `${config.publicUrl}/api/payments/ipn`,
      },
    },
  })
  if (data.response_code !== '00' || !data.token) {
    throw new PaymentError('Impossible de créer le paiement PayDunya.', data.response_text || data)
  }
  return { token: data.token, checkoutUrl: data.response_text }
}

/** Interroge PayDunya pour connaître l'état réel d'une facture (source de vérité). */
export async function confirmCheckout(s, token) {
  if (config.paydunyaMock) return mock.confirm(token)
  const { data } = await call(s, `${bases(s.paydunya_mode).checkout}/checkout-invoice/confirm/${encodeURIComponent(token)}`, {
    method: 'GET',
  })
  if (data.response_code !== '00') throw new PaymentError('Confirmation PayDunya impossible.', data.response_text)
  return {
    status: data.status, // pending | completed | cancelled | failed
    totalAmount: Number(data.invoice?.total_amount),
    customData: data.custom_data || {},
    mode: data.mode,
    receiptUrl: data.receipt_url,
    customerPhone: data.customer?.phone,
  }
}

/** Vérifie la signature d'une notification PayDunya (hash = SHA-512 de la clé principale). */
export function verifyHash(s, hash) {
  if (config.paydunyaMock) return safeEqual(hash, sha512('mock-master-key'))
  if (!s.paydunya_master_key || !hash) return false
  return safeEqual(String(hash).toLowerCase(), sha512(s.paydunya_master_key))
}

/* ------------------------------------------------------------------ */
/* Déboursement (retraits)                                             */
/* ------------------------------------------------------------------ */

/**
 * Envoie de l'argent vers un portefeuille mobile.
 * Renvoie { status: 'success' | 'pending' | 'failed', token, transactionId, reason }
 */
export async function disburse(s, { withdrawalId, phone, amount, method }) {
  if (config.paydunyaMock) return mock.disburse({ phone, amount })
  const base = bases(s.paydunya_mode).disburse
  const inv = await call(s, `${base}/get-invoice`, {
    body: {
      account_alias: phone,
      amount,
      withdraw_mode: DISBURSE_MODES[method],
      callback_url: `${config.publicUrl}/api/withdrawals/callback`,
    },
  })
  if (inv.data.response_code !== '00' || !inv.data.disburse_token) {
    return { status: 'failed', token: null, reason: describe(inv.data) }
  }
  const token = inv.data.disburse_token
  const sub = await call(s, `${base}/submit-invoice`, { body: { disburse_invoice: token, disburse_id: withdrawalId } })
  if (sub.data.response_code === '00') {
    return {
      status: sub.data.status === 'success' ? 'success' : sub.data.status === 'failed' ? 'failed' : 'pending',
      token,
      transactionId: sub.data.transaction_id || sub.data.provider_ref || null,
      reason: sub.data.status === 'failed' ? describe(sub.data) : null,
    }
  }
  // Réponse non « 00 » : la doc recommande de vérifier le statut avant de conclure
  const check = await checkDisburse(s, token)
  return { ...check, token, reason: check.status === 'failed' ? describe(sub.data) : null }
}

export async function checkDisburse(s, token) {
  if (config.paydunyaMock) return mock.checkDisburse(token)
  const { data } = await call(s, `${bases(s.paydunya_mode).disburse}/check-status`, { body: { disburse_invoice: token } })
  const st = data.status
  return {
    status: st === 'success' ? 'success' : st === 'failed' ? 'failed' : 'pending',
    transactionId: data.transaction_id || data.disburse_tx_id || null,
  }
}

const describe = (d) => {
  const t = d?.response_text || d?.description
  return typeof t === 'string' ? t.slice(0, 200) : 'Refusé par PayDunya'
}

/* ------------------------------------------------------------------ */
/* Passerelle simulée (développement / tests)                          */
/* ------------------------------------------------------------------ */
const invoices = new Map()
const payouts = new Map()

export const mock = {
  createCheckout({ contributionId, amountToPay }) {
    const token = `mock_${randomBytes(10).toString('hex')}`
    invoices.set(token, { status: 'pending', totalAmount: amountToPay, customData: { contribution_id: contributionId } })
    return { token, checkoutUrl: `${config.publicUrl}/paiement/simulateur?token=${token}&montant=${amountToPay}` }
  },
  confirm(token) {
    const inv = invoices.get(token)
    if (!inv) throw new PaymentError('Facture inconnue')
    return { ...inv, mode: 'test', receiptUrl: null, customerPhone: null }
  },
  /** Utilisé par le simulateur et les tests : fixe l'issue du paiement */
  settle(token, status, { tamperAmount } = {}) {
    const inv = invoices.get(token)
    if (!inv) return false
    inv.status = status
    if (tamperAmount) inv.totalAmount = tamperAmount
    return true
  },
  disburse({ phone }) {
    const token = `mockd_${randomBytes(8).toString('hex')}`
    // Convention de test : un numéro finissant par 000 échoue, par 111 reste en attente
    const status = phone.endsWith('000') ? 'failed' : phone.endsWith('111') ? 'pending' : 'success'
    payouts.set(token, status)
    return { status, token, transactionId: status === 'success' ? `TX${Date.now()}` : null, reason: status === 'failed' ? 'Numéro non éligible (simulation)' : null }
  },
  checkDisburse(token) {
    return { status: payouts.get(token) || 'failed', transactionId: null }
  },
  setPayout(token, status) {
    payouts.set(token, status)
  },
  hash: () => sha512('mock-master-key'),
}
