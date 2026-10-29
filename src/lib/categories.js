import {
  Gem,
  Baby,
  HeartPulse,
  GraduationCap,
  HandHeart,
  Rocket,
  Moon,
  Flower2,
  Trophy,
  Cake,
} from 'lucide-react'

export const CATEGORIES = [
  { id: 'mariage', label: 'Mariage', Icon: Gem, from: '#F59E8B', to: '#C2410C' },
  { id: 'bapteme', label: 'Baptême', Icon: Baby, from: '#93C5FD', to: '#1D4ED8' },
  { id: 'sante', label: 'Santé', Icon: HeartPulse, from: '#FDA4AF', to: '#BE123C' },
  { id: 'education', label: 'Éducation', Icon: GraduationCap, from: '#C4B5FD', to: '#6D28D9' },
  { id: 'solidarite', label: 'Solidarité', Icon: HandHeart, from: '#6EE7B7', to: '#0B5D43' },
  { id: 'projet', label: 'Projet', Icon: Rocket, from: '#FCD34D', to: '#B45309' },
  { id: 'religion', label: 'Religion', Icon: Moon, from: '#5EEAD4', to: '#0F766E' },
  { id: 'deces', label: 'Deuil', Icon: Flower2, from: '#CBD5E1', to: '#475569' },
  { id: 'sport', label: 'Sport', Icon: Trophy, from: '#FDBA74', to: '#EA580C' },
  { id: 'anniversaire', label: 'Anniversaire', Icon: Cake, from: '#F9A8D4', to: '#DB2777' },
]

export const catById = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[4]
