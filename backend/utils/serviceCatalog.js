// The kinds of home service residents can book. Kept in code rather than the database: it is a short,
// stable list that the API, validation and UI all share.
const CATEGORIES = [
  { key: 'electrician', label: 'Electrician', hint: 'Wiring, switches, fans, lights, MCB' },
  { key: 'plumber', label: 'Plumber', hint: 'Leaks, taps, drains, bathroom fittings' },
  { key: 'carpenter', label: 'Carpenter', hint: 'Furniture repair, doors, wardrobes, fittings' },
  { key: 'painter', label: 'Painter', hint: 'Touch-ups, full rooms, waterproofing' },
  { key: 'ac_repair', label: 'AC service', hint: 'Servicing, gas refill, installation' },
  { key: 'appliance_repair', label: 'Appliance repair', hint: 'Washing machine, fridge, microwave, geyser' },
  { key: 'cleaning', label: 'Home cleaning', hint: 'Deep cleaning, sofa, kitchen, bathroom' },
  { key: 'pest_control', label: 'Pest control', hint: 'Cockroach, termite, mosquito, rodent' },
  { key: 'gardener', label: 'Gardener', hint: 'Balcony plants, lawn care, pruning' },
  { key: 'locksmith', label: 'Locksmith', hint: 'Lock repair, duplicate keys, door locks' },
  { key: 'other', label: 'Other', hint: 'Anything else around the house' }
];

const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);
const labelOf = (key) => CATEGORIES.find((c) => c.key === key)?.label || key;

module.exports = { CATEGORIES, CATEGORY_KEYS, labelOf };
