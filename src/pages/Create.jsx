import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Camera, Check, ChevronRight, ImagePlus, PartyPopper, Trash2 } from 'lucide-react'
import { useApi, useStore, useToast } from '../store/AppStore'
import { api } from '../lib/api'
import { CATEGORIES } from '../lib/categories'
import { compressImage, fcfa, formatDate } from '../lib/utils'
import { useDocumentTitle, useShare } from '../lib/hooks'
import { CampaignCard, ErrorState, Field, Loader, Spinner, TopBar } from '../components/ui'

const DRAFT_KEY = 'barkelou:draft'
const GOALS = [100000, 250000, 500000, 1000000, 2500000]
const empty = { category: '', title: '', city: '', goal: '', deadline: '', story: '', cover: null, hideAmounts: false }

const minDate = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10)

export default function Create() {
  const { slug } = useParams()
  const { user, ready } = useStore()
  const q = useApi(slug && user ? `/campaigns/${encodeURIComponent(slug)}` : null)
  if (!ready) return <Loader />
  if (!user) return <Navigate to={`/connexion?next=${encodeURIComponent(slug ? `/c/${slug}/modifier` : '/creer')}`} replace />
  if (!slug) return <CreateForm />
  if (q.loading || (!q.data && !q.error)) return <Loader />
  if (q.error) return <div className="page"><TopBar title="Modifier" /><div className="container narrow"><ErrorState error={q.error} /></div></div>
  if (!q.data.campaign.isOwner) return <Navigate to="/mes-cagnottes" replace />
  return <CreateForm existing={{ ...q.data.campaign, raised: q.data.campaign.raised || 0 }} />
}

function CreateForm({ existing = null }) {
  const editing = !!existing
  const { user, settings } = useStore()
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const toast = useToast()
  const share = useShare()
  useDocumentTitle(editing ? 'Modifier la cagnotte' : 'Créer une cagnotte')

  const [step, setStep] = useState(1)
  const [touched, setTouched] = useState(false)
  const [created, setCreated] = useState(null)
  const [data, setData] = useState(() => {
    if (existing) return { ...empty, ...existing, deadline: existing.deadline || '', goal: String(existing.goal) }
    try {
      return { ...empty, ...JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}') }
    } catch {
      return empty
    }
  })
  const fileRef = useRef(null)

  useEffect(() => {
    if (editing || created) return
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(data))
    } catch {
      /* image trop lourde pour le brouillon */
    }
  }, [data, editing, created])


  const set = (k) => (e) => setData((d) => ({ ...d, [k]: e?.target ? e.target.value : e }))
  const goal = Number(data.goal) || 0

  const errors = {
    1: {
      category: !data.category && 'Choisissez une catégorie',
      title: data.title.trim().length < 6 && 'Au moins 6 caractères',
    },
    2: {
      goal: goal < 10000 ? 'Objectif minimum : 10 000 F' : goal > settings.max_campaign_goal ? `Objectif maximum : ${fcfa(settings.max_campaign_goal)}` : '',
      deadline: data.deadline && data.deadline < minDate() && !editing ? 'La date doit être dans le futur' : '',
    },
    3: { story: data.story.trim().length < 30 && `Encore ${30 - data.story.trim().length} caractères minimum` },
  }
  const stepValid = (s) => !Object.values(errors[s] || {}).some(Boolean)
  const err = (s, k) => (touched ? errors[s]?.[k] || '' : '')

  const next = () => {
    setTouched(true)
    if (!stepValid(step)) return
    setTouched(false)
    if (step < 4) setStep(step + 1)
  }

  const publish = async () => {
    const payload = {
      category: data.category,
      title: data.title.trim(),
      city: data.city.trim(),
      goal,
      deadline: data.deadline || null,
      story: data.story.trim(),
      hide_amounts: !!data.hideAmounts,
    }
    // L'image n'est envoyée que si elle a été ajoutée, changée ou retirée
    if (data.cover?.startsWith('data:')) payload.cover = data.cover
    else if (!data.cover && existing?.cover) payload.cover = null
    setBusy(true)
    try {
      if (editing) {
        await api.patch(`/campaigns/${existing.id}`, payload)
        toast('Modifications enregistrées ✓', 'success')
        navigate(`/c/${existing.slug}`, { replace: true })
        return
      }
      const { campaign } = await api.post('/campaigns', payload)
      localStorage.removeItem(DRAFT_KEY)
      setCreated({ ...payload, ...campaign, cover: data.cover, hideAmounts: payload.hide_amounts, ownerName: user.name, raised: 0, percent: 0, count: 0 })
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const onFile = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    try {
      setData((d) => ({ ...d, cover: null }))
      const url = await compressImage(f)
      setData((d) => ({ ...d, cover: url }))
    } catch {
      toast('Image illisible, essayez une autre photo', 'error')
    }
  }

  if (created) {
    return (
      <div className="page success">
        <div className="container narrow center">
          <span className="success__check success__check--gold"><PartyPopper size={36} /></span>
          <h1>{created.status === 'pending' ? 'Cagnotte envoyée !' : 'Votre cagnotte est en ligne !'}</h1>
          <p className="lead">
            {created.status === 'pending'
              ? 'Notre équipe la vérifie avant publication. Vous pourrez la partager dès sa validation.'
              : 'Partagez-la maintenant à vos proches : les premières 24 h sont décisives.'}
          </p>
          <div className="success__preview">
            <CampaignCard campaign={{ ...created, raised: 0, count: 0 }} />
          </div>
          <div className="stack">
            <a
              className="btn btn--whatsapp btn--lg btn--block"
              target="_blank"
              rel="noreferrer"
              href={`https://wa.me/?text=${encodeURIComponent(`Soutenez « ${created.title} » sur Barkelou 🙏\n${window.location.origin}/c/${created.slug}`)}`}
            >
              Partager sur WhatsApp
            </a>
            <button className="btn btn--soft btn--lg btn--block" onClick={() => share({ title: created.title, text: `Soutenez « ${created.title} » sur Barkelou`, path: `/c/${created.slug}` })}>
              Autres options de partage
            </button>
            <Link to={`/c/${created.slug}`} className="btn btn--ghost btn--lg btn--block" replace>Voir ma cagnotte</Link>
          </div>
        </div>
      </div>
    )
  }

  const titles = ['L’essentiel', 'L’objectif', 'Votre histoire', 'Vérification']

  return (
    <div className="page page--flow">
      <TopBar title={editing ? 'Modifier' : 'Nouvelle cagnotte'} />
      <div className="flow-progress"><span style={{ width: `${(step / 4) * 100}%` }} /></div>

      <div className="container narrow flow-body">
        <p className="step-label">Étape {step} sur 4</p>
        <h2 className="flow-title">{titles[step - 1]}</h2>

        {step === 1 && (
          <>
            <Field label="Pour quelle occasion ?" error={err(1, 'category')}>
              <div className="cat-grid">
                {CATEGORIES.map(({ id, label, Icon, from, to }) => (
                  <button key={id} type="button" className={`cat-pick ${data.category === id ? 'is-on' : ''}`} style={{ '--from': from, '--to': to }} onClick={() => set('category')(id)}>
                    <span className="cat__icon"><Icon size={20} /></span>
                    {label}
                    {data.category === id && <Check size={14} className="cat-pick__check" />}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Titre de la cagnotte" htmlFor="title" error={err(1, 'title')} counter={`${data.title.length}/80`} hint="Court et clair, ex : « Mariage d’Awa & Modou »">
              <input id="title" className="input" maxLength={80} placeholder="Donnez un nom à votre cagnotte" value={data.title} onChange={set('title')} />
            </Field>
            <Field label="Ville (facultatif)" htmlFor="city">
              <input id="city" className="input" maxLength={40} placeholder="Dakar, Thiès, Ziguinchor…" value={data.city} onChange={set('city')} />
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <Field label="Montant à atteindre" htmlFor="goal" error={err(2, 'goal')}>
              <div className="input-affix input-affix--big">
                <input
                  id="goal"
                  className="input"
                  inputMode="numeric"
                  placeholder="500 000"
                  value={data.goal ? Number(data.goal).toLocaleString('fr-FR').replace(/ | /g, ' ') : ''}
                  onChange={(e) => set('goal')(e.target.value.replace(/\D/g, '').slice(0, 9))}
                />
                <span>FCFA</span>
              </div>
            </Field>
            <div className="presets presets--wrap">
              {GOALS.map((g) => (
                <button key={g} type="button" className={`preset preset--sm ${goal === g ? 'is-on' : ''}`} onClick={() => set('goal')(String(g))}>
                  {fcfa(g)}
                </button>
              ))}
            </div>
            <Field label="Date limite (facultatif)" htmlFor="deadline" error={err(2, 'deadline')} hint="Sans date, la cagnotte reste ouverte jusqu’à ce que vous la clôturiez.">
              <input id="deadline" type="date" className="input" min={minDate()} value={data.deadline || ''} onChange={set('deadline')} />
            </Field>
            <label className="switch-row">
              <span>
                <span>
                  <b>Masquer les montants</b>
                  <small>Les participants verront les noms, pas les sommes données</small>
                </span>
              </span>
              <input type="checkbox" className="switch" checked={data.hideAmounts} onChange={(e) => set('hideAmounts')(e.target.checked)} />
            </label>
          </>
        )}

        {step === 3 && (
          <>
            <Field label="Photo de couverture (facultatif)">
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
              {data.cover ? (
                <div className="upload upload--filled">
                  <img src={data.cover} alt="Aperçu de la couverture" />
                  <div className="upload__actions">
                    <button type="button" className="btn btn--soft btn--sm" onClick={() => fileRef.current?.click()}><Camera size={15} /> Changer</button>
                    <button type="button" className="btn btn--soft btn--sm" onClick={() => set('cover')(null)}><Trash2 size={15} /> Retirer</button>
                  </div>
                </div>
              ) : (
                <button type="button" className="upload" onClick={() => fileRef.current?.click()}>
                  <ImagePlus size={28} />
                  <b>Ajouter une photo</b>
                  <small>Une belle photo augmente fortement les participations</small>
                </button>
              )}
            </Field>
            <Field label="Racontez votre histoire" htmlFor="story" error={err(3, 'story')} counter={`${data.story.length}/3000`} hint="Qui êtes-vous ? Pourquoi cette cagnotte ? À quoi servira l’argent ?">
              <textarea id="story" className="input" rows={8} maxLength={3000} placeholder="Expliquez simplement votre projet à vos proches…" value={data.story} onChange={set('story')} />
            </Field>
          </>
        )}

        {step === 4 && (
          <>
            <div className="preview-wrap">
              <CampaignCard campaign={{ ...data, id: 'preview', slug: editing ? existing.slug : '', goal, raised: existing?.raised || 0, count: existing?.count || 0, ownerName: user.name, status: 'active' }} />
            </div>
            <dl className="review">
              <div><dt>Objectif</dt><dd>{fcfa(goal)}</dd></div>
              <div><dt>Date limite</dt><dd>{data.deadline ? formatDate(data.deadline) : 'Aucune'}</dd></div>
              <div><dt>Montants</dt><dd>{data.hideAmounts ? 'Masqués' : 'Visibles'}</dd></div>
              <div><dt>Organisateur</dt><dd>{user.name}</dd></div>
            </dl>
            <p className="field__hint">
              En publiant, vous acceptez les <Link to="/cgu" className="link">conditions d’utilisation</Link> de Barkelou.
            </p>
          </>
        )}
      </div>

      <div className="flow-footer">
        <div className="container narrow row gap-8">
          {step > 1 && (
            <button className="btn btn--soft btn--lg" onClick={() => setStep(step - 1)}>Retour</button>
          )}
          {step < 4 ? (
            <button className="btn btn--primary btn--lg btn--grow" onClick={next}>
              Continuer <ChevronRight size={18} />
            </button>
          ) : (
            <button className="btn btn--primary btn--lg btn--grow" onClick={publish} disabled={busy}>
              {busy ? <Spinner /> : editing ? 'Enregistrer' : 'Publier ma cagnotte'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
