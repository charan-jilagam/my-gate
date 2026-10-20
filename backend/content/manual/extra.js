// Screens added with shift swaps, attendance, guard tracking and ratings. Kept apart so each guide can share them.

const swaps = {
  id: 'swaps',
  title: 'Shift swaps',
  path: '/swaps',
  covers: ['/swaps'],
  summary: 'Swap a shift with a colleague. They must say yes.',
  steps: [
    'Tap Ask to swap. First choose the shift you want to give away, then choose a colleague and the shift you want in return.',
    'Add a short note if you like, then tap Send request. Nothing changes yet.',
    'Your colleague gets a notification and can Accept or Decline. When they accept, both rosters change at once.',
    'The admin, the guard head and the other guards are told when a swap is done. Residents are not told.',
    'Requests asked of you appear under Asked of me. You can cancel your own request while it is waiting.'
  ],
  tips: ['A shift that has already started cannot be swapped.']
};

const availability = {
  id: 'availability',
  title: 'When I can work',
  path: '/my-shifts',
  summary: 'Tell the office which days and hours suit you.',
  steps: [
    'On My shifts, open the tab When I can work.',
    'Tick the days you can work and set the hours you are free. Add days off for leave or a function.',
    'Tap Save my availability. The automatic roster only gives you shifts inside these hours.'
  ],
  tips: ['If you never set this, you can be given a shift at any time.']
};

const clockLocation = {
  id: 'clock-location',
  title: 'Location while on duty',
  path: '/my-shifts',
  summary: 'What is shared, and when.',
  steps: [
    'When you clock in, your phone shares its location with the office. Allow location for this website when asked.',
    'While you are clocked in, a green bar shows that your location is being shared. It stops when you clock out.',
    'Sharing works while the app is open on your screen. Turn on Keep my screen on while on duty if you want it to continue.',
    'If you clock in far from your post, the office is told. Nothing is recorded when you are off duty.'
  ],
  tips: ['Use My attendance on My shifts to see your own record.']
};

const roster = {
  id: 'roster-office',
  title: 'Duty roster and automatic plan',
  path: '/roster',
  covers: ['/roster'],
  summary: 'Plan shifts yourself or let the app plan them.',
  steps: [
    'Choose a week. The list shows who is on duty each day, at which post.',
    'Tap Plan automatically, choose the start date, the number of days and the places where you need guards.',
    'Tap Show me the plan. You see how many shifts will be created, the hours each guard gets and any place nobody could take. Nothing is saved yet.',
    'Tap Create these shifts to save the plan. Each guard is told about their shifts once.',
    'Tap Add shifts to give a single person a shift by hand. Shifts made automatically are marked Auto.'
  ],
  tips: ['Guards are only given shifts inside the hours they said they can work, with rest between shifts.']
};

const attendance = {
  id: 'attendance',
  title: 'Guard attendance',
  path: '/attendance',
  covers: ['/attendance'],
  summary: 'Who came on time, who was late, who did not come.',
  steps: [
    'Choose Last 7, 14 or 30 days. The tiles show how many shifts were attended, on time, late or missed.',
    'Tap a person to see each of their shifts with clock-in and clock-out times and the hours worked.',
    'A clock-in far from the post is marked with the distance.',
    'You get a notification when a guard clocks in away from the post.'
  ],
  tips: ['Late means more than 10 minutes after the shift started.']
};

const live = {
  id: 'live',
  title: 'Guard tracking',
  path: '/live',
  covers: ['/live'],
  summary: 'See where each guard on duty was last seen.',
  steps: [
    'The map shows guards who are clocked in, and the society and guard posts. The page refreshes by itself.',
    'Each guard card shows the post, how long ago they were seen and how far they are from the post.',
    'Away from post means the guard was seen outside the allowed distance. Not updating means no location for a few minutes.',
    'Should be on duty, not clocked in lists guards whose shift has started. Tap Call to reach them.'
  ],
  tips: ['Location is shared only while a guard is clocked in, and only while the app is open on their phone.']
};

const posts = {
  id: 'posts',
  title: 'Guard posts and society location',
  path: '/guard-posts',
  covers: ['/guard-posts'],
  summary: 'Tell the app where guards are needed and where your society is.',
  steps: [
    'Under Society location, tap the map to place the pin, or tap Use my current location while standing at the main gate. Choose how far still counts as at the society, then save.',
    'Tap Add post, give the place a name, and add the times guards are needed with the number of guards for each.',
    'Optionally set the exact spot of a post on the map so guards are checked against it.',
    'Pause a post to stop planning guards for it. Remove it when it is no longer needed.'
  ],
  tips: ['Do this once, then use Plan automatically on the duty roster.']
};

const head = {
  id: 'guard-head',
  title: 'Making someone guard head',
  path: '/admin/residents',
  summary: 'Give one guard charge of the other guards.',
  steps: [
    'Open People, then All people. Find an approved guard.',
    'Tap Make guard head. They can then plan the roster, see attendance and track guards, and are told about swaps.',
    'Tap Remove as guard head to make them a normal guard again.'
  ],
  tips: ['Residents can see the guard head number in the Emergency screen.']
};

const onDuty = {
  id: 'on-duty',
  title: 'Who is on duty and my emergency contacts',
  path: '/emergency',
  covers: [],
  summary: 'Call the guard who is really there.',
  steps: [
    'The home screen and the Emergency screen show the security guard on duty now. Tap Call to reach them.',
    'The Security desk number in Important numbers changes with the guard on duty.',
    'In Profile, add up to 5 people under My emergency contacts. They are texted when you press SOS, and you can call them from the Emergency screen.'
  ],
  tips: ['In a life-threatening emergency, also call 112.']
};

const rateResident = {
  id: 'rate-resident',
  title: 'Rating the resident',
  path: '/services/requests',
  covers: [],
  summary: 'After a job is complete, rate how it went.',
  steps: [
    'Open a completed job and tap Rate the resident. Choose 1 to 5 stars and add a comment if you like.',
    'Your rating is private. The resident is not told and cannot see it. Other vendors see the average rating of a resident before they accept a job.'
  ],
  tips: ['You can rate each job once.']
};

const ratings = {
  id: 'ratings',
  title: 'Ratings and recommended vendors',
  path: '/services',
  covers: [],
  summary: 'Choose vendors that other residents trust.',
  steps: [
    'After a job is complete, tap Rate this job and give 1 to 5 stars with a short review.',
    'In Home services, vendors are sorted as Recommended by default. Top rated and Recommended badges are given only after several good reviews.',
    'A vendor you have used before is marked You booked before, so you can book them again easily.'
  ],
  tips: ['The vendor can also rate you, and you can see that rating on the job.']
};

const openLinks = {
  id: 'notification-links',
  title: 'Opening a notification',
  path: '/notices',
  covers: [],
  summary: 'Go straight to what a message was about.',
  steps: [
    'Tap the bell and tap a notification. The right screen opens and the item flashes so you can see it.',
    'A notice opens at the top of the notices list.'
  ],
  tips: []
};

const nearby = {
  id: 'nearby',
  title: 'Finding places near you',
  path: '/nearby',
  covers: ['/nearby'],
  summary: 'Shops, hospitals, petrol bunks, temples and more, with directions.',
  steps: [
    'Open Nearby places. Pick a kind of place, such as Hospitals, Petrol or Temples.',
    'The map shows a dashed circle 1 km around your society. The list shows the nearest places first, with the distance.',
    "Tap Directions to open turn by turn directions in your phone's maps app. Tap Call when a phone number is shown.",
    'Use 2 km or 5 km to look further, or From where I am to search around you instead of the society.'
  ],
  tips: ['Places come from OpenStreetMap, so a new shop may be missing. Call ahead for timings.']
};

const occasions = {
  id: 'occasions',
  title: 'Occasions and photos',
  path: '/occasions',
  covers: ['/occasions'],
  summary: 'Festivals, celebrations and get-togethers in your society, with photos.',
  steps: [
    'Open Occasions. The newest one is shown large at the top, and older ones are below as cards with their cover photo and date.',
    'Use the type buttons (Festival, Sports and so on) and the year to find one.',
    'Tap an occasion to see the date, venue, who organised it, how many people came, what happened and its highlights.',
    'Tap any photo to see it full screen. Swipe or use the arrows to move between photos, and the cross to close.',
    'You get a notification when the society adds a new occasion.'
  ],
  tips: ['Only the society office and staff can add occasions.']
};

const occasionsManage = {
  id: 'occasions',
  title: 'Occasions and photos',
  path: '/occasions',
  covers: ['/occasions'],
  summary: 'Add festivals and celebrations with photos for everyone in the society to see.',
  steps: [
    'Open Occasions and tap Add occasion.',
    'Enter the name, the type, the date (and the last day if it ran for several days), the venue, who organised it and roughly how many people came.',
    'Write a few lines about it, and add up to 8 highlights, such as "Rangoli contest won by Block B".',
    'Tap Add photos and choose up to 24 pictures from your phone. Give a photo a caption if you like. The first photo is the cover. Tap the star on another photo to make it the cover.',
    'Leave Tell residents and staff about it ticked to send everyone a notification, then tap Publish.',
    'To change or remove an occasion, open it and tap Edit or Remove. Staff can change only the occasions they added; the society office can change all of them.'
  ],
  tips: ['Large phone photos are shrunk before they upload, so they send quickly on mobile data.', 'Photos of children are best shared only with the parents\' consent.']
};

const societyAddress = {
  id: 'society-address',
  title: 'Society address and map pin',
  path: '/guard-posts',
  covers: [],
  summary: 'Tell the app exactly where your apartment is.',
  steps: [
    'Open Guard posts. In Society location, type the full apartment address and tap Find on map.',
    'Check the pin. Tap the map or use Use my current location to move it, then Save location.',
    'The address is shown to everyone in Nearby places. The dashed circle on the maps is 1 km around the pin, and guards are checked against the inner circle you set.'
  ],
  tips: ['Pin the main gate for the most accurate guard tracking.']
};

const addPeople = {
  id: 'add-people',
  title: 'Adding people yourself',
  path: '/admin/residents',
  covers: [],
  summary: 'Create accounts for residents, guards, guard heads, staff and vendors.',
  steps: [
    'Open People and tap Add person. Choose the kind of person: resident, security guard, guard head, staff or service vendor.',
    'Fill in their name, email and mobile number. For a resident, also enter the flat number.',
    'Tap Create account. They are approved straight away and get an email with a link to choose their own password. You never need to know it.',
    'If the email cannot be sent, copy the setup link or share it on WhatsApp. The link works for 7 days.',
    'In All people, someone who has not signed in yet shows Not signed in yet. Tap Send link again to give them a fresh link.'
  ],
  tips: ['Only the platform admin can add a society admin.']
};

const addPeopleSuper = {
  id: 'add-people-platform',
  title: 'Adding admins, guard heads and staff to any society',
  path: '/admin/residents',
  covers: [],
  summary: 'Create accounts for any society from People.',
  steps: [
    'Open People and tap Add person. Choose the society, then the kind of person: society admin, guard head, staff, security guard, resident or service vendor.',
    'Fill in their name, email and mobile number, then tap Create account.',
    'They are approved straight away and get an email with a link to choose their own password. If the email cannot be sent, copy the link or share it on WhatsApp.',
    'When you add staff or a guard head, that society\'s admins are told.',
    'In All people, choose a society to see everyone there, including its admins. Deactivate a society admin there if they should no longer sign in.'
  ],
  tips: ['A society can have more than one admin.']
};

module.exports = { occasions, occasionsManage, addPeople, addPeopleSuper, nearby, societyAddress, swaps, availability, clockLocation, roster, attendance, live, posts, head, onDuty, rateResident, ratings, openLinks };
