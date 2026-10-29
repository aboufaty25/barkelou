/** Moyens de paiement proposés (le traitement réel est fait par le serveur via PayDunya) */
export const PAYMENT_METHODS = [
  { id: 'wave', label: 'Wave', hint: 'Validez dans l’application Wave', color: '#1DC3F0', ink: '#04314A', payout: true },
  { id: 'orange', label: 'Orange Money', hint: 'Confirmation sur votre téléphone', color: '#FF7900', ink: '#3A1A00', payout: true },
  { id: 'free', label: 'Free Money', hint: 'Confirmation sur votre téléphone', color: '#E30613', ink: '#FFFFFF', payout: true },
  { id: 'card', label: 'Carte bancaire', hint: 'Visa · Mastercard', color: '#14201B', ink: '#FFFFFF', payout: false },
]

export const methodById = (id) => PAYMENT_METHODS.find((m) => m.id === id)

/** Même calcul que le serveur (affichage uniquement — le serveur fait foi) */
export function quote(amount, s) {
  const commission = Math.min(amount, Math.round((amount * s.commission_rate) / 100) + s.commission_fixed)
  return s.fee_payer === 'donor'
    ? { amount, fee: commission, toCampaign: amount, total: amount + commission }
    : { amount, fee: 0, commission, toCampaign: amount - commission, total: amount }
}

export const withdrawalFee = (amount, s) =>
  Math.min(amount, Math.round((amount * s.withdrawal_fee_rate) / 100) + s.withdrawal_fee_fixed)
