import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, BadgeCheck, CalendarClock, Copy, Lock, LockOpen, MapPin, MessageCircle,
  Pencil, Share2, Trash2, Users, Wallet, Target,
} from 'lucide-react'
import { useStore, useToast } from '../store/AppStore'
import { PAYMENT_METHODS, methodById } from '../services/payments'
import { useDocumentTitle, useShare } from '../lib/hooks'
import { daysLeft, daysLeftLabel, fcfa, fcfaLong, formatDate, formatPhone, isValidSnPhone, pct, siteUrl, timeAgo } from '../lib/utils'
import { Avatar, CategoryChip, Cover, Empty, FavButton, Field, MethodBadge, Progress, Sheet } from '../components/ui'
import NotFound from './NotFound'

export default function Campaign() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const share = useShare()
  const { campaigns, state, user, updateCampaign, deleteCampaign } = useStore()
  const c = campaigns.find((x) => x.slug === slug)
  useDocumentTitle(c?.title)
  const [tab, setTab] = useState('histoire')
  const [shareOpen, setShareOpen] = useState(false)
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const contributions = useMemo(
    () => state.contributions.filter((k) => k.campaignId === c?.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [state.contributions, c?.id]
  )
  if (!c) return <NotFound />

  const isOwner = user && user.id === c.ownerId
  const p = pct(c.raised, c.goal)
  const dl = daysLeft(c.deadline)
  const ended = c.status === 'closed' || (dl !== null && dl < 0)
  const messages = contributions.filter((k) => k.message)
  const top = [...contributions].sort((a, b) => b.amount - a.amount)[0]
  const shownList = showAll ? contributions : contributions.slice(0, 8)
  const path = `/c/${c.slug}`

  const doShare = () => setShareOpen(true)

  return (
    <div className="page page--campaign">
      <div className="cp-media">
        <Cover campaign={c} className="cp-cover" iconSize={72} />
        <div className="cp-media__bar">
          <button className="icon-btn icon-btn--glass" aria-label="Retour" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>
            <ArrowLeft size={20} />
          </button>
          <div className="row gap-8">
            <button className="icon-btn icon-btn--glass" aria-label="Partager" onClick={doShare}>
              <Share2 size={18} />
            </button>
            <FavButton id={c.id} className="icon-btn icon-btn--glass" />
          </div>
        </div>
      </div>

      <div className="container cp-layout">
        <article className="cp-main">
          <div className="cp-headline">
            <div className="row gap-8 wrap">
              <CategoryChip id={c.category} />
              {ended && <span className="chip chip--muted"><Lock size={12} /> Clôturée</span>}
            </div>
            <h1>{c.title}</h1>
            <div className="cp-owner">
              <Avatar name={c.ownerName} size={40} />
              <div>
                <b>{c.ownerName} <BadgeCheck size={15} className="verified" aria-label="Organisateur vérifié" /></b>
                <span className="muted">
                  Créée {timeAgo(c.createdAt)}
                  {c.city && <> · <MapPin size={12} /> {c.city}</>}
                </span>
              </div>
            </div>
          </div>

          {/* Carte de progression (mobile) */}
          <div className="cp-progress-card mobile-only">
            <ProgressBlock c={c} p={p} ended={ended} />
          </div>

          {isOwner && (
            <div className="owner-panel">
              <div className="owner-panel__head">
                <b>Vous gérez cette cagnotte</b>
                <span className="muted">Disponible : {fcfa(c.raised - withdrawnFor(state, c.id))}</span>
              </div>
              <div className="owner-panel__actions">
                <Link to={`${path}/modifier`} className="tile"><Pencil size={18} />Modifier</Link>
                <button className="tile" onClick={() => setWithdrawOpen(true)}><Wallet size={18} />Retirer</button>
                <button className="tile" onClick={doShare}><Share2 size={18} />Partager</button>
                <button
                  className="tile"
                  onClick={() => {
                    updateCampaign(c.id, { status: c.status === 'closed' ? 'active' : 'closed' })
                    toast(c.status === 'closed' ? 'Cagnotte rouverte' : 'Cagnotte clôturée', 'success')
                  }}
                >
                  {c.status === 'closed' ? <LockOpen size={18} /> : <Lock size={18} />}
                  {c.status === 'closed' ? 'Rouvrir' : 'Clôturer'}
                </button>
              </div>
            </div>
          )}

          <div className="tabs" role="tablist">
            {[
              ['histoire', 'Histoire'],
              ['participants', `Participants · ${c.count}`],
              ['mots', `Mots · ${messages.length}`],
            ].map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'is-on' : ''} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'histoire' && (
            <div className="story">
              {c.story.split(/\n+/).map((para, i) => (
                <p key={i}>{para}</p>
              ))}
              <dl className="facts">
                <div><dt><Target size={16} /> Objectif</dt><dd>{fcfaLong(c.goal)}</dd></div>
                <div><dt><CalendarClock size={16} /> Date limite</dt><dd>{c.deadline ? formatDate(c.deadline) : 'Aucune'}</dd></div>
                <div><dt><Users size={16} /> Participants</dt><dd>{c.count}</dd></div>
              </dl>
              {isOwner && !c.ownerId.startsWith('seed') && (
                <button
                  className="btn btn--danger-ghost btn--sm"
                  onClick={() => {
                    if (confirm('Supprimer définitivement cette cagnotte ?')) {
                      deleteCampaign(c.id)
                      toast('Cagnotte supprimée')
                      navigate('/mes-cagnottes', { replace: true })
                    }
                  }}
                >
                  <Trash2 size={15} /> Supprimer la cagnotte
                </button>
              )}
            </div>
          )}

          {tab === 'participants' &&
            (contributions.length ? (
              <>
                {top && !c.hideAmounts && (
                  <div className="top-donor">
                    🏆 Plus grosse participation : <b>{top.anonymous ? 'Anonyme' : top.name}</b> · {fcfa(top.amount)}
                  </div>
                )}
                <ul className="donors">
                  {shownList.map((k) => (
                    <li key={k.id}>
                      <Avatar name={k.name} anonymous={k.anonymous} size={40} />
                      <div className="donors__info">
                        <b>{k.anonymous ? 'Anonyme' : k.name}</b>
                        <span className="muted">{timeAgo(k.createdAt)} · {methodById(k.method)?.label}</span>
                      </div>
                      {!c.hideAmounts && <strong className="donors__amt">{fcfa(k.amount)}</strong>}
                    </li>
                  ))}
                </ul>
                {contributions.length > 8 && !showAll && (
                  <button className="btn btn--soft btn--block" onClick={() => setShowAll(true)}>
                    Voir les {contributions.length} participants
                  </button>
                )}
              </>
            ) : (
              <Empty icon={Users} title="Soyez le premier à participer" text="Votre geste lancera la dynamique 💪" />
            ))}

          {tab === 'mots' &&
            (messages.length ? (
              <ul className="messages">
                {messages.map((k) => (
                  <li key={k.id}>
                    <Avatar name={k.name} anonymous={k.anonymous} size={34} />
                    <div className="bubble">
                      <b>{k.anonymous ? 'Anonyme' : k.name}</b>
                      <p>{k.message}</p>
                      <span className="muted">{timeAgo(k.createdAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty icon={MessageCircle} title="Aucun mot pour l’instant" text="Laissez un message d’encouragement avec votre participation." />
            ))}
        </article>

        <aside className="cp-side desktop-only">
          <div className="cp-progress-card sticky">
            <ProgressBlock c={c} p={p} ended={ended} />
            {!ended && (
              <Link to={`${path}/participer`} className="btn btn--primary btn--lg btn--block">Participer</Link>
            )}
            <button className="btn btn--ghost btn--block" onClick={doShare}>
              <Share2 size={17} /> Partager
            </button>
          </div>
        </aside>
      </div>

      {/* Barre d'action collante (mobile) */}
      <div className="action-bar mobile-only">
        <button className="btn btn--soft btn--icon" aria-label="Partager" onClick={doShare}>
          <Share2 size={20} />
        </button>
        {ended ? (
          <span className="btn btn--disabled btn--lg btn--grow">Cagnotte clôturée</span>
        ) : (
          <Link to={`${path}/participer`} className="btn btn--primary btn--lg btn--grow">Participer</Link>
        )}
      </div>

      <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} c={c} share={share} toast={toast} />
      {isOwner && <WithdrawSheet open={withdrawOpen} onClose={() => setWithdrawOpen(false)} c={c} />}
    </div>
  )
}

const withdrawnFor = (state, id) =>
  (state.withdrawals || []).filter((w) => w.campaignId === id).reduce((s, w) => s + w.amount, 0)

function ProgressBlock({ c, p, ended }) {
  const dl = daysLeft(c.deadline)
  return (
    <>
      <div className="pb-amount">
        <strong>{fcfa(c.raised)}</strong>
        <span className="muted">collectés sur {fcfa(c.goal)}</span>
      </div>
      <Progress value={p} thick />
      <div className="pb-stats">
        <div><b>{p} %</b><span>de l’objectif</span></div>
        <div><b>{c.count}</b><span>participant{c.count > 1 ? 's' : ''}</span></div>
        <div>
          <b>{ended ? '—' : dl === null ? '∞' : Math.max(dl, 0)}</b>
          <span>{ended ? 'terminée' : dl === null ? 'sans limite' : daysLeftLabel(c.deadline).replace(/^\d+ /, '')}</span>
        </div>
      </div>
    </>
  )
}

function ShareSheet({ open, onClose, c, share, toast }) {
  const url = siteUrl(`/c/${c.slug}`)
  const text = `Soutenez « ${c.title} » sur Barkelou 🙏`
  return (
    <Sheet open={open} onClose={onClose} title="Partager la cagnotte">
      <div className="share-grid">
        <a className="share-opt" href={`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`} target="_blank" rel="noreferrer" style={{ '--c': '#25D366' }}>
          <span><MessageCircle size={22} /></span>WhatsApp
        </a>
        <a className="share-opt" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} target="_blank" rel="noreferrer" style={{ '--c': '#1877F2' }}>
          <span><FacebookIcon /></span>Facebook
        </a>
        <button
          className="share-opt"
          style={{ '--c': '#0B5D43' }}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url)
              toast('Lien copié ✓', 'success')
            } catch {
              toast(url)
            }
          }}
        >
          <span><Copy size={22} /></span>Copier
        </button>
        <button className="share-opt" style={{ '--c': '#475569' }} onClick={() => share({ title: c.title, text, path: `/c/${c.slug}` })}>
          <span><Share2 size={22} /></span>Plus…
        </button>
      </div>
      <div className="share-link">
        <span>{url.replace(/^https?:\/\//, '')}</span>
      </div>
    </Sheet>
  )
}

function WithdrawSheet({ open, onClose, c }) {
  const { state, requestWithdrawal, user } = useStore()
  const toast = useToast()
  const available = c.raised - withdrawnFor(state, c.id)
  const [method, setMethod] = useState('wave')
  const [phone, setPhone] = useState(formatPhone(user?.phone || ''))
  const [amount, setAmount] = useState('')
  const value = Number(String(amount).replace(/\D/g, '')) || 0
  const error =
    value && value < 1000 ? 'Minimum 1 000 F' : value > available ? 'Montant supérieur au solde disponible' : ''
  const history = (state.withdrawals || []).filter((w) => w.campaignId === c.id)

  return (
    <Sheet open={open} onClose={onClose} title="Retirer les fonds">
      <div className="balance">
        <span className="muted">Solde disponible</span>
        <strong>{fcfaLong(available)}</strong>
      </div>
      <Field label="Montant" error={error} htmlFor="w-amount">
        <div className="input-affix">
          <input id="w-amount" inputMode="numeric" className="input" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} />
          <span>FCFA</span>
        </div>
      </Field>
      <button type="button" className="link" onClick={() => setAmount(String(available))}>Tout retirer</button>
      <div className="methods methods--compact">
        {PAYMENT_METHODS.filter((m) => m.needsPhone).map((m) => (
          <button key={m.id} type="button" className={`method ${method === m.id ? 'is-on' : ''}`} onClick={() => setMethod(m.id)}>
            <MethodBadge method={m} size={30} />
            <span>{m.label}</span>
          </button>
        ))}
      </div>
      <Field label="Numéro de réception" htmlFor="w-phone" error={phone && !isValidSnPhone(phone) ? 'Numéro invalide' : ''}>
        <div className="input-affix input-affix--left">
          <span>+221</span>
          <input id="w-phone" type="tel" inputMode="tel" className="input" placeholder="77 123 45 67" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} />
        </div>
      </Field>
      <button
        className="btn btn--primary btn--lg btn--block"
        disabled={!value || !!error || !isValidSnPhone(phone)}
        onClick={() => {
          requestWithdrawal({ campaignId: c.id, amount: value, method, phone: phone.replace(/\D/g, '') })
          toast('Demande de retrait envoyée ✓', 'success')
          setAmount('')
          onClose()
        }}
      >
        Demander le retrait
      </button>
      <p className="field__hint center">Les retraits sont traités sous 24 h ouvrées après vérification.</p>
      {history.length > 0 && (
        <ul className="history">
          {history.map((w) => (
            <li key={w.id}>
              <span>{fcfa(w.amount)} · {methodById(w.method)?.label}</span>
              <span className="badge badge--pending">En cours · {timeAgo(w.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  )
}

function FacebookIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.4H8.1v3h2.5V21h2.9z" />
    </svg>
  )
}
