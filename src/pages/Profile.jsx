import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ChevronRight, CircleHelp, Download, FileText, Heart, KeyRound, LaptopMinimal, LayoutDashboard, LogOut, MessageCircle, Moon, PiggyBank, Shield, Sun, SunMoon, UserPen,
} from 'lucide-react'
import { useStore, useToast } from '../store/AppStore'
import { api } from '../lib/api'
import { formatPhone } from '../lib/utils'
import { useDocumentTitle, useInstallPrompt } from '../lib/hooks'
import { Avatar, Field, Logo, Sheet, Spinner, TopBar } from '../components/ui'

export function applyTheme(t) {
  const root = document.documentElement
  if (t === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', t)
  const dark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#0B1511' : '#0B5D43'))
}

export default function Profile() {
  useDocumentTitle('Profil')
  const { user, logout, logoutAll, updateUser, settings } = useStore()
  const toast = useToast()
  const navigate = useNavigate()
  const { canInstall, installed, ios, install } = useInstallPrompt()
  const [editOpen, setEditOpen] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('barkelou:theme') || 'auto')

  useEffect(() => {
    localStorage.setItem('barkelou:theme', theme)
    applyTheme(theme)
  }, [theme])

  return (
    <div className="page">
      <TopBar title="Profil" back={false} />
      <div className="container narrow">
        {user ? (
          <div className="profile-card">
            <Avatar name={user.name} size={64} />
            <div>
              <h2>{user.name}</h2>
              <span className="muted">+221 {formatPhone(user.phone)}</span>
              {user.email && <span className="muted">{user.email}</span>}
            </div>
            <button className="icon-btn" aria-label="Modifier le profil" onClick={() => setEditOpen(true)}>
              <UserPen size={20} />
            </button>
          </div>
        ) : (
          <div className="profile-card profile-card--guest">
            <Logo size={40} withText={false} />
            <div>
              <h2>Bienvenue sur Barkelou</h2>
              <span className="muted">Connectez-vous pour créer et gérer vos cagnottes.</span>
            </div>
            <Link to="/connexion?next=/profil" className="btn btn--primary btn--block">Se connecter / S’inscrire</Link>
          </div>
        )}

        {user?.role === 'admin' && (
          <div className="menu-group">
            <h3>Administration</h3>
            <MenuLink to="/admin" icon={LayoutDashboard} label="Espace administrateur" />
          </div>
        )}

        <div className="menu-group">
          <h3>Mon activité</h3>
          <MenuLink to="/mes-cagnottes" icon={PiggyBank} label="Mes cagnottes" />
          <MenuLink to="/explorer?favoris=1" icon={Heart} label="Mes favoris" />
        </div>

        <div className="menu-group">
          <h3>Application</h3>
          {!installed && (canInstall || ios) && (
            <button
              className="menu-item"
              onClick={async () => {
                if (ios) toast('Touchez Partager ⎋ puis « Sur l’écran d’accueil »')
                else if (await install()) toast('Barkelou est installée 🎉', 'success')
              }}
            >
              <span className="menu-item__icon"><Download size={18} /></span>
              <span>Installer l’application</span>
              <ChevronRight size={18} className="muted" />
            </button>
          )}
          <div className="menu-item menu-item--static">
            <span className="menu-item__icon"><SunMoon size={18} /></span>
            <span>Apparence</span>
            <div className="segmented segmented--sm">
              {[
                ['auto', 'Auto', SunMoon],
                ['light', 'Clair', Sun],
                ['dark', 'Sombre', Moon],
              ].map(([id, label, Icon]) => (
                <button key={id} aria-label={label} className={theme === id ? 'is-on' : ''} onClick={() => setTheme(id)}>
                  <Icon size={15} />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="menu-group">
          <h3>Aide & informations</h3>
          <MenuLink to="/comment-ca-marche" icon={CircleHelp} label="Comment ça marche & FAQ" />
          <MenuLink href={`https://wa.me/${settings.contact_whatsapp}`} icon={MessageCircle} label="Nous écrire sur WhatsApp" />
          <MenuLink to="/cgu" icon={FileText} label="Conditions d’utilisation" />
          <MenuLink to="/confidentialite" icon={Shield} label="Confidentialité" />
        </div>

        {user && (
          <div className="menu-group">
            <h3>Sécurité</h3>
            <button className="menu-item" onClick={() => setPwOpen(true)}>
              <span className="menu-item__icon"><KeyRound size={18} /></span>
              <span>Changer mon mot de passe</span>
              <ChevronRight size={18} className="muted" />
            </button>
            <button
              className="menu-item"
              onClick={async () => {
                if (!confirm('Se déconnecter de tous les appareils ?')) return
                try {
                  await logoutAll()
                  toast('Déconnecté de tous les appareils')
                  navigate('/')
                } catch (e) {
                  toast(e.message, 'error')
                }
              }}
            >
              <span className="menu-item__icon"><LaptopMinimal size={18} /></span>
              <span>Déconnecter tous mes appareils</span>
              <ChevronRight size={18} className="muted" />
            </button>
            <button
              className="menu-item menu-item--danger"
              onClick={async () => {
                await logout()
                toast('Vous êtes déconnecté')
                navigate('/')
              }}
            >
              <span className="menu-item__icon"><LogOut size={18} /></span>
              <span>Se déconnecter</span>
            </button>
          </div>
        )}

        <p className="center muted small pad-y">Barkelou v1.0 · barkelou.com</p>
      </div>

      {user && (
        <EditProfile
          open={editOpen}
          onClose={() => setEditOpen(false)}
          user={user}
          onSave={async (p) => {
            try {
              await updateUser(p)
              toast('Profil mis à jour ✓', 'success')
              setEditOpen(false)
            } catch (e) {
              toast(e.message, 'error')
            }
          }}
        />
      )}
      {user && <ChangePassword open={pwOpen} onClose={() => setPwOpen(false)} />}
    </div>
  )
}

function MenuLink({ to, href, icon: Icon, label }) {
  const inner = (
    <>
      <span className="menu-item__icon"><Icon size={18} /></span>
      <span>{label}</span>
      <ChevronRight size={18} className="muted" />
    </>
  )
  return href ? (
    <a className="menu-item" href={href} target="_blank" rel="noreferrer">{inner}</a>
  ) : (
    <Link className="menu-item" to={to}>{inner}</Link>
  )
}

function EditProfile({ open, onClose, user, onSave }) {
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email || '')
  return (
    <Sheet open={open} onClose={onClose} title="Modifier mon profil">
      <Field label="Nom complet" htmlFor="p-name" error={name.trim().length < 2 ? 'Nom trop court' : ''}>
        <input id="p-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="E-mail" htmlFor="p-email">
        <input id="p-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <button className="btn btn--primary btn--lg btn--block" disabled={name.trim().length < 2} onClick={() => onSave({ name: name.trim(), email: email.trim() })}>
        Enregistrer
      </button>
    </Sheet>
  )
}

function ChangePassword({ open, onClose }) {
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post('/auth/password', { current, next })
      toast('Mot de passe modifié ✓ — vos autres appareils sont déconnectés', 'success')
      setCurrent('')
      setNext('')
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Changer mon mot de passe">
      <form onSubmit={submit} className="sheet__body" noValidate>
        <Field label="Mot de passe actuel" htmlFor="pw-cur">
          <input id="pw-cur" type="password" autoComplete="current-password" className="input" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="Nouveau mot de passe" htmlFor="pw-new" error={next && next.length < 8 ? '8 caractères minimum' : ''}>
          <input id="pw-new" type="password" autoComplete="new-password" className="input" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        {error && <p className="alert alert--error">{error}</p>}
        <button className="btn btn--primary btn--lg btn--block" disabled={busy || !current || next.length < 8}>
          {busy ? <Spinner /> : 'Enregistrer'}
        </button>
      </form>
    </Sheet>
  )
}
