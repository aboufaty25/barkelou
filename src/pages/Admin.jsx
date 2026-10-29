import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle, ArrowDownToLine, BadgePercent, Banknote, CheckCircle2, ClipboardList, CreditCard, Eye, EyeOff,
  FileClock, Flag, KeyRound, LayoutDashboard, PiggyBank, Search, Settings, ShieldCheck, Star, Users, Wallet, Wrench,
} from 'lucide-react'
import { useApi, useStore, useToast } from '../store/AppStore'
import { api, qs } from '../lib/api'
import { catById } from '../lib/categories'
import { compact, fcfa, formatPhone, timeAgo } from '../lib/utils'
import { methodById } from '../services/payments'
import { useDocumentTitle } from '../lib/hooks'
import { Empty, ErrorState, Field, Loader, Sheet, Spinner, TopBar } from '../components/ui'

const TABS = [
  { id: 'tableau', label: 'Tableau de bord', Icon: LayoutDashboard },
  { id: 'parametres', label: 'Paramètres', Icon: Settings },
  { id: 'retraits', label: 'Retraits', Icon: ArrowDownToLine },
  { id: 'paiements', label: 'Paiements', Icon: CreditCard },
  { id: 'cagnottes', label: 'Cagnottes', Icon: PiggyBank },
  { id: 'utilisateurs', label: 'Utilisateurs', Icon: Users },
  { id: 'journal', label: 'Journal', Icon: ClipboardList },
]

export default function Admin() {
  useDocumentTitle('Administration')
  const { user, ready } = useStore()
  const [params, setParams] = useSearchParams()
  const tab = params.get('onglet') || 'tableau'
  const pw = usePasswordPrompt()

  if (!ready) return <Loader />
  if (!user) return <Navigate to="/connexion?next=/admin" replace />
  if (user.role !== 'admin') return <Navigate to="/" replace />

  const go = (id) => setParams(id === 'tableau' ? {} : { onglet: id }, { replace: true })

  return (
    <div className="page admin">
      <TopBar title="Administration" />
      <div className="container admin__layout">
        <nav className="admin__nav" aria-label="Sections administration">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} className={tab === id ? 'is-on' : ''} onClick={() => go(id)}>
              <Icon size={18} /> <span>{label}</span>
            </button>
          ))}
        </nav>
        <section className="admin__content">
          {tab === 'tableau' && <Overview go={go} />}
          {tab === 'parametres' && <SettingsPanel askPassword={pw.ask} />}
          {tab === 'retraits' && <Withdrawals askPassword={pw.ask} />}
          {tab === 'paiements' && <Payments />}
          {tab === 'cagnottes' && <Campaigns />}
          {tab === 'utilisateurs' && <UsersPanel askPassword={pw.ask} />}
          {tab === 'journal' && <Audit />}
        </section>
      </div>
      {pw.element}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Confirmation par mot de passe                                      */
/* ------------------------------------------------------------------ */
function usePasswordPrompt() {
  const [req, setReq] = useState(null)
  const [value, setValue] = useState('')
  const [show, setShow] = useState(false)
  const ask = (title) =>
    new Promise((resolve) => {
      setValue('')
      setReq({ title, resolve })
    })
  const close = (v) => {
    req?.resolve(v)
    setReq(null)
  }
  const element = (
    <Sheet open={!!req} onClose={() => close(null)} title={req?.title || 'Confirmation'}>
      <form
        className="sheet__body"
        onSubmit={(e) => {
          e.preventDefault()
          if (value) close(value)
        }}
      >
        <p className="muted">Par sécurité, confirmez avec votre mot de passe administrateur.</p>
        <div className="input-affix">
          <input type={show ? 'text' : 'password'} className="input" autoComplete="current-password" autoFocus placeholder="Mot de passe" value={value} onChange={(e) => setValue(e.target.value)} />
          <button type="button" className="affix-btn" onClick={() => setShow(!show)} aria-label="Afficher">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
        </div>
        <button className="btn btn--primary btn--lg btn--block" disabled={!value}><KeyRound size={16} /> Confirmer</button>
      </form>
    </Sheet>
  )
  return { ask, element }
}

/* ------------------------------------------------------------------ */
/* Tableau de bord                                                    */
/* ------------------------------------------------------------------ */
function Overview({ go }) {
  const { data, error, loading, reload } = useApi('/admin/overview')
  if (loading && !data) return <Loader />
  if (error) return <ErrorState error={error} onRetry={reload} />
  const t = data.totals
  const max = Math.max(1, ...data.daily.map((d) => d.amount))
  return (
    <>
      <h1 className="admin__title">Tableau de bord</h1>
      {data.payments.simulated ? (
        <div className="alert alert--warn row gap-8"><AlertTriangle size={18} /> Mode développement : PayDunya est simulé, aucun argent réel ne circule.</div>
      ) : !data.payments.configured ? (
        <div className="alert alert--error row gap-8 wrap">
          <AlertTriangle size={18} /> Les clés PayDunya ne sont pas configurées : paiements et retraits désactivés.
          <button className="link" onClick={() => go('parametres')}>Configurer</button>
        </div>
      ) : (
        <div className={`alert ${data.payments.mode === 'live' ? 'alert--ok' : 'alert--warn'} row gap-8`}>
          <ShieldCheck size={18} /> PayDunya connecté en mode <b>{data.payments.mode === 'live' ? 'production' : 'test'}</b>
        </div>
      )}

      <div className="admin-kpis">
        <Kpi icon={Banknote} label="Total collecté" value={fcfa(t.raised)} sub={`${t.payments} paiements`} main />
        <Kpi icon={BadgePercent} label="Commissions gagnées" value={fcfa(t.commissions + t.withdrawal_fees)} sub={`dont ${fcfa(t.withdrawal_fees)} de frais de retrait`} />
        <Kpi icon={Wallet} label="Fonds à reverser" value={fcfa(t.owed)} sub="soldes des cagnottes" />
        <Kpi icon={ArrowDownToLine} label="Versé aux organisateurs" value={fcfa(t.paid_out)} />
        <Kpi icon={FileClock} label="Retraits à valider" value={t.withdrawals_pending} sub={`${t.withdrawals_processing} en cours chez l’opérateur`} onClick={() => go('retraits')} alert={t.withdrawals_pending > 0} />
        <Kpi icon={Flag} label="Cagnottes à valider" value={t.campaigns_pending} sub={`${t.campaigns} cagnottes au total`} onClick={() => go('cagnottes')} alert={t.campaigns_pending > 0} />
        <Kpi icon={Users} label="Utilisateurs" value={t.users} />
      </div>

      <div className="panel">
        <div className="panel__head"><h2>Collecte des 30 derniers jours</h2></div>
        <div className="bars" role="img" aria-label="Montants collectés par jour">
          {data.daily.map((d) => (
            <div key={d.day} className="bars__col" title={`${new Date(d.day).toLocaleDateString('fr-FR')} : ${fcfa(d.amount)} (commission ${fcfa(d.commission)})`}>
              <span style={{ height: `${(d.amount / max) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="bars__axis"><span>il y a 30 j</span><span>aujourd’hui</span></div>
      </div>
    </>
  )
}

function Kpi({ icon: Icon, label, value, sub, main, onClick, alert }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className={`akpi ${main ? 'akpi--main' : ''} ${alert ? 'akpi--alert' : ''}`} onClick={onClick}>
      <Icon size={18} />
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </Tag>
  )
}

/* ------------------------------------------------------------------ */
/* Paramètres                                                         */
/* ------------------------------------------------------------------ */
function SettingsPanel({ askPassword }) {
  const toast = useToast()
  const { refreshSettings } = useStore()
  const { data, error, loading, reload } = useApi('/admin/settings')
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (data) setForm(data.settings)
  }, [data])

  const dirty = useMemo(() => {
    if (!form || !data) return {}
    const out = {}
    for (const [k, v] of Object.entries(form)) {
      if (k.endsWith('_set') || k.endsWith('_hint')) continue
      if (JSON.stringify(v) !== JSON.stringify(data.settings[k])) out[k] = v
    }
    return out
  }, [form, data])

  if (loading && !data) return <Loader />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!form) return <Loader />

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  const setNested = (k, sub) => (v) => setForm((f) => ({ ...f, [k]: { ...f[k], [sub]: v } }))
  const changed = Object.keys(dirty).length

  const save = async () => {
    const password = await askPassword('Enregistrer les paramètres')
    if (!password) return
    setBusy(true)
    try {
      const r = await api.put('/admin/settings', { ...dirty, password })
      toast(`${r.changed.length} paramètre${r.changed.length > 1 ? 's' : ''} enregistré${r.changed.length > 1 ? 's' : ''} ✓`, 'success')
      reload()
      refreshSettings()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  // Simulation pour un don de 10 000 F
  const ex = 10000
  const exCom = Math.min(ex, Math.round((ex * form.commission_rate) / 100) + Number(form.commission_fixed || 0))
  const exWfee = Math.min(ex, Math.round((ex * form.withdrawal_fee_rate) / 100) + Number(form.withdrawal_fee_fixed || 0))

  return (
    <>
      <h1 className="admin__title">Paramètres</h1>

      <SettingsGroup icon={BadgePercent} title="Commission de la plateforme" desc="Prélevée sur chaque participation réussie.">
        <div className="grid-2">
          <NumField label="Commission (%)" value={form.commission_rate} onChange={set('commission_rate')} step="0.1" max={50} suffix="%" />
          <NumField label="Commission fixe par paiement" value={form.commission_fixed} onChange={set('commission_fixed')} suffix="F" />
        </div>
        <Field label="Qui paie la commission ?">
          <div className="segmented segmented--full">
            <button type="button" className={form.fee_payer === 'organizer' ? 'is-on' : ''} onClick={() => set('fee_payer')('organizer')}>Déduite de la cagnotte</button>
            <button type="button" className={form.fee_payer === 'donor' ? 'is-on' : ''} onClick={() => set('fee_payer')('donor')}>Ajoutée au donateur</button>
          </div>
        </Field>
        <div className="example">
          Exemple pour un don de <b>{fcfa(ex)}</b> : le donateur paie <b>{fcfa(form.fee_payer === 'donor' ? ex + exCom : ex)}</b>, Barkelou garde{' '}
          <b>{fcfa(exCom)}</b>, la cagnotte reçoit <b>{fcfa(form.fee_payer === 'donor' ? ex : ex - exCom)}</b>.
        </div>
      </SettingsGroup>

      <SettingsGroup icon={ArrowDownToLine} title="Retraits" desc="Les organisateurs peuvent retirer leur solde à tout moment.">
        <Field label="Traitement des retraits">
          <div className="segmented segmented--full">
            <button type="button" className={form.withdrawal_mode === 'automatic' ? 'is-on' : ''} onClick={() => set('withdrawal_mode')('automatic')}>Automatique (immédiat)</button>
            <button type="button" className={form.withdrawal_mode === 'manual' ? 'is-on' : ''} onClick={() => set('withdrawal_mode')('manual')}>Validation manuelle</button>
          </div>
        </Field>
        <div className="grid-2">
          <NumField label="Frais de retrait (%)" value={form.withdrawal_fee_rate} onChange={set('withdrawal_fee_rate')} step="0.1" max={50} suffix="%" />
          <NumField label="Frais fixes par retrait" value={form.withdrawal_fee_fixed} onChange={set('withdrawal_fee_fixed')} suffix="F" />
          <NumField label="Retrait minimum" value={form.min_withdrawal} onChange={set('min_withdrawal')} suffix="F" />
          <NumField label="Plafond par 24 h et par utilisateur" value={form.max_withdrawal_per_day} onChange={set('max_withdrawal_per_day')} suffix="F" />
        </div>
        <Toggle label="Retrait uniquement vers le numéro du compte" hint="Fortement recommandé : empêche un voleur de mot de passe d’envoyer l’argent ailleurs." checked={form.withdraw_to_account_phone_only} onChange={set('withdraw_to_account_phone_only')} />
        <p className="field__label">Moyens de retrait</p>
        <div className="toggles">
          <Toggle label="Wave" checked={form.withdrawal_methods.wave} onChange={setNested('withdrawal_methods', 'wave')} />
          <Toggle label="Orange Money" checked={form.withdrawal_methods.orange} onChange={setNested('withdrawal_methods', 'orange')} />
          <Toggle label="Free Money" checked={form.withdrawal_methods.free} onChange={setNested('withdrawal_methods', 'free')} />
        </div>
        <div className="example">Pour un retrait de <b>{fcfa(ex)}</b>, l’organisateur reçoit <b>{fcfa(ex - exWfee)}</b>.</div>
      </SettingsGroup>

      <SettingsGroup icon={CreditCard} title="Participations">
        <div className="grid-2">
          <NumField label="Participation minimum" value={form.min_contribution} onChange={set('min_contribution')} suffix="F" />
          <NumField label="Participation maximum" value={form.max_contribution} onChange={set('max_contribution')} suffix="F" />
          <NumField label="Objectif maximum d’une cagnotte" value={form.max_campaign_goal} onChange={set('max_campaign_goal')} suffix="F" />
        </div>
        <p className="field__label">Moyens de paiement proposés</p>
        <div className="toggles">
          <Toggle label="Wave" checked={form.channels.wave} onChange={setNested('channels', 'wave')} />
          <Toggle label="Orange Money" checked={form.channels.orange} onChange={setNested('channels', 'orange')} />
          <Toggle label="Free Money" checked={form.channels.free} onChange={setNested('channels', 'free')} />
          <Toggle label="Carte bancaire" checked={form.channels.card} onChange={setNested('channels', 'card')} />
        </div>
      </SettingsGroup>

      <SettingsGroup icon={KeyRound} title="PayDunya" desc="Clés disponibles dans votre compte PayDunya Business › Intégration API. Elles sont chiffrées et ne sont jamais réaffichées.">
        {data.simulated && <p className="alert alert--warn">Serveur en mode développement : PayDunya est simulé, les clés ne sont pas utilisées.</p>}
        <Field label="Mode">
          <div className="segmented segmented--full">
            <button type="button" className={form.paydunya_mode === 'test' ? 'is-on' : ''} onClick={() => set('paydunya_mode')('test')}>Test (sandbox)</button>
            <button type="button" className={form.paydunya_mode === 'live' ? 'is-on' : ''} onClick={() => set('paydunya_mode')('live')}>Production (argent réel)</button>
          </div>
        </Field>
        <SecretField label="Clé principale (Master Key)" k="paydunya_master_key" form={form} set={set} />
        <SecretField label="Clé privée (Private Key)" k="paydunya_private_key" form={form} set={set} />
        <SecretField label="Token" k="paydunya_token" form={form} set={set} />
        <Field label="Nom affiché sur la page de paiement">
          <input className="input" value={form.paydunya_store_name} maxLength={60} onChange={(e) => set('paydunya_store_name')(e.target.value)} />
        </Field>
        <div className="example">
          URL de notification (IPN) à déclarer chez PayDunya : <code>{window.location.origin}/api/payments/ipn</code>
        </div>
      </SettingsGroup>

      <SettingsGroup icon={Wrench} title="Général">
        <div className="grid-2">
          <Field label="Nom du site"><input className="input" value={form.site_name} maxLength={60} onChange={(e) => set('site_name')(e.target.value)} /></Field>
          <Field label="E-mail de contact"><input className="input" type="email" value={form.contact_email} onChange={(e) => set('contact_email')(e.target.value)} /></Field>
          <Field label="WhatsApp (avec indicatif, ex : 221770000000)"><input className="input" inputMode="numeric" value={form.contact_whatsapp} onChange={(e) => set('contact_whatsapp')(e.target.value.replace(/\D/g, ''))} /></Field>
        </div>
        <Toggle label="Inscriptions ouvertes" checked={form.allow_signups} onChange={set('allow_signups')} />
        <Toggle label="Publier les nouvelles cagnottes sans validation" hint="Désactivez pour valider chaque cagnotte avant qu’elle soit visible." checked={form.auto_publish_campaigns} onChange={set('auto_publish_campaigns')} />
        <Toggle label="Mode maintenance" hint="Bloque les paiements, créations et retraits (l’admin reste accessible)." checked={form.maintenance_mode} onChange={set('maintenance_mode')} />
        {form.maintenance_mode && (
          <Field label="Message de maintenance"><textarea className="input" rows={2} maxLength={300} value={form.maintenance_message} onChange={(e) => set('maintenance_message')(e.target.value)} /></Field>
        )}
      </SettingsGroup>

      <div className={`savebar ${changed ? 'is-visible' : ''}`}>
        <span>{changed} modification{changed > 1 ? 's' : ''} non enregistrée{changed > 1 ? 's' : ''}</span>
        <div className="row gap-8">
          <button className="btn btn--soft" onClick={() => setForm(data.settings)} disabled={busy}>Annuler</button>
          <button className="btn btn--primary" onClick={save} disabled={busy}>{busy ? <Spinner /> : 'Enregistrer'}</button>
        </div>
      </div>
    </>
  )
}

function SettingsGroup({ icon: Icon, title, desc, children }) {
  return (
    <div className="panel">
      <div className="panel__head">
        <span className="panel__icon"><Icon size={18} /></span>
        <div>
          <h2>{title}</h2>
          {desc && <p className="muted small">{desc}</p>}
        </div>
      </div>
      <div className="panel__body">{children}</div>
    </div>
  )
}

function NumField({ label, value, onChange, suffix, step = '1', max }) {
  return (
    <Field label={label}>
      <div className="input-affix">
        <input
          className="input"
          type="number"
          inputMode="decimal"
          min="0"
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value === '' ? 0 : step === '1' ? Math.round(Number(e.target.value)) : Number(e.target.value))}
        />
        {suffix && <span>{suffix}</span>}
      </div>
    </Field>
  )
}

function Toggle({ label, hint, checked, onChange }) {
  return (
    <label className="switch-row">
      <span>
        <span>
          <b>{label}</b>
          {hint && <small>{hint}</small>}
        </span>
      </span>
      <input type="checkbox" className="switch" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

function SecretField({ label, k, form, set }) {
  return (
    <Field label={label} hint={form[`${k}_set`] ? `Enregistrée (${form[`${k}_hint`]}) — laissez vide pour ne pas la changer` : 'Non configurée'}>
      <input className="input mono" type="password" autoComplete="off" spellCheck={false} placeholder={form[`${k}_set`] ? '••••••••••••' : 'Collez la clé ici'} value={form[k]} onChange={(e) => set(k)(e.target.value)} />
    </Field>
  )
}

/* ------------------------------------------------------------------ */
/* Listes                                                             */
/* ------------------------------------------------------------------ */
const WSTATUS = {
  pending_review: ['À valider', 'badge--pending'],
  processing: ['En cours', 'badge--pending'],
  success: ['Envoyé', 'badge--ok'],
  failed: ['Échoué', 'badge--fail'],
  rejected: ['Refusé', 'badge--fail'],
}
const PSTATUS = { paid: ['Payé', 'badge--ok'], pending: ['En attente', 'badge--pending'], failed: ['Échoué', 'badge--fail'], cancelled: ['Annulé', 'badge--muted'] }
const CSTATUS = { active: ['Active', 'badge--ok'], pending: ['À valider', 'badge--pending'], closed: ['Clôturée', 'badge--muted'], suspended: ['Suspendue', 'badge--fail'] }

function Filters({ value, onChange, options, search, onSearch, placeholder }) {
  return (
    <div className="filters">
      {onSearch && (
        <label className="search search--sm">
          <Search size={16} />
          <input type="search" placeholder={placeholder} value={search} onChange={(e) => onSearch(e.target.value)} />
        </label>
      )}
      {options && (
        <div className="chips-row">
          {options.map(([id, label]) => (
            <button key={id} className={`fchip ${value === id ? 'is-on' : ''}`} onClick={() => onChange(id)}>{label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

function useDebounced(v, ms = 300) {
  const [d, setD] = useState(v)
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms)
    return () => clearTimeout(t)
  }, [v, ms])
  return d
}

function Withdrawals({ askPassword }) {
  const toast = useToast()
  const [status, setStatus] = useState('pending_review')
  const { data, error, loading, reload } = useApi(`/admin/withdrawals${qs({ status })}`)
  const [busy, setBusy] = useState(null)

  const approve = async (w) => {
    const password = await askPassword(`Envoyer ${fcfa(w.payout)} à ${w.owner_name}`)
    if (!password) return
    setBusy(w.id)
    try {
      const r = await api.post(`/admin/withdrawals/${w.id}/approve`, { password })
      toast(r.withdrawal.status === 'success' ? 'Retrait envoyé ✓' : r.withdrawal.status === 'failed' ? `Échec : ${r.withdrawal.failure_reason}` : 'Retrait en cours', r.withdrawal.status === 'failed' ? 'error' : 'success')
      reload()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(null)
    }
  }
  const reject = async (w) => {
    const reason = prompt('Motif du refus (visible par l’organisateur) :')
    if (!reason || reason.trim().length < 3) return
    setBusy(w.id)
    try {
      await api.post(`/admin/withdrawals/${w.id}/reject`, { reason })
      toast('Retrait refusé, le solde est restitué')
      reload()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <h1 className="admin__title">Retraits</h1>
      <Filters value={status} onChange={setStatus} options={[['pending_review', 'À valider'], ['processing', 'En cours'], ['success', 'Envoyés'], ['failed', 'Échoués'], ['rejected', 'Refusés'], ['', 'Tous']]} />
      {loading && !data ? <Loader /> : error ? <ErrorState error={error} onRetry={reload} /> : !data.withdrawals.length ? (
        <Empty icon={CheckCircle2} title="Rien à traiter" text="Aucun retrait dans cette catégorie." />
      ) : (
        <ul className="alist">
          {data.withdrawals.map((w) => (
            <li key={w.id} className="arow">
              <div className="arow__main">
                <b>{fcfa(w.payout)}</b> <span className="muted">→ {methodById(w.method)?.label} +221 {formatPhone(w.phone)}</span>
                <span className="muted small block">
                  {w.owner_name} ({formatPhone(w.owner_phone)}) · <Link className="link" to={`/c/${w.slug}`}>{w.title}</Link> · {timeAgo(w.created_at)}
                </span>
                <span className="muted small block">Débité {fcfa(w.amount)} · frais {fcfa(w.fee)}{w.provider_tx && ` · Réf. ${w.provider_tx}`}</span>
                {w.failure_reason && <span className="small block danger-text">{w.failure_reason}</span>}
              </div>
              <div className="arow__side">
                <span className={`badge ${WSTATUS[w.status][1]}`}>{WSTATUS[w.status][0]}</span>
                {w.status === 'pending_review' && (
                  <div className="row gap-8">
                    <button className="btn btn--soft btn--sm" disabled={busy === w.id} onClick={() => reject(w)}>Refuser</button>
                    <button className="btn btn--primary btn--sm" disabled={busy === w.id} onClick={() => approve(w)}>{busy === w.id ? <Spinner size={14} /> : 'Envoyer'}</button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function Payments() {
  const [status, setStatus] = useState('paid')
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const { data, error, loading, reload } = useApi(`/admin/payments${qs({ status, q: dq })}`)
  return (
    <>
      <h1 className="admin__title">Paiements</h1>
      <Filters value={status} onChange={setStatus} options={[['paid', 'Payés'], ['pending', 'En attente'], ['failed', 'Échoués'], ['cancelled', 'Annulés'], ['', 'Tous']]} search={q} onSearch={setQ} placeholder="Donateur, cagnotte, référence…" />
      {loading && !data ? <Loader /> : error ? <ErrorState error={error} onRetry={reload} /> : !data.payments.length ? (
        <Empty icon={CreditCard} title="Aucun paiement" />
      ) : (
        <ul className="alist">
          {data.payments.map((k) => (
            <li key={k.id} className="arow">
              <div className="arow__main">
                <b>{fcfa(k.total_charged)}</b> <span className="muted">· {k.donor_name}{k.anonymous && ' (anonyme)'} · {methodById(k.channel)?.label}</span>
                <span className="muted small block"><Link className="link" to={`/c/${k.slug}`}>{k.title}</Link> · {timeAgo(k.created_at)}{k.provider_mode && ` · ${k.provider_mode}`}</span>
                <span className="muted small block">Don {fcfa(k.amount)} · commission {fcfa(k.commission)} · net cagnotte {fcfa(k.net)}</span>
                {k.provider_token && <span className="muted small block mono">{k.provider_token}</span>}
              </div>
              <div className="arow__side">
                <span className={`badge ${PSTATUS[k.status][1]}`}>{PSTATUS[k.status][0]}</span>
                {k.receipt_url && <a className="link small" href={k.receipt_url} target="_blank" rel="noreferrer">Reçu</a>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function Campaigns() {
  const toast = useToast()
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const { data, error, loading, reload } = useApi(`/admin/campaigns${qs({ status, q: dq })}`)
  const update = async (c, patch, msg) => {
    if (patch.status === 'suspended' && !confirm(`Suspendre « ${c.title} » ? Les paiements et retraits seront bloqués.`)) return
    try {
      await api.patch(`/admin/campaigns/${c.id}`, patch)
      toast(msg, 'success')
      reload()
    } catch (e) {
      toast(e.message, 'error')
    }
  }
  return (
    <>
      <h1 className="admin__title">Cagnottes</h1>
      <Filters value={status} onChange={setStatus} options={[['', 'Toutes'], ['pending', 'À valider'], ['active', 'Actives'], ['closed', 'Clôturées'], ['suspended', 'Suspendues']]} search={q} onSearch={setQ} placeholder="Titre, organisateur, téléphone…" />
      {loading && !data ? <Loader /> : error ? <ErrorState error={error} onRetry={reload} /> : !data.campaigns.length ? (
        <Empty icon={PiggyBank} title="Aucune cagnotte" />
      ) : (
        <ul className="alist">
          {data.campaigns.map((c) => (
            <li key={c.id} className="arow">
              <div className="arow__main">
                <Link className="link" to={`/c/${c.slug}`}><b>{c.title}</b></Link>
                <span className="muted small block">{catById(c.category).label} · {c.owner_name} ({formatPhone(c.owner_phone)}) · {timeAgo(c.created_at)}</span>
                <span className="muted small block">Collecté {fcfa(c.raised)} / {compact(c.goal)} F · {c.count} participants · solde {fcfa(c.available)}</span>
              </div>
              <div className="arow__side">
                <span className={`badge ${CSTATUS[c.status][1]}`}>{CSTATUS[c.status][0]}</span>
                <div className="row gap-8 wrap end">
                  <button className={`btn btn--soft btn--sm ${c.featured ? 'is-gold' : ''}`} title="À la une" onClick={() => update(c, { featured: !c.featured }, c.featured ? 'Retirée de la une' : 'Mise à la une')}>
                    <Star size={14} fill={c.featured ? 'currentColor' : 'none'} />
                  </button>
                  {c.status === 'pending' && <button className="btn btn--primary btn--sm" onClick={() => update(c, { status: 'active' }, 'Cagnotte publiée')}>Valider</button>}
                  {c.status === 'suspended' ? (
                    <button className="btn btn--soft btn--sm" onClick={() => update(c, { status: 'active' }, 'Cagnotte réactivée')}>Réactiver</button>
                  ) : (
                    <button className="btn btn--soft btn--sm danger-text" onClick={() => update(c, { status: 'suspended' }, 'Cagnotte suspendue')}>Suspendre</button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function UsersPanel({ askPassword }) {
  const toast = useToast()
  const { user: me } = useStore()
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const { data, error, loading, reload } = useApi(`/admin/users${qs({ q: dq })}`)
  const update = async (u, patch, msg) => {
    if (patch.status === 'suspended' && !confirm(`Suspendre ${u.name} ? Il sera déconnecté immédiatement.`)) return
    if (patch.role) {
      const password = await askPassword(patch.role === 'admin' ? `Nommer ${u.name} administrateur` : `Retirer les droits admin de ${u.name}`)
      if (!password) return
      patch.password = password
    }
    try {
      await api.patch(`/admin/users/${u.id}`, patch)
      toast(msg, 'success')
      reload()
    } catch (e) {
      toast(e.message, 'error')
    }
  }
  return (
    <>
      <h1 className="admin__title">Utilisateurs</h1>
      <Filters search={q} onSearch={setQ} placeholder="Nom, téléphone, e-mail…" />
      {loading && !data ? <Loader /> : error ? <ErrorState error={error} onRetry={reload} /> : (
        <ul className="alist">
          {data.users.map((u) => (
            <li key={u.id} className="arow">
              <div className="arow__main">
                <b>{u.name}</b> {u.role === 'admin' && <span className="badge badge--ok">Admin</span>}
                <span className="muted small block">+221 {formatPhone(u.phone)}{u.email && ` · ${u.email}`}</span>
                <span className="muted small block">Inscrit {timeAgo(u.created_at)} · {u.campaigns} cagnotte{u.campaigns > 1 ? 's' : ''}{u.last_login_at && ` · vu ${timeAgo(u.last_login_at)}`}</span>
              </div>
              <div className="arow__side">
                <span className={`badge ${u.status === 'active' ? 'badge--ok' : 'badge--fail'}`}>{u.status === 'active' ? 'Actif' : 'Suspendu'}</span>
                {u.id !== me.id && (
                  <div className="row gap-8 wrap end">
                    <button className="btn btn--soft btn--sm" onClick={() => update(u, { role: u.role === 'admin' ? 'user' : 'admin' }, 'Rôle mis à jour')}>
                      {u.role === 'admin' ? 'Retirer admin' : 'Nommer admin'}
                    </button>
                    {u.status === 'active' ? (
                      <button className="btn btn--soft btn--sm danger-text" onClick={() => update(u, { status: 'suspended' }, 'Compte suspendu')}>Suspendre</button>
                    ) : (
                      <button className="btn btn--soft btn--sm" onClick={() => update(u, { status: 'active' }, 'Compte réactivé')}>Réactiver</button>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

const ACTIONS = {
  'payment.paid': 'Paiement reçu',
  'payment.rejected_mismatch': '⚠ Paiement rejeté (montant incohérent)',
  'payment.ipn_bad_hash': '⚠ Notification PayDunya non signée',
  'withdrawal.request': 'Demande de retrait',
  'withdrawal.success': 'Retrait envoyé',
  'withdrawal.failed': 'Retrait échoué',
  'withdrawal.processing': 'Retrait en cours',
  'withdrawal.bad_password': '⚠ Retrait : mauvais mot de passe',
  'withdrawal.network_error': '⚠ Retrait : erreur réseau',
  'user.register': 'Inscription',
  'user.login': 'Connexion',
  'user.locked': '⚠ Compte verrouillé (tentatives)',
  'user.password_changed': 'Mot de passe changé',
  'user.logout_all': 'Déconnexion de tous les appareils',
  'campaign.create': 'Cagnotte créée',
  'campaign.update': 'Cagnotte modifiée',
  'campaign.delete': 'Cagnotte supprimée',
  'admin.settings_update': 'Paramètres modifiés',
  'admin.campaign_update': 'Cagnotte modérée',
  'admin.user_update': 'Utilisateur modifié',
  'admin.withdrawal_approve': 'Retrait approuvé',
  'admin.withdrawal_reject': 'Retrait refusé',
  'admin.bad_password': '⚠ Admin : mauvais mot de passe',
}

function Audit() {
  const [q, setQ] = useState('')
  const dq = useDebounced(q)
  const { data, error, loading, reload } = useApi(`/admin/audit${qs({ q: dq, limit: 150 })}`)
  return (
    <>
      <h1 className="admin__title">Journal de sécurité</h1>
      <Filters search={q} onSearch={setQ} placeholder="Filtrer : withdrawal, payment, admin, user…" />
      {loading && !data ? <Loader /> : error ? <ErrorState error={error} onRetry={reload} /> : (
        <ul className="alist alist--compact">
          {data.logs.map((l) => (
            <li key={l.id} className={`arow ${(ACTIONS[l.action] || '').startsWith('⚠') ? 'arow--warn' : ''}`}>
              <div className="arow__main">
                <b>{ACTIONS[l.action] || l.action}</b>
                <span className="muted small block">
                  {l.actor_name || 'Système'} · {new Date(l.created_at).toLocaleString('fr-FR')} {l.ip && `· IP ${l.ip}`}
                </span>
                {l.meta && <span className="muted small block mono">{JSON.stringify(l.meta).slice(0, 220)}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

