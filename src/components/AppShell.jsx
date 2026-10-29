import { useEffect } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Compass, Construction, Home, PiggyBank, Plus, User, WifiOff } from 'lucide-react'
import { useStore } from '../store/AppStore'
import { useOnline } from '../lib/hooks'
import { haptic } from '../lib/utils'
import { Avatar, Logo } from './ui'

const FLOW = /\/(participer|creer|modifier|connexion|paiement)(\/|$)/

export default function AppShell() {
  const { pathname } = useLocation()
  const { user, settings } = useStore()
  const online = useOnline()
  const inFlow = FLOW.test(pathname)
  const inDetail = /^\/c\/[^/]+\/?$/.test(pathname)

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])

  return (
    <div className={`shell ${inFlow ? 'shell--flow' : ''} ${inDetail ? 'shell--detail' : ''}`}>
      <header className="dheader">
        <div className="container dheader__inner">
          <Link to="/" aria-label="Barkelou, accueil">
            <Logo />
          </Link>
          <nav className="dheader__nav">
            <NavLink to="/" end>Accueil</NavLink>
            <NavLink to="/explorer">Explorer</NavLink>
            <NavLink to="/comment-ca-marche">Comment ça marche</NavLink>
            {user && <NavLink to="/mes-cagnottes">Mes cagnottes</NavLink>}
            {user?.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
          </nav>
          <div className="dheader__actions">
            {user ? (
              <Link to="/profil" className="dheader__user" aria-label="Mon profil">
                <Avatar name={user.name} size={36} />
              </Link>
            ) : (
              <Link to="/connexion" className="btn btn--ghost">Se connecter</Link>
            )}
            <Link to="/creer" className="btn btn--primary">
              <Plus size={18} /> Créer une cagnotte
            </Link>
          </div>
        </div>
      </header>

      {settings.maintenance_mode && (
        <div className="offline">
          <Construction size={15} /> {settings.maintenance_message}
        </div>
      )}

      {!online && (
        <div className="offline">
          <WifiOff size={15} /> Vous êtes hors ligne — les données affichées peuvent ne pas être à jour.
        </div>
      )}

      <main className="main" key={pathname}>
        <Outlet />
      </main>

      {!inFlow && <Footer />}

      {!inFlow && !inDetail && (
        <nav className="tabbar" aria-label="Navigation principale">
          <Tab to="/" icon={Home} label="Accueil" end />
          <Tab to="/explorer" icon={Compass} label="Explorer" />
          <Link to="/creer" className="tabbar__fab" aria-label="Créer une cagnotte" onClick={() => haptic(12)}>
            <Plus size={26} strokeWidth={2.5} />
          </Link>
          <Tab to="/mes-cagnottes" icon={PiggyBank} label="Cagnottes" />
          <Tab to="/profil" icon={User} label="Profil" />
        </nav>
      )}
    </div>
  )
}

function Tab({ to, icon: Icon, label, end }) {
  return (
    <NavLink to={to} end={end} className="tabbar__item" onClick={() => haptic()}>
      <Icon size={22} strokeWidth={2} />
      <span>{label}</span>
    </NavLink>
  )
}

function Footer() {
  const { settings } = useStore()
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__brand">
          <Logo light />
          <p>La cagnotte en ligne pensée pour le Sénégal. Collectez par Wave, Orange Money, Free Money ou carte bancaire.</p>
        </div>
        <div className="footer__cols">
          <div>
            <h4>Barkelou</h4>
            <Link to="/comment-ca-marche">Comment ça marche</Link>
            <Link to="/explorer">Cagnottes</Link>
            <Link to="/creer">Créer une cagnotte</Link>
          </div>
          <div>
            <h4>Aide</h4>
            <Link to="/comment-ca-marche#faq">Questions fréquentes</Link>
            <a href={`mailto:${settings.contact_email}`}>{settings.contact_email}</a>
            <a href={`https://wa.me/${settings.contact_whatsapp}`} target="_blank" rel="noreferrer">WhatsApp</a>
          </div>
          <div>
            <h4>Légal</h4>
            <Link to="/cgu">Conditions d’utilisation</Link>
            <Link to="/confidentialite">Confidentialité</Link>
          </div>
        </div>
      </div>
      <div className="container footer__bottom">© {new Date().getFullYear()} Barkelou · barkelou.com · Fait avec ❤️ à Dakar</div>
    </footer>
  )
}
