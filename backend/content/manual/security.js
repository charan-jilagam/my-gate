module.exports = {
  role: 'security',
  title: 'Security guard guide',
  intro: 'This guide is for guards at the gate. Everything you need during a shift is under Gate console, with a few supporting screens.',
  sections: [
    {
      id: 'start',
      title: 'How to sign in',
      covers: ['/login', '/forgot-password', '/register'],
      summary: 'Sign in at the start of your shift.',
      steps: ['Sign in with your email and password. If you just signed up, enter the codes sent to your email and mobile number, then wait for the society office to approve you.', 'Forgot your password? Use Forgot password and follow the email link.', 'Keep the app open on the gate phone or tablet; new alerts appear live.'],
      tips: []
    },
    {
      id: 'home',
      title: 'Home screen',
      path: '/dashboard',
      covers: ['/dashboard'],
      summary: 'A snapshot of the gate.',
      steps: ['Needs your attention shows invited visitors expected and open emergency alerts.', 'Right now shows visitors inside, deliveries approved and vehicles inside.', 'Quick actions open the gate console, visitors, deliveries, daily help check-in and alerts.'],
      tips: []
    },
    {
      id: 'gate',
      title: 'Gate console',
      path: '/gate',
      covers: ['/gate'],
      summary: 'Check people, parcels and vehicles in and out.',
      steps: [
        'The console has three tabs: Visitors, Deliveries and Vehicles.',
        'Invited visitor: tap Scan and scan the QR on their pass, or type the 8-character pass code they tell you in Visitor\'s pass code. You see the visitor\'s name, the flat and floor, the resident, and who approved them.',
        'Tap Check in and choose how long they will stay. The expected exit time is saved, and anyone still inside after it is flagged. When they leave, ask for their QR code or pass code again and tap Check out with code.',
        'You cannot check an invited visitor in or out with a click alone, and you never see their code. A walk-in that the resident approved is checked in and out by hand.',
        'An invitation stops working after the time the resident allowed, which is 24 hours after the expected arrival unless they changed it. If the check-in says it has expired, ask the resident to extend it.',
        'Walk-in visitor: tap Log a walk-in visitor, enter name, phone, purpose, block and flat, and Ask resident to approve. The visitor appears under Waiting for the resident; let them in only when approved.',
        'Deliveries: approved deliveries are listed. Check the courier in and mark handed over.',
        'Vehicles: search a registered vehicle by number and log entry or exit. The Inside now list shows who is currently in.'
      ],
      tips: ['Never let in a visitor whose status is not Approved or Expected.', 'If a resident does not answer, call them from the visitor card before deciding.']
    },
    {
      id: 'visitors',
      title: 'Visitors list',
      path: '/visitors',
      covers: ['/visitors'],
      summary: 'The full visitor log.',
      steps: ['Use the filters (Needs approval, Expected, Inside, Left) to review the day.', 'Open a visitor to see who invited them and their status history.'],
      tips: []
    },
    {
      id: 'deliveries',
      title: 'Deliveries list',
      path: '/deliveries',
      covers: ['/deliveries'],
      summary: 'Parcels and food orders expected across the society.',
      steps: ['See which flats expect deliveries, with courier details and notes.', 'Mark each one as arrived and handed over.'],
      tips: []
    },
    {
      id: 'vehicles',
      title: 'Vehicles',
      path: '/vehicles',
      covers: ['/vehicles'],
      summary: 'Registered vehicles and who is parked inside right now.',
      steps: ['Search by number. Use Log entry and Log exit to record movement.'],
      tips: ['An unregistered vehicle is treated like a visitor vehicle: record the number on the visitor entry.']
    },
    {
      id: 'daily-help',
      title: 'Daily help check-in',
      path: '/daily-help',
      covers: ['/daily-help'],
      summary: 'Maids, cooks and drivers show a QR code or say today\'s 6-digit code, both when they arrive and when they leave.',
      steps: ['Open Daily help and scan the helper\'s QR code or type the code they tell you, then tap Find.', 'You see who they are and whether they are inside. Tap Check in when they arrive and Check out when they leave. Every household they work for is notified.', 'To check someone out from the Inside now list, tap Check out and enter their code.', 'Too many wrong codes locks you out for 15 minutes. Codes change every day. If the helper says yesterday\'s code, it still finds them: check them in, then tell them today\'s code shown on your screen.'],
      tips: []
    },
    {
      id: 'sos',
      title: 'Emergency alerts',
      path: '/emergency',
      covers: ['/emergency'],
      summary: 'Respond fast when a resident presses SOS.',
      steps: ['A new alert shows the flat, the type, the resident\'s name and phone. Call them.', 'Tap I am responding so others know you are on it, then go to the flat or call for help.', 'When finished, tap Resolve and add a note about what happened.', 'The Emergency numbers list has police, fire, ambulance and hospital contacts.'],
      tips: ['Respond even if you suspect a false alarm.']
    },
    {
      id: 'shifts',
      title: 'My shifts',
      path: '/my-shifts',
      covers: ['/my-shifts'],
      summary: 'See your duty roster and clock in and out.',
      steps: ['Your upcoming shifts show the day, hours and post (for example Main gate).', 'Tap Clock in up to 30 minutes before your shift starts. Tap Clock out when you hand over.', 'Night shifts that run past midnight belong to the day they start.'],
      tips: ['A shift you never clocked in to is shown as Missed to the office.']
    },
    {
      id: 'notices',
      title: 'Notices',
      path: '/notices',
      covers: ['/notices'],
      summary: 'Announcements from the office.',
      steps: ['Read new notices at the start of each shift; some change gate rules.'],
      tips: []
    },
    {
      id: 'documents',
      title: 'Documents',
      path: '/documents',
      covers: ['/documents'],
      summary: 'Society rules and forms you may need at the gate.',
      steps: ['Search or filter by category, then tap to open.'],
      tips: []
    },
    {
      id: 'upkeep',
      title: 'Society upkeep',
      path: '/upkeep',
      covers: ['/upkeep'],
      summary: 'Recurring maintenance jobs such as tank cleaning and fire equipment checks.',
      steps: ['Items marked Overdue or Due soon need doing.', 'When a job is done, open it, tap Mark done, add a note and save. The next due date moves forward automatically and the office is told.'],
      tips: []
    },
    {
      id: 'profile',
      title: 'Profile and settings',
      path: '/profile',
      covers: ['/profile'],
      summary: 'Your details, password and notifications.',
      steps: ['Update your name, phone and photo, change your password, and turn on push notifications on the gate device.', 'The language selector in the top bar switches between English, Hindi and Telugu.'],
      tips: []
    }
  ]
};
