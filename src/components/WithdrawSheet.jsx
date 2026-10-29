import { useEffect, useState } from 'react'
import { Check, Clock, Eye, EyeOff, Lock, ShieldCheck, XCircle } from 'lucide-react'
import { api } from '../lib/api'
import { useStore, useToast } from '../store/AppStore'
import { PAYMENT_METHODS, methodById, withdrawalFee } from '../services/payments'
import { fcfa, fcfaLong, formatPhone, haptic, isValidSnPhone, timeAgo } from '../lib/utils'
import { Field, MethodBadge, Sheet, Spinner } from './ui'

const STATUS = {
  success: { label: 'Envoyé', cls: 'badge--ok' },
  processing: { label: 'En cours', cls: 'badge--pending' },
  pending_review: { label: 'En validation', cls: 'badge--pending' },
  failed: { label: 'Échoué', cls: 'badge--fail' },
  rejected: { label: 'Refusé', cls: 'badge--fail' },
}

export default function WithdrawSheet({ open, onClose, campaign, onDone }) {
  const { user, settings } = useStore()
  const toast = useToast()
  const [info, setInfo] = useState(null)
  const [amount, setAmount] = useState('')
  const methods = PAYMENT_METHODS.filter((m) => m.payout && settings.withdrawal_methods?.[m.id])
  const [method, setMethod] = useState(methods[0]?.id || 'wave')
  const [phone, setPhone] = useState(formatPhone(user?.phone || ''))
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!open) return
    setResult(null)
    setError('')
    setPassword('')
    setPhone(formatPhone(user?.phone || ''))
    api.get(`/campaigns/${campaign.id}/balance`).then(setInfo).catch((e) => setError(e.message))
  }, [open, campaign.id, user?.phone])

  const available = info?.balance?.available ?? 0
  const value = Number(amount) || 0
  const fee = withdrawalFee(value, settings)
  const lockedPhone = settings.withdraw_to_account_phone_only
  const amountError =
    !value ? '' : value < settings.min_withdrawal ? `Minimum ${fcfa(settings.min_withdrawal)}` : value > available ? 'Supérieur au solde disponible' : ''
  const canSubmit = value && !amountError && isValidSnPhone(phone) && password.length > 0 && !busy

  const submit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError('')
    try {
      const { withdrawal } = await api.post(`/campaigns/${campaign.id}/withdrawals`, {
        amount: value,
        method,
        phone: phone.replace(/\D/g, ''),
        password,
      })
      haptic([10, 30, 10])
      setResult(withdrawal)
      setAmount('')
      setPassword('')
      onDone?.()
      api.get(`/campaigns/${campaign.id}/balance`).then(setInfo).catch(() => {})
    } catch (err) {
      setError(err.message)
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Retirer mon argent">
      {result ? (
        <WithdrawResult w={result} onBack={() => setResult(null)} onClose={onClose} />
      ) : (
        <form onSubmit={submit} className="sheet__body" noValidate>
          <div className="balance">
            <span className="muted">Solde disponible</span>
            <strong>{info ? fcfaLong(available) : <Spinner />}</strong>
            {info?.balance?.in_progress > 0 && <small className="muted">dont {fcfa(info.balance.in_progress)} en cours de retrait</small>}
          </div>

          <Field label="Montant à retirer" error={amountError} htmlFor="w-amount">
            <div className="input-affix input-affix--big">
              <input
                id="w-amount"
                inputMode="numeric"
                className="input"
                placeholder="0"
                value={amount ? Number(amount).toLocaleString('fr-FR').replace(/ | /g, ' ') : ''}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 10))}
              />
              <span>FCFA</span>
            </div>
          </Field>
          {available > 0 && (
            <button type="button" className="link" onClick={() => setAmount(String(available))}>
              Tout retirer ({fcfa(available)})
            </button>
          )}

          <div>
            <p className="field__label">Recevoir sur</p>
            <div className="methods methods--compact">
              {methods.map((m) => (
                <button key={m.id} type="button" className={`method ${method === m.id ? 'is-on' : ''}`} onClick={() => setMethod(m.id)}>
                  <MethodBadge method={m} size={30} />
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          <Field
            label={`Numéro ${methodById(method)?.label || ''}`}
            htmlFor="w-phone"
            hint={lockedPhone ? 'Par sécurité, l’argent est envoyé uniquement au numéro de votre compte.' : ''}
            error={phone && !isValidSnPhone(phone) ? 'Numéro invalide' : ''}
          >
            <div className="input-affix input-affix--left">
              <span>+221</span>
              <input
                id="w-phone"
                type="tel"
                inputMode="tel"
                className="input"
                placeholder="77 123 45 67"
                value={phone}
                readOnly={lockedPhone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
              />
              {lockedPhone && <span><Lock size={15} /></span>}
            </div>
          </Field>

          <Field label="Confirmez avec votre mot de passe" htmlFor="w-pass">
            <div className="input-affix">
              <input
                id="w-pass"
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                className="input"
                placeholder="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="button" className="affix-btn" aria-label={showPw ? 'Masquer' : 'Afficher'} onClick={() => setShowPw(!showPw)}>
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </Field>

          {value > 0 && !amountError && (
            <div className="recap">
              <div><span>Retiré du solde</span><b>{fcfa(value)}</b></div>
              <div><span>Frais de retrait</span><b className={fee ? '' : 'ok'}>{fcfa(fee)}</b></div>
              <div className="recap__total"><span>Vous recevez</span><b>{fcfaLong(value - fee)}</b></div>
            </div>
          )}

          {error && <p className="alert alert--error">{error}</p>}

          <button className="btn btn--primary btn--lg btn--block" disabled={!canSubmit}>
            {busy ? <Spinner /> : <>Retirer {value ? fcfa(value - fee) : ''}</>}
          </button>
          <p className="secure">
            <ShieldCheck size={15} />
            {settings.withdrawal_mode === 'automatic' ? 'Envoi immédiat via PayDunya' : 'Validation par l’équipe Barkelou sous 24 h'}
          </p>

          {info?.withdrawals?.length > 0 && (
            <div>
              <p className="field__label">Historique</p>
              <ul className="history">
                {info.withdrawals.map((w) => (
                  <li key={w.id}>
                    <span>
                      <b>{fcfa(w.payout)}</b> · {methodById(w.method)?.label}
                      <small className="muted"> · {timeAgo(w.created_at)}</small>
                      {w.failure_reason && <small className="muted block">{w.failure_reason}</small>}
                    </span>
                    <span className={`badge ${STATUS[w.status]?.cls}`}>{STATUS[w.status]?.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </form>
      )}
    </Sheet>
  )
}

function WithdrawResult({ w, onBack, onClose }) {
  const ok = w.status === 'success'
  const failed = w.status === 'failed'
  const Icon = ok ? Check : failed ? XCircle : Clock
  return (
    <div className="center sheet__body">
      <span className={`result-icon ${ok ? 'is-ok' : failed ? 'is-fail' : 'is-wait'}`}><Icon size={32} /></span>
      <h3>
        {ok ? 'Argent envoyé !' : failed ? 'Le retrait a échoué' : w.status === 'pending_review' ? 'Demande enregistrée' : 'Retrait en cours'}
      </h3>
      <p className="muted">
        {ok && `${fcfaLong(w.payout)} ont été envoyés au +221 ${formatPhone(w.phone)}.`}
        {failed && `${w.failure_reason || 'L’opérateur a refusé le transfert.'} Votre solde n’a pas été débité.`}
        {w.status === 'processing' && 'L’opérateur traite le transfert. Vous le recevrez dans quelques minutes.'}
        {w.status === 'pending_review' && 'Notre équipe valide votre retrait, généralement en moins de 24 h.'}
      </p>
      <button className="btn btn--primary btn--lg btn--block" onClick={failed ? onBack : onClose}>
        {failed ? 'Réessayer' : 'Terminé'}
      </button>
    </div>
  )
}
