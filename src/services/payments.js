/**
 * Couche paiement de Barkelou.
 *
 * En mode démo (par défaut), les paiements sont simulés côté navigateur.
 * Pour encaisser de vrais fonds, branchez ici votre agrégateur
 * (PayDunya, CinetPay, Wave Business API, Orange Money API, Stripe…)
 * via votre backend : le navigateur ne doit JAMAIS détenir les clés privées.
 *
 * Flux attendu côté backend :
 *   POST /api/payments  { campaignId, amount, method, phone }
 *     -> { paymentId, checkoutUrl? }   (redirection Wave / page carte)
 *   GET  /api/payments/:id            -> { status: 'pending' | 'success' | 'failed' }
 *   + webhook de l'agrégateur qui confirme la transaction
 */

export const PAYMENT_METHODS = [
  { id: 'wave', label: 'Wave', hint: 'Validez sur l’app Wave', color: '#1DC3F0', ink: '#04314A', needsPhone: true },
  { id: 'orange', label: 'Orange Money', hint: 'Code #144# sur votre téléphone', color: '#FF7900', ink: '#3A1A00', needsPhone: true },
  { id: 'free', label: 'Free Money', hint: 'Confirmation par USSD', color: '#E30613', ink: '#FFFFFF', needsPhone: true },
  { id: 'card', label: 'Carte bancaire', hint: 'Visa · Mastercard', color: '#14201B', ink: '#FFFFFF', needsPhone: false },
]

export const methodById = (id) => PAYMENT_METHODS.find((m) => m.id === id)

/** Frais de service facultatifs (pourboire plateforme) – 0 % par défaut côté organisateur */
export const PLATFORM_FEE_RATE = 0

export const API_URL = import.meta.env.VITE_API_URL || ''
export const DEMO_MODE = !API_URL

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

export async function initiatePayment({ campaignId, amount, method, phone }) {
  if (!DEMO_MODE) {
    const res = await fetch(`${API_URL}/api/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId, amount, method, phone }),
    })
    if (!res.ok) throw new Error('Le paiement n’a pas pu être lancé.')
    return res.json()
  }
  await wait(900)
  return { paymentId: `demo_${Date.now()}` }
}

export async function confirmPayment(paymentId) {
  if (!DEMO_MODE) {
    for (let i = 0; i < 40; i++) {
      const res = await fetch(`${API_URL}/api/payments/${paymentId}`)
      const { status } = await res.json()
      if (status !== 'pending') return status
      await wait(3000)
    }
    return 'failed'
  }
  await wait(2200)
  return 'success'
}
