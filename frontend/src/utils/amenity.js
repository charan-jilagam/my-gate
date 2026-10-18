import { FiActivity, FiBook, FiDroplet, FiGrid, FiHome, FiKey, FiMusic, FiSmile, FiSun, FiTarget, FiWind } from 'react-icons/fi'

// A picture for an amenity, guessed from its name, so a list of spaces is easy to scan.
const RULES = [
  [/pool|swim/i, FiDroplet],
  [/gym|fitness|workout/i, FiActivity],
  [/tennis|badminton|court|cricket|football|sport|squash|turf/i, FiTarget],
  [/garden|terrace|roof|lawn|park|barbecue|bbq/i, FiSun],
  [/guest|room|stay/i, FiKey],
  [/party|banquet|hall|auditorium/i, FiMusic],
  [/club|lounge|community/i, FiHome],
  [/library|study|cowork|co-work|reading/i, FiBook],
  [/yoga|meditation|spa|sauna/i, FiWind],
  [/kids|play|child/i, FiSmile]
]

export const amenityIcon = (name = '') => (RULES.find(([re]) => re.test(name)) || [null, FiGrid])[1]

// One-tap starting points when the office adds an amenity. Each society edits the details to suit itself.
export const AMENITY_PRESETS = [
  { name: 'Clubhouse', capacity: 40, hourlyRate: 500 },
  { name: 'Party hall', capacity: 80, hourlyRate: 1000 },
  { name: 'Swimming pool', capacity: 25, hourlyRate: 0 },
  { name: 'Gym', capacity: 15, hourlyRate: 0 },
  { name: 'Badminton court', capacity: 4, hourlyRate: 100 },
  { name: 'Tennis court', capacity: 4, hourlyRate: 150 },
  { name: 'Terrace garden', capacity: 30, hourlyRate: 300 },
  { name: 'Guest room', capacity: 4, hourlyRate: 800 },
  { name: 'Yoga room', capacity: 20, hourlyRate: 0 },
  { name: 'Kids play area', capacity: 20, hourlyRate: 0 },
  { name: 'Co-working room', capacity: 10, hourlyRate: 0 },
  { name: 'Barbecue area', capacity: 15, hourlyRate: 200 }
]
