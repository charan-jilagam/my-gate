// One manual per role. A user can only ever be given the manual for their own role.
const x = require('./extra');
const security = require('./security');
const raw = {
  resident: (() => { const m = require('./resident'); return { ...m, sections: [...m.sections, x.onDuty, x.ratings, x.openLinks] }; })(),
  security: { ...security, sections: [...security.sections, x.swaps, x.availability, x.clockLocation] },
  guard_admin: {
    ...security,
    role: 'guard_admin',
    title: 'Guard head guide',
    intro: 'This guide is for the head of the guards. You run the guards\' roster, attendance and tracking, and do everything a guard can do at the gate.',
    sections: [...security.sections, x.swaps, x.availability, x.clockLocation, x.roster, x.attendance, x.live, x.posts]
  },
  staff: (() => { const m = require('./staff'); return { ...m, sections: [...m.sections, x.swaps, x.availability, x.clockLocation] }; })(),
  vendor: (() => { const m = require('./vendor'); return { ...m, sections: [...m.sections, x.rateResident] }; })(),
  society_admin: (() => { const m = require('./society_admin'); return { ...m, sections: [...m.sections.filter((s) => s.id !== 'roster'), x.roster, x.attendance, x.live, x.swaps, x.posts, x.head, x.openLinks] }; })(),
  super_admin: (() => { const m = require('./super_admin'); return { ...m, sections: [...m.sections.filter((s) => s.id !== 'roster'), x.roster, x.attendance, x.live, x.swaps, x.posts, x.head] }; })()
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
