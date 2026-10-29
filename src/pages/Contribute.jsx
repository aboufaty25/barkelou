import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Check, ChevronRight, EyeOff, Lock, ShieldCheck, Smartphone } from 'lucide-react'
import { useStore, useToast } from '../store/AppStore'
import { DEMO_MODE, PAYMENT_METHODS, confirmPayment, initiatePayment, methodById } from '../services/payments'
import { useDocumentTitle, useShare } from '../lib/hooks'
import { fcfa, fcfaLong, formatPhone, haptic, isValidSnPhone, pct } from '../lib/utils'
import { Cover, Field, MethodBadge, Progress, Spinner, TopBar } from '../components/ui'
import NotFound from './NotFound'

const PRESETS = [2000, 5000, 10000, 25000, 50000, 100000]

export default function Contribute() {
  const { slug } = useParams()
  const toast = useToast()
  const share = useShare()
  const { campaigns, user, contribute } = useStore()
  const c = campaigns.find((x) => x.slug === slug)
  useDocumentTitle(c ? `Participer · ${c.title}` : 'Participer')

  const [step, setStep] = useState(1)
  const [amount, setAmount] = useState(10000)
  const [custom, setCustom] = useState('')
  const [name, setName] = useState(user?.name || '')
  const [anonymous, setAnonymous] = useState(false)
  const [message, setMessage] = useState('')
  const [method, setMethod] = useState('wave')
  const [phone, setPhone] = useState(formatPhone(user?.phone || ''))
  const [card, setCard] = useState({ number: '', exp: '', cvc: '' })
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (step === 4) haptic([15, 40, 15])
  }, [step])

  if (!c) return <NotFound />
  if (c.status === 'closed' && step !== 4) {
    return (
      <div className="page">
        <TopBar title="Participer" />
        <div className="container narrow center pad-y">
          <Lock size={32} />
          <h2>Cette cagnotte est clôturée</h2>
          <Link to={`/c/${c.slug}`} className="btn btn--primary">Retour à la cagnotte</Link>
        </div>
      </div>
    )
  }

  const value = custom ? Number(custom) : amount
  const m = methodById(method)
  const amountError = value < 500 ? 'Minimum 500 F' : value > 5_000_000 ? 'Maximum 5 000 000 F par paiement' : ''
  const nameError = !anonymous && name.trim().length < 2 ? 'Indiquez votre nom' : ''
  const cardValid = card.number.replace(/\s/g, '').length >= 15 && /^\d{2}\/\d{2}$/.test(card.exp) && card.cvc.length >= 3
  const payReady = m.needsPhone ? isValidSnPhone(phone) : cardValid

  const goStep2 = () => {
    setTouched(true)
    if (amountError || nameError) return
    setTouched(false)
    setStep(2)
  }

  const pay = async () => {
    setTouched(true)
    if (!payReady) return
    setError('')
    setStep(3)
    try {
      const { paymentId } = await initiatePayment({ campaignId: c.id, amount: value, method, phone })
      const status = await confirmPayment(paymentId)
      if (status !== 'success') throw new Error('Le paiement a été refusé ou annulé.')
      contribute({
        campaignId: c.id,
        name: anonymous ? (name.trim() || 'Anonyme') : name.trim(),
        anonymous,
        amount: value,
        message: message.trim(),
        method,
      })
      setStep(4)
    } catch (e) {
      setError(e.message || 'Une erreur est survenue.')
      setStep(2)
      toast('Paiement non abouti', 'error')
    }
  }

  if (step === 4) {
    return (
      <div className="page success">
        <Confetti />
        <div className="container narrow center">
          <span className="success__check"><Check size={40} strokeWidth={3} /></span>
          <h1>Jërëjëf{!anonymous && name ? `, ${name.split(' ')[0]}` : ''} !</h1>
          <p className="lead">
            Votre participation de <b>{fcfaLong(value)}</b> à « {c.title} » a bien été reçue.
          </p>
          <div className="success__card">
            <Progress value={pct(c.raised, c.goal)} thick />
            <span>
              <b>{fcfa(c.raised)}</b> collectés · {pct(c.raised, c.goal)} % de l’objectif
            </span>
          </div>
          <p className="muted">Partager la cagnotte multiplie les chances qu’elle atteigne son objectif.</p>
          <div className="stack">
            <button className="btn btn--primary btn--lg btn--block" onClick={() => share({ title: c.title, text: `J’ai participé à « ${c.title} » sur Barkelou. Et vous ? 🙏`, path: `/c/${c.slug}` })}>
              Partager la cagnotte
            </button>
            <Link to={`/c/${c.slug}`} className="btn btn--ghost btn--lg btn--block" replace>Retour à la cagnotte</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page page--flow">
      <TopBar title={step === 1 ? 'Votre participation' : step === 2 ? 'Paiement' : 'Confirmation'} />
      <div className="flow-progress"><span style={{ width: `${(Math.min(step, 3) / 3) * 100}%` }} /></div>

      <div className="container narrow">
        <Link to={`/c/${c.slug}`} className="mini-campaign">
          <Cover campaign={c} className="mini-campaign__cover" iconSize={22} />
          <div>
            <span className="muted">Vous soutenez</span>
            <b>{c.title}</b>
          </div>
        </Link>

        {step === 1 && (
          <div className="flow-body">
            <h2 className="flow-title">Quel montant ?</h2>
            <div className="presets">
              {PRESETS.map((v) => (
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
                  onChange={(e) => setCustom(e.target.value.replace(/\D/g, '').slice(0, 7))}
                />
                <span>FCFA</span>
              </div>
            </Field>

            <Field label="Votre nom" error={touched ? nameError : ''} htmlFor="name" hint={anonymous ? 'Votre nom ne sera visible que par l’organisateur.' : ''}>
              <input id="name" className="input" autoComplete="name" placeholder="Prénom Nom" value={name} onChange={(e) => setName(e.target.value)} />
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

        {step >= 2 && (
          <div className="flow-body">
            <h2 className="flow-title">Comment payer ?</h2>
            <div className="methods">
              {PAYMENT_METHODS.map((pm) => (
                <button key={pm.id} type="button" className={`method ${method === pm.id ? 'is-on' : ''}`} onClick={() => { haptic(); setMethod(pm.id) }} disabled={step === 3}>
                  <MethodBadge method={pm} />
                  <span className="method__txt">
                    <b>{pm.label}</b>
                    <small>{pm.hint}</small>
                  </span>
                  <span className="radio" />
                </button>
              ))}
            </div>

            {m.needsPhone ? (
              <Field label={`Numéro ${m.label}`} htmlFor="phone" error={touched && !isValidSnPhone(phone) ? 'Numéro sénégalais invalide (ex : 77 123 45 67)' : ''}>
                <div className="input-affix input-affix--left">
                  <span>🇸🇳 +221</span>
                  <input id="phone" type="tel" inputMode="tel" autoComplete="tel-national" className="input" placeholder="77 123 45 67" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} disabled={step === 3} />
                </div>
              </Field>
            ) : (
              <div className="card-form">
                <Field label="Numéro de carte" htmlFor="cc" error={touched && card.number.replace(/\s/g, '').length < 15 ? 'Numéro incomplet' : ''}>
                  <input id="cc" className="input" inputMode="numeric" autoComplete="cc-number" placeholder="1234 5678 9012 3456" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ') })} />
                </Field>
                <div className="row gap-12">
                  <Field label="Expiration" htmlFor="exp" error={touched && !/^\d{2}\/\d{2}$/.test(card.exp) ? 'MM/AA' : ''}>
                    <input id="exp" className="input" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/AA" value={card.exp} onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 4); setCard({ ...card, exp: d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d }) }} />
                  </Field>
                  <Field label="CVC" htmlFor="cvc" error={touched && card.cvc.length < 3 ? '3 chiffres' : ''}>
                    <input id="cvc" className="input" inputMode="numeric" autoComplete="cc-csc" placeholder="123" value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
                  </Field>
                </div>
              </div>
            )}

            {error && <p className="alert alert--error">{error}</p>}

            <div className="recap">
              <div><span>Participation</span><b>{fcfa(value)}</b></div>
              <div><span>Frais</span><b className="ok">0 F</b></div>
              <div className="recap__total"><span>Total à payer</span><b>{fcfaLong(value)}</b></div>
            </div>

            <p className="secure"><ShieldCheck size={16} /> Paiement sécurisé et chiffré{DEMO_MODE && ' · mode démonstration'}</p>
          </div>
        )}
      </div>

      {step === 3 && (
        <div className="processing">
          <div className="processing__card">
            <span className="processing__icon">{m.needsPhone ? <Smartphone size={30} /> : <Spinner size={30} />}</span>
            <h3>{m.needsPhone ? `Validez sur votre téléphone` : 'Traitement du paiement…'}</h3>
            <p className="muted">
              {m.needsPhone
                ? `Une demande de ${fcfa(value)} a été envoyée au +221 ${phone}. Confirmez-la dans ${m.label}.`
                : 'Merci de ne pas fermer cette page.'}
            </p>
            <Spinner />
          </div>
        </div>
      )}

      <div className="flow-footer">
        <div className="container narrow">
          {step === 1 ? (
            <button className="btn btn--primary btn--lg btn--block" onClick={goStep2}>
              Continuer · {fcfa(value || 0)} <ChevronRight size={18} />
            </button>
          ) : (
            <div className="row gap-8">
              <button className="btn btn--soft btn--lg" onClick={() => setStep(1)} disabled={step === 3}>Retour</button>
              <button className="btn btn--primary btn--lg btn--grow" onClick={pay} disabled={step === 3}>
                {step === 3 ? <Spinner /> : <><Lock size={16} /> Payer {fcfa(value)}</>}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Confetti() {
  const colors = ['#F2B33D', '#0B5D43', '#1DC3F0', '#FF7900', '#E11D48', '#7C3AED']
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 42 }, (_, i) => (
        <span
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            background: colors[i % colors.length],
            animationDelay: `${(i % 10) * 0.08}s`,
            animationDuration: `${2.2 + (i % 5) * 0.35}s`,
            transform: `rotate(${i * 29}deg)`,
          }}
        />
      ))}
    </div>
  )
}
