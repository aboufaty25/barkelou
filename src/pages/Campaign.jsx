import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, CalendarClock, Clock, Copy, EyeOff, Lock, LockOpen, MapPin, MessageCircle,
  Pencil, Share2, ShieldAlert, Trash2, Users, Wallet, Target,
} from 'lucide-react'
import { useApi, useStore, useToast } from '../store/AppStore'
import { api } from '../lib/api'
import { methodById } from '../services/payments'
import { useDocumentTitle, useShare } from '../lib/hooks'
import { daysLeft, daysLeftLabel, fcfa, fcfaLong, formatDate, siteUrl, timeAgo } from '../lib/utils'
import { Avatar, CategoryChip, Cover, Empty, ErrorState, FavButton, Loader, Progress, Sheet } from '../components/ui'
import WithdrawSheet from '../components/WithdrawSheet'

export default function Campaign() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const share = useShare()
  const { user } = useStore()
  const { data, error, loading, reload } = useApi(`/campaigns/${encodeURIComponent(slug)}`, [user?.id])
  useDocumentTitle(data?.campaign?.title)
  const [tab, setTab] = useState('histoire')
  const [shareOpen, setShareOpen] = useState(false)
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [busy, setBusy] = useState(false)

  if (loading && !data) return <Loader />
  if (error) {
    return (
      <div className="page">
        <div className="container narrow pad-y">
          <ErrorState error={error} onRetry={error.status === 404 ? null : reload} />
          <div className="center"><Link to="/explorer" className="btn btn--primary">Explorer les cagnottes</Link></div>
        </div>
      </div>
    )
  }

  const c = data.campaign
  const contributions = data.contributions
  const isOwner = c.isOwner
  const hidden = c.raised === null
  const dl = daysLeft(c.deadline)
  const ended = c.status === 'closed' || (dl !== null && dl < 0)
  const messages = contributions.filter((k) => k.message)
  const top = hidden ? null : [...contributions].sort((a, b) => (b.amount || 0) - (a.amount || 0))[0]
  const shownList = showAll ? contributions : contributions.slice(0, 8)
  const path = `/c/${c.slug}`

  const toggleStatus = async () => {
    setBusy(true)
    try {
      await api.patch(`/campaigns/${c.id}`, { status: c.status === 'closed' ? 'active' : 'closed' })
      toast(c.status === 'closed' ? 'Cagnotte rouverte' : 'Cagnotte clôturée', 'success')
      reload()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!confirm('Supprimer définitivement cette cagnotte ?')) return
    try {
      await api.del(`/campaigns/${c.id}`)
      toast('Cagnotte supprimée')
      navigate('/mes-cagnottes', { replace: true })
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  return (
    <div className="page page--campaign">
      <div className="cp-media">
        <Cover campaign={c} className="cp-cover" iconSize={72} />
        <div className="cp-media__bar">
          <button className="icon-btn icon-btn--glass" aria-label="Retour" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>
            <ArrowLeft size={20} />
          </button>
          <div className="row gap-8">
            <button className="icon-btn icon-btn--glass" aria-label="Partager" onClick={() => setShareOpen(true)}>
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
              {c.status === 'closed' && <span className="chip chip--muted"><Lock size={12} /> Clôturée</span>}
              {c.status === 'pending' && <span className="chip chip--warn"><Clock size={12} /> En attente de validation</span>}
              {c.status === 'suspended' && <span className="chip chip--danger"><ShieldAlert size={12} /> Suspendue</span>}
            </div>
            <h1>{c.title}</h1>
            <div className="cp-owner">
              <Avatar name={c.ownerName} size={40} />
              <div>
                <b>{c.ownerName}</b>
                <span className="muted">
                  Créée {timeAgo(c.createdAt)}
                  {c.city && <> · <MapPin size={12} /> {c.city}</>}
                </span>
              </div>
            </div>
          </div>

          <div className="cp-progress-card mobile-only">
            <ProgressBlock c={c} ended={ended} />
          </div>

          {isOwner && (
            <div className="owner-panel">
              <div className="owner-panel__head">
                <b>Vous gérez cette cagnotte</b>
                {data.balance && <span className="owner-panel__bal">Disponible : <strong>{fcfa(data.balance.available)}</strong></span>}
              </div>
              <div className="owner-panel__actions">
                <Link to={`${path}/modifier`} className="tile"><Pencil size={18} />Modifier</Link>
                <button className="tile tile--accent" onClick={() => setWithdrawOpen(true)} disabled={c.status === 'suspended'}><Wallet size={18} />Retirer</button>
                <button className="tile" onClick={() => setShareOpen(true)}><Share2 size={18} />Partager</button>
                <button className="tile" onClick={toggleStatus} disabled={busy || ['pending', 'suspended'].includes(c.status)}>
                  {c.status === 'closed' ? <LockOpen size={18} /> : <Lock size={18} />}
                  {c.status === 'closed' ? 'Rouvrir' : 'Clôturer'}
                </button>
              </div>
              {hidden === false && c.hideAmounts && (
                <p className="field__hint"><EyeOff size={13} /> Les montants sont masqués pour le public.</p>
              )}
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
              {isOwner && c.count === 0 && (
                <button className="btn btn--danger-ghost btn--sm" onClick={remove}>
                  <Trash2 size={15} /> Supprimer la cagnotte
                </button>
              )}
            </div>
          )}

          {tab === 'participants' &&
            (contributions.length ? (
              <>
                {top && (
                  <div className="top-donor">
                    🏆 Plus grosse participation : <b>{top.name}</b> · {fcfa(top.amount)}
                  </div>
                )}
                <ul className="donors">
                  {shownList.map((k) => (
                    <li key={k.id}>
                      <Avatar name={k.name} anonymous={k.anonymous && k.name === 'Anonyme'} size={40} />
                      <div className="donors__info">
                        <b>{k.name}{k.anonymous && k.name !== 'Anonyme' && <span className="muted"> · anonyme</span>}</b>
                        <span className="muted">{timeAgo(k.createdAt)} · {methodById(k.method)?.label}</span>
                      </div>
                      {k.amount !== null && <strong className="donors__amt">{fcfa(k.amount)}</strong>}
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
                    <Avatar name={k.name} anonymous={k.name === 'Anonyme'} size={34} />
                    <div className="bubble">
                      <b>{k.name}</b>
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
            <ProgressBlock c={c} ended={ended} />
            {!ended && c.status === 'active' && (
              <Link to={`${path}/participer`} className="btn btn--primary btn--lg btn--block">Participer</Link>
            )}
            <button className="btn btn--ghost btn--block" onClick={() => setShareOpen(true)}>
              <Share2 size={17} /> Partager
            </button>
          </div>
        </aside>
      </div>

      <div className="action-bar mobile-only">
        <button className="btn btn--soft btn--icon" aria-label="Partager" onClick={() => setShareOpen(true)}>
          <Share2 size={20} />
        </button>
        {isOwner ? (
          <button className="btn btn--primary btn--lg btn--grow" onClick={() => setWithdrawOpen(true)} disabled={c.status === 'suspended'}>
            <Wallet size={18} /> Retirer {data.balance ? fcfa(data.balance.available) : ''}
          </button>
        ) : ended || c.status !== 'active' ? (
          <span className="btn btn--disabled btn--lg btn--grow">Cagnotte clôturée</span>
        ) : (
          <Link to={`${path}/participer`} className="btn btn--primary btn--lg btn--grow">Participer</Link>
        )}
      </div>

      <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} c={c} share={share} toast={toast} />
      {isOwner && (
        <WithdrawSheet
          open={withdrawOpen}
          onClose={() => setWithdrawOpen(false)}
          campaign={c}
          onDone={reload}
        />
      )}
    </div>
  )
}

function ProgressBlock({ c, ended }) {
  const dl = daysLeft(c.deadline)
  const hidden = c.raised === null
  return (
    <>
      {hidden ? (
        <div className="pb-amount">
          <strong className="pb-private"><EyeOff size={22} /> Montants privés</strong>
          <span className="muted">L’organisateur a choisi de ne pas afficher les sommes</span>
        </div>
      ) : (
        <>
          <div className="pb-amount">
            <strong>{fcfa(c.raised)}</strong>
            <span className="muted">collectés sur {fcfa(c.goal)}</span>
          </div>
          <Progress value={c.percent} thick />
        </>
      )}
      <div className="pb-stats">
        <div><b>{hidden ? '—' : `${c.percent} %`}</b><span>de l’objectif</span></div>
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

function FacebookIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.4H8.1v3h2.5V21h2.9z" />
    </svg>
  )
}
