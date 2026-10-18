module.exports = {
  role: 'society_admin',
  title: 'Society admin guide',
  intro: 'This guide is for the society office. It explains how to approve people, run the gate, communicate, collect money, manage services, and keep records.',
  sections: [
    {
      id: 'start',
      title: 'Your first day',
      covers: ['/login', '/forgot-password'],
      summary: 'A suggested order to set the society up.',
      steps: [
        'Sign in with the admin account the platform owner created for you.',
        'Open Society and check the details and amenities (opening hours, price, slot length, booking rules).',
        'Open People and approve residents, guards, staff and vendors who have signed up.',
        'Add emergency numbers (Emergency screen) and upload bylaws (Documents).',
        'Create upkeep jobs (Upkeep) and give guards their shifts (Roster).',
        'Post a welcome notice (Notices) so residents know where to find things.'
      ],
      tips: ['Share the society name with residents; they pick it when they sign up.']
    },
    {
      id: 'home',
      title: 'Home screen',
      path: '/dashboard',
      covers: ['/dashboard'],
      summary: 'What needs the office today.',
      steps: ['Needs your attention lists residents waiting for approval, open complaints and open emergency alerts. Each has a button that opens the right screen.', 'Right now counts visitors inside, deliveries approved and vehicles inside.', 'Quick actions open the screens you use most.'],
      tips: []
    },
    {
      id: 'people',
      title: 'People (approvals and accounts)',
      path: '/admin/residents',
      covers: ['/admin/residents'],
      summary: 'Approve or reject sign-ups and see who lives in your society.',
      steps: [
        'The Waiting for approval tab lists new sign-ups with the role they chose, flat and phone. Tap Approve or Reject (give a reason).',
        'The Everyone tab lists all residents and staff. Search by name, flat or phone.',
        'Deactivate an account when someone moves out or leaves a job. They can no longer sign in. You can reactivate later.'
      ],
      tips: ['Check the flat number before approving; votes and gate checks rely on it.', 'Guards, staff and vendors need approval too.']
    },
    {
      id: 'gate',
      title: 'Gate console, visitors, deliveries, vehicles',
      path: '/gate',
      covers: ['/gate', '/visitors', '/deliveries', '/vehicles'],
      summary: 'Oversee what happens at the gate.',
      steps: [
        'Gate console works like the guards\' screen: scan passes, log walk-ins, check deliveries and vehicles in and out. Use it when the gate is short-staffed.',
        'Visitors, Deliveries and Vehicles show the full logs. Filter by status, and search vehicles by number.',
        'Use these lists to answer questions such as "who entered flat 402 yesterday?"'
      ],
      tips: []
    },
    {
      id: 'daily-help',
      title: 'Daily help',
      path: '/daily-help',
      covers: ['/daily-help'],
      summary: 'Domestic workers registered by residents.',
      steps: ['See every helper, who they work for and their attendance for the month.', 'Check a helper in or out with their code, like a guard would.', 'Remove a helper who should no longer enter the society.'],
      tips: []
    },
    {
      id: 'notices',
      title: 'Notices, polls and events',
      path: '/notices',
      covers: ['/notices'],
      summary: 'Announce, poll and invite.',
      steps: [
        'Tap New notice. Choose the type (notice, announcement, poll, event or maintenance), priority and category.',
        'Choose who should see it: everyone, only certain blocks, or only certain flats. Add attachments if needed and an optional "Hide after" date.',
        'For a poll, add the options. For an event, add the date, time and location; residents answer Going, Maybe or Can\'t come and you see only the counts.',
        'Delete a notice with the bin icon.'
      ],
      tips: ['For binding decisions with a secret ballot, use Votes instead of a poll.']
    },
    {
      id: 'votes',
      title: 'Votes and elections',
      path: '/votes',
      covers: ['/votes'],
      summary: 'Run committee elections and resolutions with a secret ballot.',
      steps: [
        'Tap New vote. Give it a title and description, choose Election (pick a candidate) or Resolution (pick an option such as Yes or No), and list two to twelve options.',
        'Choose One vote per flat (default, stops one household outvoting another) or One vote per resident.',
        'Set when voting opens and closes. Residents are notified.',
        'Open a vote to see turnout and who has voted and who has not. You never see what anyone chose.',
        'While open, you see turnout only. Results are hidden from everyone until voting closes, then appear with counts and the leading option. A tie is shown as a tie.',
        'You can edit a vote only before it opens. After that you can cancel it and start again.'
      ],
      tips: ['Votes cannot be traced to a person, even by you.']
    },
    {
      id: 'complaints',
      title: 'Complaints',
      path: '/complaints',
      covers: ['/complaints'],
      summary: 'Resident issues to assign and resolve.',
      steps: ['Open a complaint, set the priority, assign it to a staff member or vendor, and change the status to In progress or Resolved with a resolution note.', 'Post updates to keep the resident informed. Residents can rate the resolution.'],
      tips: []
    },
    {
      id: 'community',
      title: 'Community moderation',
      path: '/community',
      covers: ['/community', '/community/:id'],
      summary: 'Keep the resident board friendly.',
      steps: ['Use the Reported tab to see posts that residents flagged.', 'Pin an important post, hide one that breaks the rules, or delete it. Three reports hide a post automatically and alert you.', 'Open a post to see who liked it and who reported it, with their reasons.'],
      tips: []
    },
    {
      id: 'amenities',
      title: 'Amenity bookings',
      path: '/bookings',
      covers: ['/bookings'],
      summary: 'Approve or reject requests for shared spaces.',
      steps: ['Pending bookings show amenity, date, time, guests and the amount. Approve or Reject (give a reason).', 'The system refuses overlapping bookings, also when you approve.', 'Open Our amenities, next to Booking requests, to add a space, change its hours, price, slot length or approval rule, close it for booking, or remove it. Every society has its own list.'],
      tips: []
    },
    {
      id: 'services',
      title: 'Home services',
      path: '/admin/services',
      covers: ['/admin/services', '/services', '/services/providers/:id', '/services/requests', '/services/requests/:id'],
      summary: 'Manage the electricians, plumbers and other vendors serving your residents.',
      steps: [
        'Vendors tab: see each vendor who signed up. Tap Verify once you have checked them, and Hide to stop residents seeing someone (for example after complaints). Show brings them back.',
        'Bookings tab: see every booking across the society and open one to read its timeline. You can cancel a booking if something is wrong.',
        'Open Services to see exactly what residents see when they browse.'
      ],
      tips: ['A vendor must also be approved under People before they can sign in.']
    },
    {
      id: 'payments',
      title: 'Payments and dues',
      path: '/payments',
      covers: ['/payments'],
      summary: 'Collect maintenance and other dues.',
      steps: [
        'Tap Create dues. Choose the type (maintenance, fine, other), the amount per flat, the month and the due date. A pending payment is created for every resident.',
        'Residents pay online; the entry turns Completed and you are notified.',
        'For cash or cheque, tap Record payment on the due, choose the method, enter who received it and a reference.',
        'Open a completed payment to see or download the receipt as a PDF. Use the month filter to reconcile.'
      ],
      tips: ['If residents cannot pay online, the society has not set up the payment gateway keys yet.']
    },
    {
      id: 'accounts',
      title: 'Accounts and expenses',
      path: '/accounts',
      covers: ['/accounts'],
      summary: 'Record what the society spends; residents see the totals.',
      steps: ['Pick a month. The top shows collected, spent, balance and unpaid dues.', 'Tap Add expense: what it was for, amount, date, category, who was paid and a note. Edit or delete mistakes from the list.', 'Residents see the totals and categories, not individual bills.'],
      tips: []
    },
    {
      id: 'documents',
      title: 'Documents library',
      path: '/documents',
      covers: ['/documents'],
      summary: 'Keep bylaws, minutes and circulars in one place.',
      steps: ['Tap Add document. Upload a PDF (up to 10 MB) or paste an https link, choose a category and write a short description.', 'Choose who can see it: Everyone, or Office only for sensitive papers.', 'Tick Tell residents to send a notification when it is added.', 'Edit or remove a document at any time.'],
      tips: []
    },
    {
      id: 'upkeep',
      title: 'Upkeep schedule',
      path: '/upkeep',
      covers: ['/upkeep'],
      summary: 'Never miss tank cleaning, lift servicing or fire-equipment checks.',
      steps: ['Tap Add job. Name it (for example "Clean overhead water tanks"), choose a category, how often it repeats in days, when it is next due, and the contractor\'s name and phone.', 'The list shows Overdue, Due soon (next 7 days) and OK. Open a job to see its history and costs.', 'Tap Mark done when it is finished, with the date, a note and the cost. The next due date moves forward by the repeat interval.', 'Staff and guards can also mark jobs done; you are told when they do. Switch a job off if it no longer applies.'],
      tips: ['Residents see the status of each job but never the cost or contractor details.']
    },
    {
      id: 'roster',
      title: 'Duty roster',
      path: '/roster',
      covers: ['/roster'],
      summary: 'Plan shifts for guards and staff and see attendance.',
      steps: ['Choose a week. The grid shows who is on duty each day, at which post.', 'Tap Add shifts: choose the person, tick the days, set start and end time (a shift that ends earlier than it starts runs overnight), pick the post and save. The person is notified.', 'Each shift shows its status: Scheduled, On duty, Completed or Missed (nobody clocked in).', 'Remove a shift that has not started. Shifts that were clocked into stay as a record.'],
      tips: ['Give night guards the shift on the day it starts.']
    },
    {
      id: 'sos',
      title: 'Emergency and SOS',
      path: '/emergency',
      covers: ['/emergency'],
      summary: 'Respond to alerts and keep the numbers directory.',
      steps: ['Open alerts show the flat, type and resident phone. Acknowledge and resolve them like guards do.', 'Under Emergency numbers, tap Add to keep police, fire, ambulance, hospital and society desk contacts. Residents see them with call buttons.'],
      tips: []
    },
    {
      id: 'society',
      title: 'Society settings and amenities',
      path: '/admin/societies',
      covers: ['/admin/societies'],
      summary: 'Your society\'s details and amenities.',
      steps: ['Check the society name, address, blocks and contact number.', 'Open Amenities to add or edit shared spaces: capacity, price per hour, opening and closing times, slot length, max slots in a row, how many days ahead people may book, and whether the office must approve bookings.'],
      tips: []
    },
    {
      id: 'profile',
      title: 'Profile and settings',
      path: '/profile',
      covers: ['/profile'],
      summary: 'Your details and password.',
      steps: ['Update your details, change your password, turn on push notifications.', 'The language selector switches between English, Hindi and Telugu.'],
      tips: []
    }
  ]
};
