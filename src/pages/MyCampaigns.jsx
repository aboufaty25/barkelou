import { Link } from 'react-router-dom'
import { HandCoins, Heart, PiggyBank, Plus, TrendingUp, Users } from 'lucide-react'
import { useStore } from '../store/AppStore'
import { fcfa, timeAgo } from '../lib/utils'
import { methodById } from '../services/payments'
import { useDocumentTitle } from '../lib/hooks'
import { CampaignCard, Empty, TopBar } from '../components/ui'

export default function MyCampaigns() {
  useDocumentTitle('Mes cagnottes')
  const { user, campaigns, state } = useStore()

  if (!user) {
    return (
      <div className="page">
        <TopBar title="Mes cagnottes" back={false} />
        <div className="container narrow">
          <Empty
            icon={PiggyBank}
            title="Retrouvez toutes vos cagnottes"
            text="Connectez-vous pour créer, suivre et gérer vos cagnottes et vos participations."
            action={
              <div className="stack">
                <Link to="/connexion?next=/mes-cagnottes" className="btn btn--primary btn--lg btn--block">Se connecter</Link>
                <Link to="/connexion?mode=inscription&next=/mes-cagnottes" className="btn btn--ghost btn--lg btn--block">Créer un compte</Link>
              </div>
            }
          />
        </div>
      </div>
    )
  }

  const mine = campaigns.filter((c) => c.ownerId === user.id)
  const totalRaised = mine.reduce((s, c) => s + c.raised, 0)
  const totalCount = mine.reduce((s, c) => s + c.count, 0)
  const myGifts = state.contributions.filter((k) => k.userId === user.id)
  const favs = campaigns.filter((c) => state.favorites.includes(c.id))
  const recentIn = state.contributions
    .filter((k) => mine.some((c) => c.id === k.campaignId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5)

  return (
    <div className="page">
      <TopBar title="Mes cagnottes" back={false} right={<Link to="/creer" className="icon-btn" aria-label="Créer"><Plus size={22} /></Link>} />
      <div className="container">
        <h1 className="page-title desktop-only">Mes cagnottes</h1>

        <div className="kpis">
          <div className="kpi kpi--main">
            <TrendingUp size={18} />
            <span>Total collecté</span>
            <strong>{fcfa(totalRaised)}</strong>
          </div>
          <div className="kpi">
            <Users size={18} />
            <span>Participants</span>
            <strong>{totalCount}</strong>
          </div>
          <div className="kpi">
            <HandCoins size={18} />
            <span>Mes dons</span>
            <strong>{fcfa(myGifts.reduce((s, k) => s + k.amount, 0))}</strong>
          </div>
        </div>

        <section className="section">
          <div className="section__head"><h2>Cagnottes que j’organise</h2></div>
          {mine.length ? (
            <div className="grid">
              {mine.map((c) => <CampaignCard key={c.id} campaign={c} />)}
            </div>
          ) : (
            <Empty
              icon={PiggyBank}
              title="Aucune cagnotte pour l’instant"
              text="Lancez votre première cagnotte en 2 minutes, c’est gratuit."
              action={<Link to="/creer" className="btn btn--primary"><Plus size={16} /> Créer une cagnotte</Link>}
            />
          )}
        </section>

        {recentIn.length > 0 && (
          <section className="section">
            <div className="section__head"><h2>Dernières participations reçues</h2></div>
            <ul className="activity">
              {recentIn.map((k) => {
                const c = mine.find((x) => x.id === k.campaignId)
                return (
                  <li key={k.id}>
                    <span className="activity__dot" style={{ background: methodById(k.method)?.color }} />
                    <div>
                      <b>{k.anonymous ? 'Anonyme' : k.name}</b> a donné <b>{fcfa(k.amount)}</b>
                      <span className="muted"> · {c?.title} · {timeAgo(k.createdAt)}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {myGifts.length > 0 && (
          <section className="section">
            <div className="section__head"><h2>Mes participations</h2></div>
            <ul className="activity">
              {myGifts.map((k) => {
                const c = campaigns.find((x) => x.id === k.campaignId)
                return (
                  <li key={k.id}>
                    <span className="activity__dot" style={{ background: methodById(k.method)?.color }} />
                    <div>
                      <b>{fcfa(k.amount)}</b> pour{' '}
                      {c ? <Link to={`/c/${c.slug}`} className="link">{c.title}</Link> : 'une cagnotte supprimée'}
                      <span className="muted"> · {timeAgo(k.createdAt)}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {favs.length > 0 && (
          <section className="section">
            <div className="section__head">
              <h2><Heart size={18} /> Favoris</h2>
              <Link to="/explorer?favoris=1" className="link">Tout voir</Link>
            </div>
            <div className="list">
              {favs.slice(0, 4).map((c) => <CampaignCard key={c.id} campaign={c} variant="row" />)}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
