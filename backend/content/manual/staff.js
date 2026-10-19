module.exports = {
  role: 'staff',
  title: 'Staff guide',
  intro: 'This guide is for society staff such as housekeeping, maintenance and gardeners. You see the jobs and information that concern you.',
  sections: [
    {
      id: 'start',
      title: 'How to sign in',
      covers: ['/login', '/forgot-password', '/register'],
      summary: 'Sign in and find your way around.',
      steps: ['Sign in with your email and password. A new account must be approved by the society office first.', 'Use Forgot password if you cannot remember it.', 'The menu shows only what you can use: Home, People, Amenities, My shifts, Upkeep, Complaints, Notices and Documents.'],
      tips: []
    },
    {
      id: 'home',
      title: 'Home screen',
      path: '/dashboard',
      covers: ['/dashboard'],
      summary: 'What needs you today.',
      steps: ['Needs your attention shows open complaints.', 'Tap the bell for new assignments and notices.'],
      tips: []
    },
    {
      id: 'approve-residents',
      title: 'Approving new residents',
      path: '/admin/residents',
      covers: ['/admin/residents'],
      summary: 'Let new residents in as soon as you know them.',
      steps: ['Open People. New residents who signed up are listed with their flat and phone number.', 'Tap Approve once you know the person. They get an email at once and can sign in.', 'The admin is told that you approved them. Guards, staff and vendors, and rejections, are for the admin only.'],
      tips: ['If you do not recognise someone, leave them for the admin.']
    },
    {
      id: 'amenity-requests',
      title: 'Amenity booking requests',
      path: '/bookings',
      covers: ['/bookings'],
      summary: 'Approve or reject requests for shared spaces.',
      steps: ['Open Amenities. Waiting requests show the amenity, day, time, resident and amount.', 'Tap Approve, or Reject and give a reason. The resident is told at once.', 'When you approve a booking that has a price, the amount is added to the resident\'s Payments and they are told to pay. The admin is told that you approved it.'],
      tips: ['If two requests clash, approve one and reject the other.']
    },
    {
      id: 'shifts',
      title: 'My shifts',
      path: '/my-shifts',
      covers: ['/my-shifts'],
      summary: 'Your duty roster, with clock in and clock out.',
      steps: ['Upcoming shifts show the day, hours and your post (for example Housekeeping).', 'Tap Clock in when you start (up to 30 minutes early) and Clock out when you finish. The office uses this for attendance.'],
      tips: ['If your shift is missing or wrong, tell the office; only they can change the roster.']
    },
    {
      id: 'upkeep',
      title: 'Society upkeep',
      path: '/upkeep',
      covers: ['/upkeep'],
      summary: 'Recurring maintenance jobs and when they are due.',
      steps: ['Jobs are sorted with the most urgent first: Overdue, Due soon, then OK.', 'After doing a job, open it, tap Mark done, choose the date, add a short note and save. The next due date is worked out for you.', 'Open a job to see who did it last time, contractor details and notes.'],
      tips: ['You cannot record a date in the future.']
    },
    {
      id: 'complaints',
      title: 'Complaints',
      path: '/complaints',
      covers: ['/complaints'],
      summary: 'Issues assigned to you.',
      steps: ['Open a complaint to read the problem, see photos and the flat.', 'Post an update when you start or need something, and change the status to In progress or Resolved with a resolution note.'],
      tips: ['Always add a resolution note so the resident knows what was done.']
    },
    {
      id: 'notices',
      title: 'Notices',
      path: '/notices',
      covers: ['/notices'],
      summary: 'Announcements from the office.',
      steps: ['Read new notices; planned work like water shutdowns is posted here.'],
      tips: []
    },
    {
      id: 'documents',
      title: 'Documents',
      path: '/documents',
      covers: ['/documents'],
      summary: 'Society rules, checklists and forms.',
      steps: ['Filter by category or search, then tap a document to open it.'],
      tips: []
    },
    {
      id: 'profile',
      title: 'Profile and settings',
      path: '/profile',
      covers: ['/profile'],
      summary: 'Your details and password.',
      steps: ['Update your name, phone and photo, change your password, and turn on push notifications.', 'Use the language selector in the top bar for English, Hindi or Telugu.'],
      tips: []
    }
  ]
};
