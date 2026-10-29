import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Heart, Search, SearchX, X } from 'lucide-react'
import { useApi, useStore } from '../store/AppStore'
import { CATEGORIES } from '../lib/categories'
import { qs } from '../lib/api'
import { useDocumentTitle } from '../lib/hooks'
import { CampaignCard, Empty, ErrorState, SkeletonCards } from '../components/ui'

const SORTS = [
  { id: 'populaire', label: 'Populaires' },
  { id: 'recent', label: 'Récentes' },
  { id: 'urgent', label: 'Bientôt finies' },
  { id: 'proche', label: 'Presque atteintes' },
]

export default function Explore() {
  useDocumentTitle('Explorer')
  const { user } = useStore()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const cat = params.get('cat') || ''
  const sort = params.get('tri') || 'populaire'
  const favs = params.get('favoris') === '1'
  const [debounced, setDebounced] = useState(q)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  const set = (k, v) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
  }

  const path = favs ? (user ? '/favorites' : null) : `/campaigns${qs({ q: debounced, cat, sort, limit: 48 })}`
  const { data, error, loading, reload } = useApi(path)
  let list = data?.campaigns || []
  if (favs && cat) list = list.filter((c) => c.category === cat)

  return (
    <div className="page">
      <div className="explore-head">
        <div className="container">
          <h1 className="page-title">Explorer</h1>
          <label className="search">
            <Search size={18} />
            <input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              placeholder="Rechercher une cagnotte, une ville…"
              value={q}
              onChange={(e) => set('q', e.target.value)}
              aria-label="Rechercher"
              disabled={favs}
            />
            {q && (
              <button type="button" aria-label="Effacer" onClick={() => set('q', '')}>
                <X size={16} />
              </button>
            )}
          </label>
        </div>
        <div className="chips-row container">
          <button className={`fchip ${favs ? 'is-on' : ''}`} onClick={() => set('favoris', favs ? '' : '1')}>
            <Heart size={14} fill={favs ? 'currentColor' : 'none'} /> Favoris
          </button>
          <button className={`fchip ${!cat ? 'is-on' : ''}`} onClick={() => set('cat', '')}>Toutes</button>
          {CATEGORIES.map(({ id, label, Icon }) => (
            <button key={id} className={`fchip ${cat === id ? 'is-on' : ''}`} onClick={() => set('cat', cat === id ? '' : id)}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="container">
        {!favs && (
          <div className="sortbar">
            <span className="muted">{loading ? 'Recherche…' : `${list.length} cagnotte${list.length > 1 ? 's' : ''}`}</span>
            <div className="segmented" role="tablist">
              {SORTS.map((s) => (
                <button key={s.id} role="tab" aria-selected={sort === s.id} className={sort === s.id ? 'is-on' : ''} onClick={() => set('tri', s.id === 'populaire' ? '' : s.id)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {favs && !user ? (
          <Empty
            icon={Heart}
            title="Retrouvez vos favoris"
            text="Connectez-vous pour enregistrer les cagnottes qui vous tiennent à cœur."
            action={<Link to="/connexion?next=/explorer?favoris=1" className="btn btn--primary">Se connecter</Link>}
          />
        ) : error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : loading && !data ? (
          <div className="grid"><SkeletonCards n={6} /></div>
        ) : list.length ? (
          <div className="grid">
            {list.map((c) => <CampaignCard key={c.id} campaign={c} />)}
          </div>
        ) : (
          <Empty
            icon={favs ? Heart : SearchX}
            title={favs ? 'Aucun favori pour le moment' : 'Aucune cagnotte trouvée'}
            text={favs ? 'Touchez le cœur sur une cagnotte pour la retrouver ici.' : 'Essayez un autre mot-clé ou une autre catégorie.'}
            action={<Link to="/creer" className="btn btn--primary">Créer une cagnotte</Link>}
          />
        )}
      </div>
    </div>
  )
}
