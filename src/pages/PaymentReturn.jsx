import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Check, Clock, FlaskConical, XCircle } from 'lucide-react'
import { api } from '../lib/api'
import { useDocumentTitle, useShare } from '../lib/hooks'
import { fcfa, fcfaLong, haptic } from '../lib/utils'
import { Spinner } from '../components/ui'

const lastPayment = () => {
  try {
    return JSON.parse(sessionStorage.getItem('barkelou:lastPayment') || 'null')
  } catch {
    return null
  }
}

/** Page de retour après le paiement PayDunya : vérifie le statut côté serveur */
export default function PaymentReturn() {
  useDocumentTitle('Paiement')
  const [params] = useSearchParams()
  const token = params.get('token') || lastPayment()?.token
  const share = useShare()
  const [res, setRes] = useState(null)
  const [tries, setTries] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    let alive = true
    let timer
    const check = async (n) => {
      try {
        const r = await api.get(`/payments/${encodeURIComponent(token)}`)
        if (!alive) return
        setRes(r)
        setTries(n)
        if (r.status === 'pending' && n < 40) timer = setTimeout(() => check(n + 1), n < 10 ? 2000 : 5000)
        if (r.status === 'paid') haptic([15, 40, 15])
      } catch (e) {
        if (alive) setError(e.message)
      }
    }
    check(0)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [token])

  if (!token || error) {
    return (
      <Shell icon={<XCircle size={36} />} tone="fail" title="Paiement introuvable">
        <p className="lead">{error || 'Nous ne retrouvons pas ce paiement.'}</p>
        <Link to="/" className="btn btn--primary btn--lg btn--block">Retour à l’accueil</Link>
      </Shell>
    )
  }
  if (!res) {
    return (
      <Shell icon={<Spinner size={34} />} tone="wait" title="Vérification du paiement…">
        <p className="muted">Merci de patienter quelques secondes.</p>
      </Shell>
    )
  }

  const c = res.campaign
  if (res.status === 'paid') {
    return (
      <div className="page success">
        <Confetti />
        <div className="container narrow center">
          <span className="success__check"><Check size={40} strokeWidth={3} /></span>
          <h1>Jërëjëf{res.name ? `, ${res.name.split(' ')[0]}` : ''} !</h1>
          <p className="lead">
            Votre participation de <b>{fcfaLong(res.amount)}</b> à « {c.title} » a bien été reçue.
          </p>
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
  if (res.status === 'pending') {
    return (
      <Shell icon={<Clock size={36} />} tone="wait" title="Paiement en attente">
        <p className="lead">
          Nous attendons la confirmation de votre opérateur pour {fcfa(res.totalCharged)}. Validez la demande sur votre téléphone si ce n’est
          pas déjà fait.
        </p>
        {tries < 40 && <Spinner />}
        <Link to={`/c/${c.slug}`} className="btn btn--ghost btn--lg btn--block">Retour à la cagnotte</Link>
      </Shell>
    )
  }
  return (
    <Shell icon={<XCircle size={36} />} tone="fail" title={res.status === 'cancelled' ? 'Paiement annulé' : 'Paiement non abouti'}>
      <p className="lead">Aucun montant n’a été débité. Vous pouvez réessayer quand vous voulez.</p>
      <div className="stack">
        <Link to={`/c/${c.slug}/participer`} className="btn btn--primary btn--lg btn--block" replace>Réessayer</Link>
        <Link to={`/c/${c.slug}`} className="btn btn--ghost btn--lg btn--block" replace>Retour à la cagnotte</Link>
      </div>
    </Shell>
  )
}

function Shell({ icon, tone, title, children }) {
  return (
    <div className="page success">
      <div className="container narrow center stack">
        <span className={`result-icon result-icon--lg is-${tone}`}>{icon}</span>
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  )
}

/** Simulateur de la page PayDunya (développement uniquement) */
export function PaymentSimulator() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const settle = async (outcome) => {
    setBusy(true)
    try {
      await api.post('/dev/paydunya/settle', { token, outcome })
      navigate(`/paiement/retour?token=${encodeURIComponent(token)}${outcome !== 'completed' ? '&annule=1' : ''}`, { replace: true })
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }
  return (
    <Shell icon={<FlaskConical size={34} />} tone="wait" title="Simulateur PayDunya">
      <p className="lead">
        Mode développement : aucun argent réel. Montant : <b>{fcfa(Number(params.get('montant')) || 0)}</b>
      </p>
      {error && <p className="alert alert--error">{error}</p>}
      <div className="stack">
        <button className="btn btn--primary btn--lg btn--block" disabled={busy} onClick={() => settle('completed')}>Simuler un paiement réussi</button>
        <button className="btn btn--ghost btn--lg btn--block" disabled={busy} onClick={() => settle('cancelled')}>Simuler une annulation</button>
      </div>
    </Shell>
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
