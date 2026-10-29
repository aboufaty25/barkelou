import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronDown, Compass, Share2, Smartphone, Wallet, Zap } from 'lucide-react'
import { useDocumentTitle } from '../lib/hooks'
import { Empty, TopBar } from '../components/ui'

const FAQ = [
  ['Combien coûte Barkelou ?', 'La création d’une cagnotte est gratuite. Une petite commission de service est appliquée sur chaque participation ; son montant exact est toujours affiché avant de payer.'],
  ['Comment mes proches peuvent-ils participer ?', 'Ils ouvrent le lien de votre cagnotte, choisissent un montant et paient par Wave, Orange Money, Free Money ou carte bancaire. Aucun compte n’est nécessaire pour participer.'],
  ['Quand puis-je récupérer l’argent ?', 'À tout moment, même si l’objectif n’est pas atteint. Depuis votre cagnotte, touchez « Retirer », choisissez le montant et confirmez avec votre mot de passe : l’argent est envoyé sur votre Wave, Orange Money ou Free Money.'],
  ['Mon argent est-il en sécurité ?', 'Les paiements sont traités par PayDunya, prestataire agréé. Chaque retrait exige votre mot de passe et n’est envoyé qu’au numéro de votre compte. Toutes les opérations sensibles sont enregistrées dans un journal de sécurité.'],
  ['La diaspora peut-elle participer ?', 'Oui : les participants à l’étranger peuvent payer par carte bancaire Visa ou Mastercard, ou via Wave depuis les pays où le service est disponible.'],
  ['Puis-je participer anonymement ?', 'Oui. Cochez « Participer anonymement » : votre nom n’apparaîtra pas publiquement, seul l’organisateur pourra le voir.'],
  ['Puis-je cacher les montants donnés ?', 'Oui. À la création (ou en modifiant votre cagnotte), activez « Masquer les montants » : seuls les noms des participants seront visibles.'],
  ['Que se passe-t-il si l’objectif n’est pas atteint ?', 'Vous récupérez quand même tout ce qui a été collecté. L’objectif sert à motiver vos proches, il n’est pas bloquant.'],
  ['Barkelou est-il une application ?', 'Oui ! Barkelou s’installe sur votre téléphone directement depuis le navigateur (Android et iPhone), sans passer par un store, et fonctionne même avec une connexion faible.'],
]

export function HowItWorks() {
  useDocumentTitle('Comment ça marche')
  const { hash } = useLocation()
  const [open, setOpen] = useState(0)
  useEffect(() => {
    if (hash === '#faq') document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' })
  }, [hash])

  return (
    <div className="page">
      <TopBar title="Comment ça marche" />
      <div className="container narrow prose-page">
        <h1 className="page-title desktop-only">Comment ça marche</h1>
        <p className="lead">Barkelou, c’est la cagnotte en ligne simple, gratuite et pensée pour le mobile money.</p>
        <ol className="timeline">
          <li><span><Zap size={18} /></span><div><h3>Créez votre cagnotte</h3><p>Choisissez une occasion, un titre, un objectif et racontez votre histoire. Ajoutez une photo pour toucher davantage.</p></div></li>
          <li><span><Share2 size={18} /></span><div><h3>Partagez le lien</h3><p>Envoyez-le sur WhatsApp, Facebook, Instagram ou par SMS. Vos proches participent en quelques secondes, sans créer de compte.</p></div></li>
          <li><span><Smartphone size={18} /></span><div><h3>Suivez en temps réel</h3><p>Chaque participation s’affiche avec le nom et le petit mot de vos proches. Remerciez-les en un geste.</p></div></li>
          <li><span><Wallet size={18} /></span><div><h3>Retirez l’argent</h3><p>Transférez les fonds vers votre compte Wave ou Orange Money quand vous le souhaitez.</p></div></li>
        </ol>
        <Link to="/creer" className="btn btn--primary btn--lg btn--block">Créer ma cagnotte</Link>

        <h2 id="faq" className="faq-title">Questions fréquentes</h2>
        <div className="faq">
          {FAQ.map(([q, a], i) => (
            <div key={q} className={`faq__item ${open === i ? 'is-open' : ''}`}>
              <button aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>
                <span>{q}</span>
                <ChevronDown size={18} />
              </button>
              <div className="faq__a"><p>{a}</p></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function Terms() {
  useDocumentTitle('Conditions d’utilisation')
  return (
    <div className="page">
      <TopBar title="Conditions d’utilisation" />
      <div className="container narrow prose-page">
        <h1 className="page-title">Conditions générales d’utilisation</h1>
        <p className="muted">Dernière mise à jour : {new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</p>
        <h3>1. Objet</h3>
        <p>Barkelou (barkelou.com) est une plateforme permettant à toute personne de créer une cagnotte en ligne et de recevoir des participations de la part de tiers.</p>
        <h3>2. Création d’une cagnotte</h3>
        <p>L’organisateur garantit l’exactitude des informations publiées et l’utilisation des fonds conformément à l’objet annoncé. Toute cagnotte frauduleuse, trompeuse ou contraire à la loi sénégalaise sera suspendue et les fonds pourront être restitués aux participants.</p>
        <h3>3. Participations</h3>
        <p>Les participations sont des dons volontaires et définitifs versés à l’organisateur. Les paiements sont traités par des prestataires agréés (opérateurs de mobile money et réseaux de cartes bancaires).</p>
        <h3>4. Retraits</h3>
        <p>L’organisateur peut demander le retrait des fonds disponibles vers un compte mobile money à son nom. Barkelou peut demander une pièce d’identité avant tout retrait afin de lutter contre la fraude et le blanchiment.</p>
        <h3>5. Responsabilité</h3>
        <p>Barkelou agit comme intermédiaire technique et ne saurait être tenu responsable de l’usage fait des fonds par l’organisateur.</p>
        <h3>6. Contact</h3>
        <p>Pour toute question : <a className="link" href="mailto:contact@barkelou.com">contact@barkelou.com</a>.</p>
      </div>
    </div>
  )
}

export function Privacy() {
  useDocumentTitle('Confidentialité')
  return (
    <div className="page">
      <TopBar title="Confidentialité" />
      <div className="container narrow prose-page">
        <h1 className="page-title">Politique de confidentialité</h1>
        <p>Nous collectons uniquement les données nécessaires au fonctionnement du service : nom, numéro de téléphone, e-mail facultatif, et l’historique des cagnottes et participations.</p>
        <p>Vos données ne sont jamais vendues. Elles sont utilisées pour gérer votre compte, traiter les paiements et lutter contre la fraude, conformément à la loi sénégalaise n° 2008-12 sur la protection des données à caractère personnel (CDP).</p>
        <p>Vous pouvez demander l’accès, la rectification ou la suppression de vos données à tout moment en écrivant à <a className="link" href="mailto:contact@barkelou.com">contact@barkelou.com</a>.</p>
      </div>
    </div>
  )
}

export function NotFound() {
  useDocumentTitle('Page introuvable')
  return (
    <div className="page">
      <TopBar title="" />
      <div className="container narrow">
        <Empty
          icon={Compass}
          title="Cette page n’existe pas"
          text="La cagnotte a peut-être été supprimée ou le lien est incorrect."
          action={<Link to="/explorer" className="btn btn--primary">Explorer les cagnottes</Link>}
        />
      </div>
    </div>
  )
}
