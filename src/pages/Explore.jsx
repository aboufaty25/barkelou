import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Heart, Search, SearchX, X } from 'lucide-react'
import { useStore } from '../store/AppStore'
import { CATEGORIES, catById } from '../lib/categories'
import { daysLeft, pct } from '../lib/utils'
import { useDocumentTitle } from '../lib/hooks'
import { CampaignCard, Empty } from '../components/ui'

const SORTS = [
  { id: 'populaire', label: 'Populaires' },
  { id: 'recent', label: 'Récentes' },
  { id: 'urgent', label: 'Bientôt finies' },
  { id: 'proche', label: 'Presque atteintes' },
]

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export default function Explore() {
  useDocumentTitle('Explorer')
  const { campaigns, state } = useStore()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const cat = params.get('cat') || ''
  const sort = params.get('tri') || 'populaire'
  const favs = params.get('favoris') === '1'

  const set = (k, v) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
  }

  const list = useMemo(() => {
    let l = campaigns.filter((c) => c.status === 'active' || favs)
    if (favs) l = l.filter((c) => state.favorites.includes(c.id))
    if (cat) l = l.filter((c) => c.category === cat)
    if (q) {
      const n = norm(q)
      l = l.filter((c) => norm(`${c.title} ${c.ownerName} ${c.city || ''} ${catById(c.category).label}`).includes(n))
    }
    const sorters = {
      populaire: (a, b) => b.count - a.count,
      recent: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      urgent: (a, b) => (daysLeft(a.deadline) ?? 9999) - (daysLeft(b.deadline) ?? 9999),
      proche: (a, b) => pct(b.raised, b.goal) - pct(a.raised, a.goal),
    }
    return [...l].sort(sorters[sort] || sorters.populaire)
  }, [campaigns, state.favorites, q, cat, sort, favs])

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
              placeholder="Rechercher une cagnotte, une ville…"
              value={q}
              onChange={(e) => set('q', e.target.value)}
              aria-label="Rechercher"
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
        <div className="sortbar">
          <span className="muted">{list.length} cagnotte{list.length > 1 ? 's' : ''}</span>
          <div className="segmented" role="tablist">
            {SORTS.map((s) => (
              <button key={s.id} role="tab" aria-selected={sort === s.id} className={sort === s.id ? 'is-on' : ''} onClick={() => set('tri', s.id === 'populaire' ? '' : s.id)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {list.length ? (
          <div className="grid">
            {list.map((c) => (
              <CampaignCard key={c.id} campaign={c} />
            ))}
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
