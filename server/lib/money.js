import { one } from '../db.js'

/** Calcule la répartition d'une participation selon les paramètres de commission. */
export function splitContribution(amount, s) {
  const commission = Math.min(amount, Math.round((amount * s.commission_rate) / 100) + s.commission_fixed)
  if (s.fee_payer === 'donor') {
    return { amount, donor_fee: commission, commission, net: amount, total_charged: amount + commission }
  }
  return { amount, donor_fee: 0, commission, net: amount - commission, total_charged: amount }
}

/** Frais de retrait : le bénéficiaire reçoit amount - fee */
export function withdrawalFee(amount, s) {
  return Math.min(amount, Math.round((amount * s.withdrawal_fee_rate) / 100) + s.withdrawal_fee_fixed)
}

/**
 * Solde disponible d'une cagnotte = nets encaissés − retraits non échoués.
 * `db` peut être un client de transaction (pour lecture sous verrou).
 */
export async function campaignBalance(campaignId, db) {
  const q = `
    SELECT
      COALESCE((SELECT SUM(net) FROM contributions WHERE campaign_id = $1 AND status = 'paid'), 0) AS credited,
      COALESCE((SELECT SUM(amount) FROM withdrawals WHERE campaign_id = $1
                AND status IN ('pending_review', 'processing', 'success')), 0) AS withdrawn,
      COALESCE((SELECT SUM(amount) FROM withdrawals WHERE campaign_id = $1
                AND status IN ('pending_review', 'processing')), 0) AS in_progress`
  const row = db ? (await db.query(q, [campaignId])).rows[0] : await one(q, [campaignId])
  const credited = Number(row.credited)
  const withdrawn = Number(row.withdrawn)
  return { credited, withdrawn, in_progress: Number(row.in_progress), available: credited - withdrawn }
}
