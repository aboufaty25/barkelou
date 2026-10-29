import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownToLine, HandCoins, PiggyBank, Plus, TrendingUp, Wallet } from 'lucide-react'
import { useApi, useStore } from '../store/AppStore'
import { fcfa, timeAgo } from '../lib/utils'
import { methodById } from '../services/payments'
import { useDocumentTitle } from '../lib/hooks'
import { CampaignCard, Empty, ErrorState, Loader, TopBar } from '../components/ui'
import WithdrawSheet from '../components/WithdrawSheet'

const WSTATUS = {
  success: ['Envoyé', 'badge--ok'],
  processing: ['En cours', 'badge--pending'],
  pending_review: ['En validation', 'badge--pending'],
  failed: ['Échoué', 'badge--fail'],
  rejected: ['Refusé', 'badge--fail'],
}

export default function MyCampaigns() {
  useDocumentTitle('Mes cagnottes')
  const { user, ready } = useStore()
  const mine = useApi(user ? '/campaigns/mine' : null)
  const activity = useApi(user ? '/me/activity' : null)
  const [withdrawFor, setWithdrawFor] = useState(null)

  if (!ready) return <Loader />
  if (!user) {
    return (
      <div className="page">
        <TopBar title="Mes cagnottes" back={false} />
        <div className="container narrow">
          <Empty
            icon={PiggyBank}
            title="Retrouvez toutes vos cagnottes"
            text="Connectez-vous pour créer, suivre et gérer vos cagnottes et retirer votre argent."
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

  if (mine.loading && !mine.data) return <Loader />
  if (mine.error) return <div className="page"><TopBar title="Mes cagnottes" back={false} /><div className="container"><ErrorState error={mine.error} onRetry={mine.reload} /></div></div>

  const campaigns = mine.data.campaigns
  const available = campaigns.reduce((s, c) => s + c.balance.available, 0)
  const totalRaised = campaigns.reduce((s, c) => s + (c.raised || 0), 0)
  const act = activity.data || { received: [], given: [], withdrawals: [] }
  const withdrawable = campaigns.filter((c) => c.balance.available > 0 && c.status !== 'suspended')

  return (
    <div className="page">
      <TopBar title="Mes cagnottes" back={false} right={<Link to="/creer" className="icon-btn" aria-label="Créer"><Plus size={22} /></Link>} />
      <div className="container">
        <h1 className="page-title desktop-only">Mes cagnottes</h1>

        <div className="kpis">
          <div className="kpi kpi--main">
            <Wallet size={18} />
            <span>Disponible au retrait</span>
            <strong>{fcfa(available)}</strong>
            {withdrawable.length > 0 && (
              <button className="btn btn--gold btn--sm kpi__cta" onClick={() => setWithdrawFor(withdrawable[0])}>
                <ArrowDownToLine size={15} /> Retirer
              </button>
            )}
          </div>
          <div className="kpi">
            <TrendingUp size={18} />
            <span>Total collecté</span>
            <strong>{fcfa(totalRaised)}</strong>
          </div>
          <div className="kpi">
            <HandCoins size={18} />
            <span>Mes dons</span>
            <strong>{fcfa(act.given.reduce((s, k) => s + k.amount, 0))}</strong>
          </div>
        </div>

        <section className="section">
          <div className="section__head"><h2>Cagnottes que j’organise</h2></div>
          {campaigns.length ? (
            <div className="grid">
              {campaigns.map((c) => (
                <div key={c.id} className="mine-item">
                  <CampaignCard campaign={c} />
                  <div className="mine-item__bar">
                    <span>
                      Solde : <b>{fcfa(c.balance.available)}</b>
                      {c.status === 'pending' && <span className="badge badge--pending">En validation</span>}
                      {c.status === 'suspended' && <span className="badge badge--fail">Suspendue</span>}
                    </span>
                    <button className="btn btn--soft btn--sm" disabled={!c.balance.available || c.status === 'suspended'} onClick={() => setWithdrawFor(c)}>
                      Retirer
                    </button>
                  </div>
                </div>
              ))}
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

        {act.withdrawals.length > 0 && (
          <section className="section">
            <div className="section__head"><h2>Mes retraits</h2></div>
            <ul className="activity">
              {act.withdrawals.map((w) => (
                <li key={w.id}>
                  <span className="activity__dot" style={{ background: methodById(w.method)?.color }} />
                  <div className="grow">
                    <b>{fcfa(w.payout)}</b> vers {methodById(w.method)?.label} · {w.phone}
                    <span className="muted"> · {w.title} · {timeAgo(w.created_at)}</span>
                    {w.failure_reason && <small className="muted block">{w.failure_reason}</small>}
                  </div>
                  <span className={`badge ${WSTATUS[w.status]?.[1]}`}>{WSTATUS[w.status]?.[0]}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {act.received.length > 0 && (
          <section className="section">
            <div className="section__head"><h2>Dernières participations reçues</h2></div>
            <ul className="activity">
              {act.received.map((k) => (
                <li key={k.id}>
                  <span className="activity__dot" style={{ background: methodById(k.channel)?.color }} />
                  <div>
                    <b>{k.donor_name}</b>{k.anonymous && <span className="muted"> (anonyme)</span>} a donné <b>{fcfa(k.amount)}</b>
                    <span className="muted"> · {k.title} · {timeAgo(k.paid_at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {act.given.length > 0 && (
          <section className="section">
            <div className="section__head"><h2>Mes participations</h2></div>
            <ul className="activity">
              {act.given.map((k) => (
                <li key={k.id}>
                  <span className="activity__dot" style={{ background: methodById(k.channel)?.color }} />
                  <div>
                    <b>{fcfa(k.amount)}</b> pour <Link to={`/c/${k.slug}`} className="link">{k.title}</Link>
                    <span className="muted"> · {timeAgo(k.paid_at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {withdrawFor && (
        <WithdrawSheet
          open
          campaign={withdrawFor}
          onClose={() => setWithdrawFor(null)}
          onDone={() => {
            mine.reload()
            activity.reload()
          }}
        />
      )}
    </div>
  )
}
