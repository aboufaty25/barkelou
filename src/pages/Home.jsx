import { Link } from 'react-router-dom'
import { ArrowRight, Download, Share2, ShieldCheck, Smartphone, Sparkles, Zap } from 'lucide-react'
import { useApi, useStore, useToast } from '../store/AppStore'
import { CATEGORIES } from '../lib/categories'
import { fcfa, compact, pct } from '../lib/utils'
import { useDocumentTitle, useInstallPrompt } from '../lib/hooks'
import { Avatar, CampaignCard, Cover, Logo, Progress, SkeletonCards } from '../components/ui'

export default function Home() {
  useDocumentTitle()
  const { user } = useStore()
  const featuredQ = useApi('/campaigns?sort=une&limit=6')
  const recentQ = useApi('/campaigns?sort=recent&limit=4')
  const statsQ = useApi('/stats')
  const featured = featuredQ.data?.campaigns || []
  const recent = recentQ.data?.campaigns || []
  const stats = statsQ.data || { raised: 0, contributions: 0, campaigns: 0 }
  const hero = featured.find((c) => c.raised !== null)

  return (
    <div className="page page--home">
      {/* En-tête mobile façon application */}
      <div className="m-head">
        <Logo size={30} />
        {user ? (
          <Link to="/profil" aria-label="Mon profil">
            <Avatar name={user.name} size={36} />
          </Link>
        ) : (
          <Link to="/connexion" className="btn btn--soft btn--sm">Connexion</Link>
        )}
      </div>

      <section className="hero">
        <div className="container hero__inner">
          <div className="hero__copy">
            <span className="eyebrow"><Sparkles size={14} /> Création gratuite · Retrait à tout moment</span>
            <h1>
              {user ? <>Salam {user.name.split(' ')[0]},<br /></> : null}
              Ensemble, on va <span className="hl">plus loin.</span>
            </h1>
            <p className="hero__lead">
              Mariage, baptême, santé, projet ou solidarité : créez votre cagnotte en 2 minutes, partagez-la sur
              WhatsApp et recevez les participations par Wave, Orange Money ou carte.
            </p>
            <div className="hero__ctas">
              <Link to="/creer" className="btn btn--primary btn--lg">
                Créer ma cagnotte <ArrowRight size={18} />
              </Link>
              <Link to="/explorer" className="btn btn--ghost btn--lg">Découvrir les cagnottes</Link>
            </div>
            <div className="hero__pay">
              <span>Paiement par</span>
              <b style={{ '--c': '#1DC3F0' }}>Wave</b>
              <b style={{ '--c': '#FF7900' }}>Orange Money</b>
              <b style={{ '--c': '#E30613' }}>Free Money</b>
              <b style={{ '--c': '#64748B' }}>Carte</b>
            </div>
          </div>
          {hero && (
            <div className="hero__visual" aria-hidden="true">
              <div className="phone">
                <div className="phone__screen">
                  <Cover campaign={hero} className="phone__cover" />
                  <div className="phone__body">
                    <b>{hero.title}</b>
                    <Progress value={hero.percent ?? pct(hero.raised, hero.goal)} thick />
                    <div className="phone__nums">
                      <span><strong>{fcfa(hero.raised)}</strong> collectés</span>
                      <span>{hero.percent ?? pct(hero.raised, hero.goal)} %</span>
                    </div>
                    <span className="btn btn--primary btn--block">Participer</span>
                  </div>
                </div>
              </div>
              <div className="float float--a"><span className="float__dot" style={{ background: '#1DC3F0' }} />+ 10 000 F via Wave</div>
              <div className="float float--b">❤️ « Bon courage à la famille »</div>
            </div>
          )}
        </div>
      </section>

      <section className="container stats">
        <div><strong>{compact(stats.raised)} F</strong><span>collectés</span></div>
        <div><strong>{stats.contributions}</strong><span>participations</span></div>
        <div><strong>{stats.campaigns}</strong><span>cagnottes</span></div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section__head">
            <h2>Catégories</h2>
            <Link to="/explorer" className="link">Tout voir</Link>
          </div>
        </div>
        <div className="scroller container">
          {CATEGORIES.map(({ id, label, Icon, from, to }) => (
            <Link key={id} to={`/explorer?cat=${id}`} className="cat" style={{ '--from': from, '--to': to }}>
              <span className="cat__icon"><Icon size={22} /></span>
              <span>{label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section__head">
            <h2>À la une</h2>
            <Link to="/explorer" className="link">Voir tout <ArrowRight size={14} /></Link>
          </div>
        </div>
        <div className="carousel container">
          {featuredQ.loading ? <SkeletonCards n={3} /> : featured.map((c) => <CampaignCard key={c.id} campaign={c} />)}
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section__head"><h2>Comment ça marche</h2></div>
          <ol className="steps">
            <li>
              <span className="steps__n">1</span>
              <Zap size={22} />
              <h3>Créez en 2 minutes</h3>
              <p>Un titre, un objectif, une histoire et une photo. C’est gratuit, sans engagement.</p>
            </li>
            <li>
              <span className="steps__n">2</span>
              <Share2 size={22} />
              <h3>Partagez partout</h3>
              <p>WhatsApp, Facebook, SMS : un lien unique que vos proches ouvrent en un geste.</p>
            </li>
            <li>
              <span className="steps__n">3</span>
              <Smartphone size={22} />
              <h3>Recevez l’argent</h3>
              <p>Les participations arrivent par Wave, Orange Money, Free Money ou carte. Retirez votre argent à tout moment.</p>
            </li>
          </ol>
        </div>
      </section>

      {recent.length > 0 && <section className="section">
        <div className="container">
          <div className="section__head">
            <h2>Nouvelles cagnottes</h2>
            <Link to="/explorer?tri=recent" className="link">Tout voir</Link>
          </div>
          <div className="list">
            {recent.map((c) => (
              <CampaignCard key={c.id} campaign={c} variant="row" />
            ))}
          </div>
        </div>
      </section>}

      <InstallCard />

      <section className="section">
        <div className="container">
          <div className="trust">
            <ShieldCheck size={28} />
            <div>
              <h3>Votre argent est protégé</h3>
              <p>
                Paiements traités par PayDunya, agréé au Sénégal. Les retraits sont protégés par mot de passe et
                envoyés uniquement au numéro du titulaire de la cagnotte.
              </p>
            </div>
          </div>
          <div className="cta-final">
            <h2>Prêt à lancer votre cagnotte ?</h2>
            <p>Rejoignez des milliers de familles et d’associations qui collectent avec Barkelou.</p>
            <Link to="/creer" className="btn btn--gold btn--lg">Je me lance <ArrowRight size={18} /></Link>
          </div>
        </div>
      </section>
    </div>
  )
}

function InstallCard() {
  const { canInstall, installed, ios, install } = useInstallPrompt()
  const toast = useToast()
  if (installed || (!canInstall && !ios)) return null
  return (
    <section className="section">
      <div className="container">
        <div className="install">
          <img src="/pwa-192x192.png" alt="" width="56" height="56" />
          <div>
            <h3>Installez l’application Barkelou</h3>
            <p>
              {ios
                ? 'Sur iPhone : touchez Partager puis « Sur l’écran d’accueil ».'
                : 'Accès en un geste depuis votre écran d’accueil, même hors connexion.'}
            </p>
          </div>
          {!ios && (
            <button
              className="btn btn--primary"
              onClick={async () => {
                if (await install()) toast('Barkelou est installée 🎉', 'success')
              }}
            >
              <Download size={16} /> Installer
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
