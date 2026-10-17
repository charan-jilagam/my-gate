// One manual per role. A user can only ever be given the manual for their own role.
const raw = {
  resident: require('./resident'),
  security: require('./security'),
  staff: require('./staff'),
  vendor: require('./vendor'),
  society_admin: require('./society_admin'),
  super_admin: require('./super_admin')
};

// Every guide explains the guide itself first.
const aboutGuide = {
  id: 'about-guide',
  title: 'How to use this guide',
  path: '/help',
  covers: ['/help'],
  summary: 'Find what you need quickly.',
  steps: [
    'Pick a topic from the list on the left (on a phone, from the Topic dropdown) to read how that screen works.',
    'Use the search box to find a word, such as "payment" or "slot".',
    'Tap Open this screen on a topic to jump straight to it. You can come back to the guide any time with the book icon at the top of every page.',
    'You only see the guide for your own role. Other roles have different screens, so their guides are separate.'
  ],
  tips: ['Change the language with the globe menu at the top. The menus, screen titles and this guide all change.']
};

const manuals = Object.fromEntries(Object.entries(raw).map(([role, m]) => [role, { ...m, sections: [aboutGuide, ...m.sections] }]));

module.exports = { manuals, manualFor: (role) => manuals[role] || null };
