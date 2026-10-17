// User manual for residents. Every screen a resident can open has a section here; `covers` lists the app paths it explains.
module.exports = {
  role: 'resident',
  title: 'Resident guide',
  intro: 'This guide covers everything you can do as a resident, one screen at a time. Use the menu on the left (or the tabs at the bottom of your phone) to open each screen.',
  sections: [
    {
      id: 'start',
      title: 'Getting started',
      covers: ['/register', '/login', '/forgot-password'],
      summary: 'Create your account, wait for approval, and sign in.',
      steps: [
        'Open the app and tap Create account. Choose your society, enter your name, mobile number, email, block or tower, flat number and a password.',
        'Your society office must approve you before you can sign in. You will see a waiting screen until then. Nothing is lost if you close the app.',
        'After approval, sign in with your email and password. Forgot it? Tap Forgot password on the sign-in screen and follow the email link.',
        'On a phone, add the app to your home screen (your browser menu has "Add to home screen") so it opens like any other app.'
      ],
      tips: ['Use the flat number exactly as the office has it (for example A-101 is block A, flat 101). Votes and gate checks rely on it.']
    },
    {
      id: 'home',
      title: 'Home screen',
      path: '/dashboard',
      covers: ['/dashboard'],
      summary: 'What needs your attention today, in one place.',
      steps: [
        'Needs your attention lists things waiting on you: visitors at the gate, pending payments, open complaints and similar.',
        'Quick actions are one-tap shortcuts: pre-approve a visitor, book a home service or an amenity, pay dues, raise a complaint, daily help, community and the red SOS button.',
        'Your home services shows your upcoming service visits. Recent activity is a short log of what just happened in your home.',
        'The bell at the top shows your notifications. Tap one to jump straight to the right screen.'
      ],
      tips: ['Turn on notifications on your phone (Profile screen) so you hear about visitors immediately.']
    },
    {
      id: 'visitors',
      title: 'Visitors',
      path: '/visitors',
      covers: ['/visitors'],
      summary: 'Invite guests ahead of time, approve walk-ins, and see who is inside.',
      steps: [
        'Tap Invite visitor. Enter their name, phone, purpose, number of people, expected arrival and vehicle number if any, then save.',
        'On the invitation tap Show pass to see the gate pass with its QR code and pass code. Share it with your guest; the guard scans it or types the code.',
        'If someone arrives without an invitation, the guard asks you to approve. You get a notification: approve or reject (with a reason).',
        'Use the filters (Needs approval, Expected, Inside, Left) to find a visitor. You can edit or cancel an invitation until the visitor checks in.'
      ],
      tips: ['A pass is for one visit. Invite again for the next visit.', 'Delivery people and daily help have their own screens.']
    },
    {
      id: 'deliveries',
      title: 'Deliveries',
      path: '/deliveries',
      covers: ['/deliveries'],
      summary: 'Tell the gate what you are expecting so couriers are not held up.',
      steps: [
        'Tap Expect delivery. Enter what is arriving, the company, tracking number, courier name and phone, and a note for the guard.',
        'When the courier arrives the guard checks them in and you are notified. Parcels are marked collected when handed over.',
        'If you do not pre-register a delivery, the guard will ask you to approve it at the gate.'
      ],
      tips: ['Add a note like "Leave with security" so the guard knows what to do if you are not home.']
    },
    {
      id: 'vehicles',
      title: 'Vehicles',
      path: '/vehicles',
      covers: ['/vehicles'],
      summary: 'Register your vehicles so the gate recognises them.',
      steps: [
        'Tap Register vehicle. Enter the number, type, brand, model and colour.',
        'The list shows each vehicle and whether it is inside the society right now.',
        'Use the pencil to edit or the bin icon to remove a vehicle you sold.'
      ],
      tips: ['Search by vehicle number to find one quickly.']
    },
    {
      id: 'daily-help',
      title: 'Daily help',
      path: '/daily-help',
      covers: ['/daily-help'],
      summary: 'Maids, cooks and drivers get a gate code; you see when they arrive and leave.',
      steps: [
        'Tap Add helper and enter their name, phone and what they do. The app gives them a 6-digit gate code.',
        'Tell your helper the code. At the gate they say it; the guard types it. The first time in a day is a check-in, the next is a check-out, and you are told each time.',
        'Open a helper to see monthly attendance.',
        'If your helper also works in another flat, ask that household to add them using the helper\'s code (Add by code).'
      ],
      tips: ['Anyone who knows the code can enter as that helper. Remove the helper if they stop working for you.']
    },
    {
      id: 'services',
      title: 'Home services',
      path: '/services',
      covers: ['/services', '/services/providers/:id', '/services/requests', '/services/requests/:id'],
      summary: 'Book an electrician, plumber, carpenter and more from vendors your society lists, in a free time slot.',
      steps: [
        'Open Services and choose a trade. Each vendor card shows rating, visit charge and the next free slot.',
        'Open a vendor, pick a day, then tap a free slot. Describe the problem, add photos if useful, mark Urgent if needed, and book.',
        'Under My bookings track the job. If the vendor must confirm, you see Waiting for the vendor. You can change the time or cancel until work starts.',
        'When the vendor arrives, read out the 4-digit start code shown on your booking. Do not share it before then.',
        'When the vendor completes the job you see the amount and what was done. Tap Pay online (when your society has online payment) or pay the vendor directly.',
        'Rate the job afterwards. Other residents see your first name and flat with your review.'
      ],
      tips: ['The vendor\'s phone number appears once they confirm.', 'Parts and extra work are agreed with the vendor and paid to them directly.']
    },
    {
      id: 'amenities',
      title: 'Amenities (clubhouse, courts and more)',
      path: '/bookings',
      covers: ['/bookings'],
      summary: 'Book shared spaces by tapping free time slots.',
      steps: [
        'Tap Book amenity, choose the amenity and a day. Free slots appear; tap one or several in a row (up to the limit shown).',
        'The price is worked out for you. Add the number of guests and any notes, then confirm.',
        'Some amenities confirm instantly; others wait for the office to approve. You are notified either way.',
        'Use the filters to see your pending or approved bookings, and Cancel to release a slot you no longer need.'
      ],
      tips: ['Greyed-out slots are taken, outside opening hours, or too far ahead. Hover or tap to see why.']
    },
    {
      id: 'community',
      title: 'Community board',
      path: '/community',
      covers: ['/community', '/community/:id'],
      summary: 'Talk to neighbours: discussions, help, buy and sell, lost and found, recommendations and meet-ups.',
      steps: [
        'Pick a category tab or search. Tap New post, choose a category, write a title and details, add photos, and set a price for buy and sell posts.',
        'Open a post to like it and reply. Authors can mark a post sold, found or solved.',
        'Use the Mine tab to see your own posts. Report a post that breaks the rules; three reports hide it and alert the office.'
      ],
      tips: ['Never post phone numbers or addresses of other people.']
    },
    {
      id: 'notices',
      title: 'Notices, polls and events',
      path: '/notices',
      covers: ['/notices'],
      summary: 'Announcements from your society office.',
      steps: [
        'Read notices newest first. High priority and urgent notices are marked.',
        'For polls, tap an option to vote. For events, choose Going, Maybe or Can\'t come and add guests. Everyone sees how many are coming, never who.'
      ],
      tips: []
    },
    {
      id: 'votes',
      title: 'Votes and elections',
      path: '/votes',
      covers: ['/votes'],
      summary: 'Take part in society elections and decisions. One vote per flat, secret ballot.',
      steps: [
        'Open a vote that is Open now. Read the description and each option, tap your choice and confirm.',
        'You cannot change or withdraw a vote. If someone else in your flat already voted, you will be told that your flat has voted.',
        'Results appear after voting closes, with the number and share of votes for each option. Nobody, including the office, can see who voted for what.'
      ],
      tips: ['Votes that are Upcoming show when voting opens; you will be notified.']
    },
    {
      id: 'payments',
      title: 'Payments',
      path: '/payments',
      covers: ['/payments'],
      summary: 'Pay maintenance and other dues, and keep receipts.',
      steps: [
        'Pending dues are listed with a Pay now button. Tap it (or tap Make payment to pay any amount) and complete the payment in the secure window.',
        'After payment your receipt is saved. Open it and tap Download PDF.',
        'If a payment method you used (cash, cheque) was recorded by the office, it shows here as well.'
      ],
      tips: ['If the Pay button is greyed out, online payment is not enabled for your society. Pay at the office and ask them to record it.']
    },
    {
      id: 'accounts',
      title: 'Society accounts',
      path: '/accounts',
      covers: ['/accounts'],
      summary: 'See how maintenance money is collected and spent.',
      steps: [
        'Choose a month. You see what was collected, what was spent, the balance and unpaid dues.',
        'Where the money went shows spending by category such as security, lifts and electricity.'
      ],
      tips: ['You see totals and categories only, not other residents\' payments.']
    },
    {
      id: 'documents',
      title: 'Documents',
      path: '/documents',
      covers: ['/documents'],
      summary: 'Bylaws, meeting minutes, circulars and forms shared by the office.',
      steps: ['Filter by category or search by title.', 'Tap a document to open or download it.'],
      tips: []
    },
    {
      id: 'upkeep',
      title: 'Society upkeep',
      path: '/upkeep',
      covers: ['/upkeep'],
      summary: 'See when water tanks, lifts, generators and fire equipment were last serviced and when they are next due.',
      steps: ['Items marked Overdue or Due soon need attention; open one to see its history.', 'This screen is read-only for residents. If something looks overdue, raise a complaint.'],
      tips: []
    },
    {
      id: 'complaints',
      title: 'Complaints',
      path: '/complaints',
      covers: ['/complaints'],
      summary: 'Raise an issue and follow it until it is fixed.',
      steps: [
        'Tap Raise complaint. Choose a category, priority, where in the society, describe what is wrong and add photos.',
        'Open a complaint to read updates, post a comment, and see the resolution note.',
        'When it is resolved, give feedback and a rating.'
      ],
      tips: ['Use the filters to see only open or in-progress complaints.']
    },
    {
      id: 'sos',
      title: 'Emergency and SOS',
      path: '/emergency',
      covers: ['/emergency'],
      summary: 'One tap alerts every guard and admin with your flat and phone number.',
      steps: [
        'Open Emergency (or tap the red SOS button). Choose Medical, Fire or smoke, Security threat or Something else, optionally add a note, and send.',
        'Guards and admins get a push and text alert. You will see when someone is responding and when it is resolved.',
        'Below the button is a list of important numbers (police, fire, ambulance, hospital, society desk) with call buttons.'
      ],
      tips: ['Pressing SOS twice within two minutes does not alert everyone again.', 'In a life-threatening emergency, also call the emergency services directly.']
    },
    {
      id: 'profile',
      title: 'Profile and settings',
      path: '/profile',
      covers: ['/profile'],
      summary: 'Your details, password and notifications.',
      steps: [
        'Update your name, mobile number and photo.',
        'Change your password with your current password.',
        'Turn text messages on or off, and turn push notifications on for this device.',
        'Use the language selector in the top bar to switch between English, Hindi and Telugu. Use the moon or sun icon to change light or dark mode.'
      ],
      tips: []
    }
  ]
};
