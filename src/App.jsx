import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppStoreProvider, ToastProvider } from './store/AppStore'
import AppShell from './components/AppShell'
import { Spinner } from './components/ui'
import Home from './pages/Home'
import Explore from './pages/Explore'
import Campaign from './pages/Campaign'

const Contribute = lazy(() => import('./pages/Contribute'))
const Create = lazy(() => import('./pages/Create'))
const MyCampaigns = lazy(() => import('./pages/MyCampaigns'))
const Profile = lazy(() => import('./pages/Profile'))
const Auth = lazy(() => import('./pages/Auth'))
const HowItWorks = lazy(() => import('./pages/Info').then((m) => ({ default: m.HowItWorks })))
const Terms = lazy(() => import('./pages/Info').then((m) => ({ default: m.Terms })))
const Privacy = lazy(() => import('./pages/Info').then((m) => ({ default: m.Privacy })))
const NotFound = lazy(() => import('./pages/NotFound'))
const PaymentReturn = lazy(() => import('./pages/PaymentReturn'))
const PaymentSimulator = lazy(() => import('./pages/PaymentReturn').then((m) => ({ default: m.PaymentSimulator })))
const Admin = lazy(() => import('./pages/Admin'))

const Loading = () => (
  <div className="page-loading">
    <Spinner size={28} />
  </div>
)

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AppStoreProvider>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<Home />} />
                <Route path="explorer" element={<Explore />} />
                <Route path="c/:slug" element={<Campaign />} />
                <Route path="c/:slug/participer" element={<Contribute />} />
                <Route path="c/:slug/modifier" element={<Create />} />
                <Route path="creer" element={<Create />} />
                <Route path="mes-cagnottes" element={<MyCampaigns />} />
                <Route path="profil" element={<Profile />} />
                <Route path="connexion" element={<Auth />} />
                <Route path="comment-ca-marche" element={<HowItWorks />} />
                <Route path="cgu" element={<Terms />} />
                <Route path="confidentialite" element={<Privacy />} />
                <Route path="paiement/retour" element={<PaymentReturn />} />
                <Route path="paiement/simulateur" element={<PaymentSimulator />} />
                <Route path="admin" element={<Admin />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </Suspense>
        </AppStoreProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
