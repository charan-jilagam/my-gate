module.exports = {
  role: 'super_admin',
  title: 'Platform admin guide',
  intro: 'This guide is for the platform owner who runs many societies. You create societies and their admins, and can look into any society when something needs help.',
  sections: [
    {
      id: 'start',
      title: 'How your role differs',
      covers: ['/login', '/forgot-password'],
      summary: 'You belong to no single society.',
      steps: ['Your account is not tied to a society. Screens that act on one society ask you to choose it first (a Society picker at the top or in the form).', 'Day-to-day running (approvals, notices, dues) belongs to each society\'s own admin. Step in only when asked or when a society has no admin.'],
      tips: ['Give every society its own admin as soon as it is created.']
    },
    {
      id: 'home',
      title: 'Home screen',
      path: '/dashboard',
      covers: ['/dashboard'],
      summary: 'Platform-wide counters.',
      steps: ['Needs your attention shows items waiting across all societies, such as residents awaiting approval and open emergencies.', 'Quick actions open Societies, People and the other screens.'],
      tips: []
    },
    {
      id: 'societies',
      title: 'Societies',
      path: '/admin/societies',
      covers: ['/admin/societies'],
      summary: 'Create societies and appoint their admins.',
      steps: [
        'Tap New society. Enter the name, address, city, state, pincode, contact number, number of flats and blocks or towers.',
        'On a society, tap Add admin. Enter their name, email, phone and a temporary password. Share the password securely and ask them to change it at first sign-in.',
        'Open Amenities on a society to set up the clubhouse, courts and other bookable spaces.'
      ],
      tips: ['The society name is what residents choose when they register, so make it unambiguous.']
    },
    {
      id: 'people',
      title: 'People',
      path: '/admin/residents',
      covers: ['/admin/residents'],
      summary: 'Approvals and accounts across societies.',
      steps: ['Use the Society filter to look at one society\'s sign-ups.', 'Approve, reject or deactivate accounts exactly as a society admin would.'],
      tips: []
    },
    {
      id: 'gate',
      title: 'Gate, visitors, deliveries, vehicles, daily help',
      path: '/visitors',
      covers: ['/visitors', '/deliveries', '/vehicles', '/daily-help', '/gate'],
      summary: 'Read-and-act access across societies.',
      steps: ['These lists show records from every society. Use them to support a society office or investigate an incident.', 'Actions work the same as for a society admin.'],
      tips: []
    },
    {
      id: 'notices',
      title: 'Notices',
      path: '/notices',
      covers: ['/notices'],
      summary: 'Announcements to a chosen society.',
      steps: ['Tap New notice, choose the Society, then fill in the notice like a society admin would.'],
      tips: []
    },
    {
      id: 'society-tools',
      title: 'Complaints, community, amenities, services, emergency',
      path: '/complaints',
      covers: ['/complaints', '/community', '/community/:id', '/bookings', '/admin/services', '/services', '/services/providers/:id', '/services/requests', '/services/requests/:id', '/emergency'],
      summary: 'Support tools for any society.',
      steps: ['You can open these screens to help a society admin. Records show which society they belong to.', 'Verify or hide vendors under Home services, approve amenity bookings, moderate the community board, and respond to emergencies.'],
      tips: []
    },
    {
      id: 'money',
      title: 'Payments and accounts',
      path: '/payments',
      covers: ['/payments', '/accounts'],
      summary: 'Dues and accounts.',
      steps: ['When creating dues, choose the Society they are for.', 'Accounts shows collected, spent and balance for the society you pick.', 'Online payment needs the gateway keys set on the server; ask your developer if Pay buttons are disabled.'],
      tips: []
    },
    {
      id: 'documents',
      title: 'Documents library',
      path: '/documents',
      covers: ['/documents'],
      summary: 'Society documents.',
      steps: ['Pick the Society at the top, then add, edit or remove documents like a society admin.'],
      tips: []
    },
    {
      id: 'votes',
      title: 'Votes',
      path: '/votes',
      covers: ['/votes'],
      summary: 'Elections and resolutions per society.',
      steps: ['Pick the Society at the top. You can create and cancel votes and follow turnout. You cannot see how anyone voted.'],
      tips: []
    },
    {
      id: 'upkeep',
      title: 'Upkeep',
      path: '/upkeep',
      covers: ['/upkeep'],
      summary: 'Maintenance schedule per society.',
      steps: ['Pick the Society at the top to see or edit its upkeep jobs.'],
      tips: []
    },
    {
      id: 'roster',
      title: 'Duty roster',
      path: '/roster',
      covers: ['/roster'],
      summary: 'Guard and staff shifts per society.',
      steps: ['Pick the Society at the top, then view and plan shifts as a society admin would.'],
      tips: []
    },
    {
      id: 'profile',
      title: 'Profile and settings',
      path: '/profile',
      covers: ['/profile'],
      summary: 'Your details and password.',
      steps: ['Update your details and change your password. The language selector switches between English, Hindi and Telugu.'],
      tips: []
    }
  ]
};
