import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useStore, useToast } from '../store/AppStore'
import { formatPhone, isValidSnPhone } from '../lib/utils'
import { useDocumentTitle } from '../lib/hooks'
import { Field, Logo, Spinner, TopBar } from '../components/ui'

export default function Auth() {
  const [params] = useSearchParams()
  const next = params.get('next') || '/'
  const [mode, setMode] = useState(params.get('mode') === 'inscription' ? 'register' : 'login')
  const { user, login, register } = useStore()
  const toast = useToast()
  const navigate = useNavigate()
  useDocumentTitle(mode === 'login' ? 'Connexion' : 'Inscription')

  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '' })
  const [show, setShow] = useState(false)
  const [touched, setTouched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (user) return <Navigate to={next} replace />

  const set = (k) => (e) => setForm({ ...form, [k]: k === 'phone' ? formatPhone(e.target.value) : e.target.value })
  const errs = {
    name: mode === 'register' && form.name.trim().length < 2 ? 'Indiquez votre nom complet' : '',
    phone: !isValidSnPhone(form.phone) ? 'Numéro invalide (ex : 77 123 45 67)' : '',
    email: form.email && !/^\S+@\S+\.\S+$/.test(form.email) ? 'Adresse e-mail invalide' : '',
    password: form.password.length < 6 ? '6 caractères minimum' : '',
  }

  const submit = async (e) => {
    e.preventDefault()
    setTouched(true)
    setError('')
    if (Object.values(errs).some(Boolean)) return
    setLoading(true)
    try {
      if (mode === 'login') {
        const u = await login(form)
        toast(`Content de vous revoir, ${u.name.split(' ')[0]} 👋`, 'success')
      } else {
        const u = await register(form)
        toast(`Bienvenue sur Barkelou, ${u.name.split(' ')[0]} 🎉`, 'success')
      }
      navigate(next, { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const e = (k) => (touched ? errs[k] : '')

  return (
    <div className="page page--auth">
      <TopBar title="" />
      <div className="container narrow auth">
        <div className="auth__brand">
          <Logo size={48} withText={false} />
          <h1>{mode === 'login' ? 'Bon retour !' : 'Créez votre compte'}</h1>
          <p className="muted">
            {mode === 'login' ? 'Connectez-vous pour gérer vos cagnottes.' : 'Gratuit, et prêt en 30 secondes.'}
          </p>
        </div>

        <div className="segmented segmented--full" role="tablist">
          <button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'is-on' : ''} onClick={() => { setMode('login'); setTouched(false); setError('') }}>Connexion</button>
          <button role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'is-on' : ''} onClick={() => { setMode('register'); setTouched(false); setError('') }}>Inscription</button>
        </div>

        <form onSubmit={submit} noValidate className="auth__form">
          {mode === 'register' && (
            <Field label="Nom complet" htmlFor="a-name" error={e('name')}>
              <input id="a-name" className="input" autoComplete="name" placeholder="Awa Diop" value={form.name} onChange={set('name')} />
            </Field>
          )}
          <Field label="Numéro de téléphone" htmlFor="a-phone" error={e('phone')}>
            <div className="input-affix input-affix--left">
              <span>🇸🇳 +221</span>
              <input id="a-phone" type="tel" inputMode="tel" autoComplete="tel-national" className="input" placeholder="77 123 45 67" value={form.phone} onChange={set('phone')} />
            </div>
          </Field>
          {mode === 'register' && (
            <Field label="E-mail (facultatif)" htmlFor="a-email" error={e('email')}>
              <input id="a-email" type="email" inputMode="email" autoComplete="email" className="input" placeholder="awa@exemple.com" value={form.email} onChange={set('email')} />
            </Field>
          )}
          <Field label="Mot de passe" htmlFor="a-pass" error={e('password')}>
            <div className="input-affix">
              <input id="a-pass" type={show ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} className="input" placeholder="••••••" value={form.password} onChange={set('password')} />
              <button type="button" className="affix-btn" aria-label={show ? 'Masquer' : 'Afficher'} onClick={() => setShow(!show)}>
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </Field>

          {error && <p className="alert alert--error">{error}</p>}

          <button className="btn btn--primary btn--lg btn--block" disabled={loading}>
            {loading ? <Spinner /> : mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
          </button>
        </form>
        <p className="center muted small">
          {mode === 'login' ? 'Pas encore de compte ? ' : 'Déjà inscrit ? '}
          <button className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setTouched(false); setError('') }}>
            {mode === 'login' ? 'Inscrivez-vous' : 'Connectez-vous'}
          </button>
        </p>
      </div>
    </div>
  )
}
