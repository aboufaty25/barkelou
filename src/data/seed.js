const day = 86400000
const now = Date.now()
const iso = (offsetDays) => new Date(now + offsetDays * day).toISOString()
const dateOnly = (offsetDays) => iso(offsetDays).slice(0, 10)

const SEED_CAMPAIGNS = [
  {
    id: 'seed1',
    slug: 'operation-du-coeur-pour-awa',
    title: 'Opération du cœur pour la petite Awa',
    category: 'sante',
    goal: 3_500_000,
    deadline: dateOnly(24),
    city: 'Thiès',
    ownerId: 'seed-user-1',
    ownerName: 'Mamadou Diallo',
    createdAt: iso(-12),
    story:
      "Awa a 6 ans et elle est née avec une malformation cardiaque. Les médecins de l’hôpital Fann recommandent une opération rapide, prise en charge par une équipe spécialisée.\n\nLe coût total (intervention, hospitalisation, médicaments et suivi) s’élève à 3 500 000 FCFA. Sa famille a déjà réuni une partie de la somme, mais nous avons besoin de vous pour compléter.\n\nChaque contribution, même 1 000 F, compte. Partagez cette cagnotte autour de vous. Jërëjëf !",
    status: 'active',
    featured: true,
  },
  {
    id: 'seed2',
    slug: 'mariage-fatou-et-ibrahima',
    title: 'Mariage de Fatou & Ibrahima',
    category: 'mariage',
    goal: 1_000_000,
    deadline: dateOnly(40),
    city: 'Dakar',
    ownerId: 'seed-user-2',
    ownerName: 'Aminata Sow',
    createdAt: iso(-5),
    story:
      "Nos amis Fatou et Ibrahima se marient le mois prochain ! Pour leur offrir un beau cadeau commun (et un petit coup de pouce pour leur nouveau foyer), nous ouvrons cette cagnotte entre amis, collègues et famille.\n\nLaissez-leur un petit mot avec votre participation, on leur remettra tout le jour J.",
    status: 'active',
    featured: true,
  },
  {
    id: 'seed3',
    slug: 'fournitures-scolaires-ecole-de-ndiaganiao',
    title: 'Fournitures scolaires pour l’école de Ndiaganiao',
    category: 'education',
    goal: 2_000_000,
    deadline: dateOnly(18),
    city: 'Mbour',
    ownerId: 'seed-user-3',
    ownerName: 'Association Jappo',
    createdAt: iso(-20),
    story:
      "220 élèves de l’école élémentaire de Ndiaganiao commencent l’année sans cahiers ni manuels. Avec 9 000 F, on équipe un enfant pour toute l’année : kit complet, sac et manuels.\n\nL’association Jappo distribuera les kits avec les enseignants et publiera les photos de la remise ici.",
    status: 'active',
    featured: true,
  },
  {
    id: 'seed4',
    slug: 'bapteme-de-baby-cheikh',
    title: 'Baptême de baby Cheikh',
    category: 'bapteme',
    goal: 500_000,
    deadline: dateOnly(9),
    city: 'Saint-Louis',
    ownerId: 'seed-user-4',
    ownerName: 'Khady Ndiaye',
    createdAt: iso(-3),
    story:
      "Alhamdoulilah, Cheikh est arrivé ! Pour accompagner Ndeye et Moussa dans l’organisation du ngénte, la famille et les amis peuvent participer ici, même à distance.",
    status: 'active',
  },
  {
    id: 'seed5',
    slug: 'atelier-de-couture-pour-les-femmes-de-pikine',
    title: 'Un atelier de couture pour les femmes de Pikine',
    category: 'projet',
    goal: 5_000_000,
    deadline: dateOnly(55),
    city: 'Pikine',
    ownerId: 'seed-user-5',
    ownerName: 'GIE Bok Jom',
    createdAt: iso(-30),
    story:
      "Le GIE Bok Jom réunit 35 femmes qui veulent créer leur propre atelier de couture : 10 machines, un local et un fonds de roulement pour les premiers tissus.\n\nAvec cet atelier, elles pourront produire des tenues de cérémonie et des uniformes scolaires pour le quartier, et générer un revenu stable.",
    status: 'active',
  },
  {
    id: 'seed6',
    slug: 'equipement-asc-diamaguene',
    title: 'Équipement de l’ASC Diamaguène pour les navétanes',
    category: 'sport',
    goal: 800_000,
    deadline: dateOnly(14),
    city: 'Diamaguène',
    ownerId: 'seed-user-6',
    ownerName: 'Ousmane Fall',
    createdAt: iso(-8),
    story:
      "Maillots, ballons, chasubles et frais d’inscription : aidez l’ASC Diamaguène à démarrer la saison des navétanes dans de bonnes conditions. Allez les Verts !",
    status: 'active',
  },
]

const NAMES = [
  'Moussa Ndiaye', 'Aïssatou Ba', 'Cheikh Mbaye', 'Mariama Diop', 'Pape Sarr', 'Ndeye Fall',
  'Abdoulaye Gueye', 'Rokhaya Faye', 'Serigne Thiam', 'Coumba Sy', 'Babacar Kane', 'Astou Cissé',
  'Ibrahima Seck', 'Fatou Kiné Diouf', 'Modou Lo', 'Bineta Camara', 'El Hadji Touré', 'Seynabou Niang',
]
const MESSAGES = [
  'Bon courage à toute la famille 🙏',
  'Qu’Allah facilite !',
  'Avec tout mon soutien.',
  'Félicitations et beaucoup de bonheur ❤️',
  'Ensemble on y arrive !',
  '',
  'Jërëjëf pour l’initiative.',
  '',
  'Force à vous !',
]
const AMOUNTS = [2000, 5000, 5000, 10000, 10000, 15000, 25000, 50000, 100000, 3000, 20000]
const METHODS = ['wave', 'wave', 'wave', 'orange', 'orange', 'free', 'card']

const TARGETS = { seed1: 0.62, seed2: 0.71, seed3: 0.44, seed4: 0.83, seed5: 0.27, seed6: 0.56 }

function buildContributions() {
  const list = []
  let r = 7
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280)
  for (const c of SEED_CAMPAIGNS) {
    const target = c.goal * TARGETS[c.id]
    let sum = 0
    let i = 0
    const ageDays = (now - new Date(c.createdAt).getTime()) / day
    while (sum < target) {
      let amount = AMOUNTS[Math.floor(rnd() * AMOUNTS.length)]
      if (c.goal > 2_000_000 && rnd() > 0.7) amount *= 5
      sum += amount
      list.push({
        id: `${c.id}-k${i}`,
        campaignId: c.id,
        name: NAMES[Math.floor(rnd() * NAMES.length)],
        anonymous: rnd() > 0.85,
        amount,
        message: MESSAGES[Math.floor(rnd() * MESSAGES.length)],
        method: METHODS[Math.floor(rnd() * METHODS.length)],
        createdAt: new Date(now - rnd() * ageDays * day).toISOString(),
      })
      i++
    }
  }
  return list
}

export const seedState = () => ({
  version: 1,
  users: [],
  sessionUserId: null,
  campaigns: SEED_CAMPAIGNS,
  contributions: buildContributions(),
  favorites: [],
})
