import { useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, CalendarClock, Heart, MapPin, Users, X } from 'lucide-react'
import { catById } from '../lib/categories'
import { colorFor, compact, daysLeftLabel, fcfa, initials, pct } from '../lib/utils'
import { useStore } from '../store/AppStore'

export function Logo({ size = 32, withText = true, light = false }) {
  return (
    <span className={`logo ${light ? 'logo--light' : ''}`}>
      <img src="/favicon.svg" width={size} height={size} alt="" />
      {withText && <span className="logo__text">Barkelou</span>}
    </span>
  )
}

export function Avatar({ name, size = 40, anonymous = false }) {
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.38, background: anonymous ? '#94A3B8' : colorFor(name) }}
      aria-hidden="true"
    >
      {anonymous ? '?' : initials(name)}
    </span>
  )
}

export function Progress({ value, thick = false }) {
  return (
    <div className={`progress ${thick ? 'progress--thick' : ''}`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.max(value, 2)}%` }} />
    </div>
  )
}

export function Cover({ campaign, className = '', iconSize = 44 }) {
  const cat = catById(campaign.category)
  if (campaign.cover) {
    return (
      <div className={`cover ${className}`}>
        <img src={campaign.cover} alt="" loading="lazy" />
      </div>
    )
  }
  const { Icon } = cat
  return (
    <div className={`cover cover--art ${className}`} style={{ '--from': cat.from, '--to': cat.to }}>
      <span className="cover__dots" />
      <Icon size={iconSize} strokeWidth={1.6} />
    </div>
  )
}

export function CategoryChip({ id, light = false }) {
  const cat = catById(id)
  const { Icon } = cat
  return (
    <span className={`chip ${light ? 'chip--light' : ''}`}>
      <Icon size={13} strokeWidth={2.2} /> {cat.label}
    </span>
  )
}

export function FavButton({ id, className = '' }) {
  const { state, toggleFavorite } = useStore()
  const on = state.favorites.includes(id)
  return (
    <button
      type="button"
      className={`fav ${on ? 'fav--on' : ''} ${className}`}
      aria-label={on ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      aria-pressed={on}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        toggleFavorite(id)
      }}
    >
      <Heart size={18} fill={on ? 'currentColor' : 'none'} />
    </button>
  )
}

export function CampaignCard({ campaign, variant = 'default' }) {
  const p = pct(campaign.raised, campaign.goal)
  const ended = campaign.status === 'closed'
  return (
    <Link to={`/c/${campaign.slug}`} className={`ccard ccard--${variant}`}>
      <div className="ccard__media">
        <Cover campaign={campaign} iconSize={variant === 'row' ? 26 : 44} />
        {variant !== 'row' && (
          <>
            <span className="ccard__chip">
              <CategoryChip id={campaign.category} light />
            </span>
            {campaign.id !== 'preview' && campaign.slug && <FavButton id={campaign.id} className="ccard__fav" />}
          </>
        )}
      </div>
      <div className="ccard__body">
        <h3 className="ccard__title">{campaign.title}</h3>
        <p className="ccard__meta">
          <span>{campaign.ownerName}</span>
          {campaign.city && (
            <>
              <span className="dot" />
              <MapPin size={12} /> {campaign.city}
            </>
          )}
        </p>
        <Progress value={p} />
        <div className="ccard__nums">
          <span>
            <strong>{fcfa(campaign.raised)}</strong>
            <em> / {compact(campaign.goal)}</em>
          </span>
          <span className="muted">{ended ? 'Clôturée' : `${p} %`}</span>
        </div>
        {variant !== 'row' && (
          <div className="ccard__foot">
            <span>
              <Users size={13} /> {campaign.count} participant{campaign.count > 1 ? 's' : ''}
            </span>
            <span>
              <CalendarClock size={13} /> {ended ? 'Terminée' : daysLeftLabel(campaign.deadline)}
            </span>
          </div>
        )}
      </div>
    </Link>
  )
}

export function TopBar({ title, back = true, right = null, transparent = false }) {
  const navigate = useNavigate()
  return (
    <header className={`topbar ${transparent ? 'topbar--transparent' : ''}`}>
      {back ? (
        <button
          type="button"
          className="icon-btn"
          aria-label="Retour"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
        >
          <ArrowLeft size={22} />
        </button>
      ) : (
        <span className="topbar__spacer" />
      )}
      <h1 className="topbar__title">{title}</h1>
      <div className="topbar__right">{right || <span className="topbar__spacer" />}</div>
    </header>
  )
}

export function Sheet({ open, onClose, title, children }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <span className="sheet__grip" />
        <div className="sheet__head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Fermer" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="sheet__body">{children}</div>
      </div>
    </div>
  )
}

export function Empty({ icon: Icon, title, text, action }) {
  return (
    <div className="empty">
      {Icon && (
        <span className="empty__icon">
          <Icon size={28} />
        </span>
      )}
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  )
}

export function Field({ label, hint, error, children, htmlFor, counter }) {
  return (
    <div className={`field ${error ? 'field--error' : ''}`}>
      {label && (
        <label htmlFor={htmlFor} className="field__label">
          <span>{label}</span>
          {counter && <span className="field__counter">{counter}</span>}
        </label>
      )}
      {children}
      {error ? <p className="field__error">{error}</p> : hint ? <p className="field__hint">{hint}</p> : null}
    </div>
  )
}

export function Spinner({ size = 20 }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-hidden="true" />
}

export function MethodBadge({ method, size = 36 }) {
  const label = { wave: 'W', orange: 'OM', free: 'FM', card: '' }[method.id]
  return (
    <span className="method-badge" style={{ width: size, height: size, background: method.color, color: method.ink }}>
      {method.id === 'card' ? (
        <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
        </svg>
      ) : (
        label
      )}
    </span>
  )
}
