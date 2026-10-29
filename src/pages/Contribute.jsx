import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronRight, EyeOff, Lock, ShieldCheck } from 'lucide-react'
import { useApi, useStore, useToast } from '../store/AppStore'
import { api } from '../lib/api'
import { PAYMENT_METHODS, quote } from '../services/payments'
import { useDocumentTitle } from '../lib/hooks'
import { fcfa, fcfaLong, haptic } from '../lib/utils'
import { Cover, ErrorState, Field, Loader, MethodBadge, Spinner, TopBar } from '../components/ui'

const PRESETS = [2000, 5000, 10000, 25000, 50000, 100000]

export default function Contribute() {
  const { slug } = useParams()
  const toast = useToast()
  const { user, settings } = useStore()
  const { data, error: loadError, loading } = useApi(`/campaigns/${encodeURIComponent(slug)}`)
  const c = data?.campaign
  useDocumentTitle(c ? `Participer · ${c.title}` : 'Participer')

  const methods = PAYMENT_METHODS.filter((m) => settings.channels?.[m.id])
  const [step, setStep] = useState(1)
  const [amount, setAmount] = useState(10000)
  const [custom, setCustom] = useState('')
  const [name, setName] = useState(user?.name || '')
  const [anonymous, setAnonymous] = useState(false)
  const [message, setMessage] = useState('')
  const [method, setMethod] = useState(methods[0]?.id || 'wave')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (loading && !data) return <Loader />
  if (loadError) {
    return (
      <div className="page">
        <TopBar title="Participer" />
        <div className="container narrow"><ErrorState error={loadError} /></div>
      </div>
    )
  }

  if (c.status !== 'active') {
    return (
      <div className="page">
        <TopBar title="Participer" />
        <div className="container narrow center pad-y stack">
          <Lock size={32} className="center-block" />
          <h2>Cette cagnotte ne reçoit plus de participations</h2>
          <Link to={`/c/${c.slug}`} className="btn btn--primary">Retour à la cagnotte</Link>
        </div>
      </div>
    )
  }

  const value = custom ? Number(custom) : amount
  const q = quote(value || 0, settings)
  const amountError =
    value < settings.min_contribution
      ? `Minimum ${fcfa(settings.min_contribution)}`
      : value > settings.max_contribution
        ? `Maximum ${fcfa(settings.max_contribution)} par paiement`
        : ''
  const nameError = !anonymous && name.trim().length < 2 ? 'Indiquez votre nom' : ''

  const goStep2 = () => {
    setTouched(true)
    if (amountError || nameError) return
    setTouched(false)
    setStep(2)
    window.scrollTo({ top: 0 })
  }

  const pay = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await api.post('/payments', {
        campaignId: c.id,
        amount: value,
        name: name.trim(),
        anonymous,
        message: message.trim(),
        channel: method,
      })
      try {
        sessionStorage.setItem('barkelou:lastPayment', JSON.stringify({ token: res.token, slug: c.slug }))
      } catch {
        /* ignore */
      }
      window.location.assign(res.checkoutUrl)
    } catch (e) {
      setError(e.message)
      toast(e.message, 'error')
      setBusy(false)
    }
  }

  return (
    <div className="page page--flow">
      <TopBar title={step === 1 ? 'Votre participation' : 'Paiement'} />
      <div className="flow-progress"><span style={{ width: `${(step / 2) * 100}%` }} /></div>

      <div className="container narrow">
        <Link to={`/c/${c.slug}`} className="mini-campaign">
          <Cover campaign={c} className="mini-campaign__cover" iconSize={22} />
          <div>
            <span className="muted">Vous soutenez</span>
            <b>{c.title}</b>
          </div>
        </Link>

        {!settings.payments_ready && (
          <p className="alert alert--warn">Les paiements en ligne seront bientôt disponibles sur cette cagnotte.</p>
        )}

        {step === 1 && (
          <div className="flow-body">
            <h2 className="flow-title">Quel montant ?</h2>
            <div className="presets">
              {PRESETS.filter((v) => v >= settings.min_contribution && v <= settings.max_contribution).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`preset ${!custom && amount === v ? 'is-on' : ''}`}
                  onClick={() => {
                    haptic()
                    setAmount(v)
                    setCustom('')
                  }}
                >
                  {fcfa(v)}
                </button>
              ))}
            </div>
            <Field label="Autre montant" error={touched ? amountError : ''} htmlFor="amount">
              <div className="input-affix input-affix--big">
                <input
                  id="amount"
                  className="input"
                  inputMode="numeric"
                  placeholder="Saisir un montant"
                  value={custom ? Number(custom).toLocaleString('fr-FR').replace(/ | /g, ' ') : ''}
                  onChange={(e) => setCustom(e.target.value.replace(/\D/g, '').slice(0, 8))}
                />
                <span>FCFA</span>
              </div>
            </Field>

            <Field label="Votre nom" error={touched ? nameError : ''} htmlFor="name" hint={anonymous ? 'Seul l’organisateur verra votre nom.' : ''}>
              <input id="name" className="input" autoComplete="name" maxLength={60} placeholder="Prénom Nom" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>

            <label className="switch-row">
              <span>
                <EyeOff size={18} />
                <span>
                  <b>Participer anonymement</b>
                  <small>Votre nom n’apparaîtra pas publiquement</small>
                </span>
              </span>
              <input type="checkbox" className="switch" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
            </label>

            <Field label="Un mot pour l’organisateur (facultatif)" htmlFor="msg" counter={`${message.length}/280`}>
              <textarea id="msg" className="input" rows={3} maxLength={280} placeholder="Bon courage, toutes mes pensées…" value={message} onChange={(e) => setMessage(e.target.value)} />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="flow-body">
            <h2 className="flow-title">Comment payer ?</h2>
            <div className="methods">
              {methods.map((pm) => (
                <button key={pm.id} type="button" className={`method ${method === pm.id ? 'is-on' : ''}`} onClick={() => { haptic(); setMethod(pm.id) }}>
                  <MethodBadge method={pm} />
                  <span className="method__txt">
                    <b>{pm.label}</b>
                    <small>{pm.hint}</small>
                  </span>
                  <span className="radio" />
                </button>
              ))}
            </div>

            <div className="recap">
              <div><span>Votre participation</span><b>{fcfa(q.amount)}</b></div>
              {settings.fee_payer === 'donor' ? (
                <div><span>Frais de service</span><b>{fcfa(q.fee)}</b></div>
              ) : (
                <div><span>Frais pour vous</span><b className="ok">0 F</b></div>
              )}
              <div className="recap__total"><span>Total à payer</span><b>{fcfaLong(q.total)}</b></div>
            </div>

            {error && <p className="alert alert--error">{error}</p>}

            <p className="secure">
              <ShieldCheck size={16} /> Vous allez être redirigé vers la page sécurisée PayDunya
              {settings.payments_simulated && ' (simulation)'}
            </p>
          </div>
        )}
      </div>

      <div className="flow-footer">
        <div className="container narrow">
          {step === 1 ? (
            <button className="btn btn--primary btn--lg btn--block" onClick={goStep2}>
              Continuer · {fcfa(value || 0)} <ChevronRight size={18} />
            </button>
          ) : (
            <div className="row gap-8">
              <button className="btn btn--soft btn--lg" onClick={() => setStep(1)} disabled={busy}>Retour</button>
              <button className="btn btn--primary btn--lg btn--grow" onClick={pay} disabled={busy || !settings.payments_ready || !methods.length}>
                {busy ? <Spinner /> : <><Lock size={16} /> Payer {fcfa(q.total)}</>}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
