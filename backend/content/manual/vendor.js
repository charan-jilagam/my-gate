module.exports = {
  role: 'vendor',
  title: 'Service provider guide',
  intro: 'This guide is for electricians, plumbers, carpenters, painters, cleaners and other service providers who take jobs from residents.',
  sections: [
    {
      id: 'start',
      title: 'Joining',
      covers: ['/register', '/login', '/forgot-password'],
      summary: 'Sign up as a vendor and get approved.',
      steps: ['Create an account and choose the Vendor role. Pick the society you serve.', 'The society office approves your account. After that, sign in and set up your schedule before residents can book you.', 'The office also verifies vendors. A verified badge helps residents trust you.'],
      tips: []
    },
    {
      id: 'schedule',
      title: 'My schedule (set up first)',
      path: '/work/setup',
      covers: ['/work/setup'],
      summary: 'Tell the app what you do and when you work. Residents can only book the times you offer.',
      steps: [
        'Under What you do, choose your services (up to five trades). Under About you, add a short introduction, your years of experience, your visit charge and a price note such as "parts extra".',
        'Under Working hours, switch each day on or off and choose start and end times.',
        'Under Booking settings, choose the slot length (30 to 180 minutes), an optional daily break, the minimum notice you need and how far ahead people can book (Bookable up to). Add days off under Days off.',
        'Turn on Confirm bookings automatically if you want every booking accepted for you. Otherwise you accept or decline each one.',
        'Switch off Taking bookings (or use the pause button on My jobs) when you are away; residents cannot book you while it is off.'
      ],
      tips: ['A longer slot length means fewer bookings per day but less rushing.', 'Slots are shown in your society\'s time zone.']
    },
    {
      id: 'jobs',
      title: 'My jobs',
      path: '/work',
      covers: ['/work'],
      summary: 'Today\'s jobs, new requests and what you earned.',
      steps: [
        'Waiting for your reply lists new requests. Open one, read the problem and photos, then Accept or Decline (with a reason).',
        'Today and Upcoming show confirmed jobs. The resident\'s phone number appears once you accept.',
        'This month\'s earnings adds up completed jobs.'
      ],
      tips: ['Reply quickly. Residents are notified and often book elsewhere if they wait.']
    },
    {
      id: 'job-flow',
      title: 'Doing a job',
      path: '/services/requests',
      covers: ['/services/requests', '/services/requests/:id'],
      summary: 'From confirmed to paid.',
      steps: [
        'Tap I am on my way so the resident knows you are coming.',
        'At the door, ask the resident for their 4-digit start code and tap Start job. Five wrong tries lock the job, so check the code with the resident.',
        'When finished, tap Complete job. Enter the amount (including parts and labour), what you did, and whether you were paid now or later.',
        'If you were paid later, open the job and tap Mark as paid, choosing cash, UPI or other. Residents may also pay you online and you are notified.',
        'You can cancel a confirmed job before starting; give the resident a clear reason.'
      ],
      tips: ['A gate pass is created when you accept, so security lets you in. Carry your phone.', 'Ratings and reviews show on your profile.']
    },
    {
      id: 'complaints',
      title: 'Complaints',
      path: '/complaints',
      covers: ['/complaints'],
      summary: 'Issues from the society that are assigned to you.',
      steps: ['Open a complaint, read the details, post an update and set the status to In progress or Resolved with a note.'],
      tips: []
    },
    {
      id: 'notices',
      title: 'Notices',
      path: '/notices',
      covers: ['/notices'],
      summary: 'Announcements from the society office.',
      steps: ['Read notices about gate rules, timings or shutdowns that affect your visits.'],
      tips: []
    },
    {
      id: 'profile',
      title: 'Profile and settings',
      path: '/profile',
      covers: ['/profile'],
      summary: 'Your details and password.',
      steps: ['Update your name, phone and photo, change your password and turn on push notifications so you hear about new requests instantly.', 'The language selector in the top bar switches between English, Hindi and Telugu.'],
      tips: []
    }
  ]
};
