# What is new: home services, community and a better phone experience

## Home services marketplace

Residents book electricians, plumbers, carpenters, painters, AC and appliance repair, cleaning, pest control,
gardeners and locksmiths from vendors their own society lists.

**Resident**: `Services` shows vendors by trade with rating, price, and the *next free slot*. Open a vendor, pick a day and
a free slot, describe the problem (photos optional, "urgent" flag), and book. Track it under `My bookings`: a timeline,
call button, a 4-digit **start code** to read out when the vendor arrives, payment, and a review at the end.
You can change the time or cancel until the work starts.

**Vendor** (sign up with the `Vendor` role, the society office approves the account): `My jobs` shows today's jobs,
requests waiting for a reply (accept or decline), upcoming work and this month's earnings. `My schedule` sets services,
visit charge, weekly hours, slot length (30 to 180 min), a daily break, days off, minimum notice, how far ahead people can
book, auto-confirm, and a pause switch.

**Society office**: `Home services` lists vendors with Verify and Hide/Show, and all bookings.

Rules worth knowing:

- Slots come from the vendor's schedule minus bookings, the break, days off and the minimum notice, in the *society's* time zone
  (`Society.timezone`, default Asia/Kolkata), so a phone in another zone cannot shift a booking.
- Two residents cannot get the same slot: the database has a unique index on active bookings per vendor and start time, and the
  loser is told to pick another slot (HTTP 409).
- Phone numbers are shown only after the vendor confirms. The start code is shown to the resident only while a visit is confirmed or on its way, and
  the vendor gets five tries.
- Confirming a booking creates a gate pass for the vendor; cancelling or rescheduling withdraws or moves it.
- Life cycle: requested, confirmed, on the way, in progress, completed. Cancel any time before work starts. Declined by the vendor.

## Community and society features

| Feature | Who | What it does |
|---|---|---|
| **Community** (`/community`) | residents, office | Discussion, help needed, buy and sell (with price), lost and found, recommendations, meet-ups. Photos, likes, replies, "mark sold/found/solved", search. Office can pin and hide. Three reports hide a post and alert the office. |
| **SOS and emergency numbers** (`/emergency`) | residents raise it; guards and office respond | One tap sends the flat and phone to every guard and admin (push and text message). Guard taps "I am responding", then resolves. A repeat press within two minutes does not page everyone again. Office keeps a list of police, fire, ambulance, hospital and desk numbers with call buttons. |
| **Daily help** (`/daily-help`) | residents, guards, office | A maid, cook or driver gets a 6-digit gate code. The guard types it: first time of the day checks in, next checks out, and every household they work for is notified. Monthly attendance per helper. A helper who works in two flats is added to the second flat with their code. |
| **Event RSVP** (`/notices`) | residents | Going, maybe or can't come, with extra guests. Everyone sees how many people are coming, never who. |
| **Accounts** (`/accounts`) | office records, residents read | Maintenance collected, expenses by category, balance and unpaid dues for any month. Residents see totals and categories, not individual bills. |

## Amenity booking (reworked)

- Residents pick a day and tap free slots (up to the amenity's limit in a row). The **price is worked out on the server**.
- Each amenity has opening hours, slot length, max slots in a row, how far ahead it can be booked, an on/off switch and
  "needs office approval or confirms instantly" (`Society` admin screen).
- Overlaps are refused at booking, and again at approval. The earlier of two simultaneous requests keeps the slot.
- The `GET /api/bookings/availability` route used to validate the request *body* on a GET, so it never worked as intended;
  it now takes query parameters and returns every slot with why it is taken.

## Phone and everyday experience

- **Bottom tab bar** on phones with the four things each role uses most, a red **SOS** tab for residents, and *More*.
- Sidebar menu is **grouped** (gate, home and community, money and help).
- **Home screen quick actions** per role (pre-approve a visitor, book a service, pay dues, SOS...), "Your home services"
  strip, open emergency alerts for guards and admins.
- **Notification links work**: tapping a notification, or a push, opens the right page. Links to a single visitor, delivery,
  complaint and so on open that list instead of a "not found" page.
- Installable as an app (web manifest, icons, shortcuts for services, SOS and visitors).
- Fixed a data-loading bug where a screen could crash when it changed what it was loading (`useApi`).

## API summary (all under `/api`, JWT required)

| Area | Endpoints |
|---|---|
| Services catalogue and vendors | `GET /services/categories`, `GET/PUT /services/me`, `GET /services/providers`, `GET /services/providers/:id`, `.../slots?date=`, `.../availability?from=&days=`, `GET /services/admin/providers`, `PUT /services/providers/:id/verify`, `.../status` |
| Service bookings | `POST/GET /service-requests`, `GET /service-requests/:id`, `PUT .../:id/accept\|decline\|on-the-way\|start\|complete\|cancel\|reschedule\|payment\|review` |
| Community | `GET/POST /community/posts`, `GET/DELETE /community/posts/:id`, `POST .../like\|comments\|report`, `DELETE .../comments/:cid`, `PUT .../resolve\|pin\|visibility` |
| Emergency | `POST /emergency/sos`, `GET /emergency/alerts`, `PUT .../alerts/:id/acknowledge\|resolve`, `GET/POST /emergency/contacts`, `PUT/DELETE .../contacts/:id` |
| Daily help | `GET/POST /daily-help`, `POST /daily-help/link`, `POST /daily-help/check`, `DELETE /daily-help/:id`, `GET /daily-help/:id/attendance?month=` |
| Accounts | `GET /expenses/summary?month=`, `GET/POST /expenses`, `PUT/DELETE /expenses/:id` |
| Events | `POST /notices/:id/rsvp` |
| Amenities | `GET /bookings/amenities`, `GET /bookings/availability?amenity=&date=`, `POST /bookings` (`amenity`, `date`, `startTime`, `endTime`) |

## Round 3: documents, votes, upkeep, shift roster, online bill payment, languages and the in-app guide

**User guide (`Guide`, question-mark icon in the header)**: each role gets its own manual covering every menu screen. The server
sends the manual for the signed-in account's role only (`GET /api/manual`); there is no way to ask for another role's guide.
It has search, a topic list, a print / save-as-PDF button and "Open this screen" links. Text lives in `backend/content/manual/`;
a test fails if a menu screen has no section or a link points to a screen that does not exist.

| Feature | Residents | Office (society admin) | Guards and staff |
|---|---|---|---|
| **Documents** | read and download bye-laws, minutes, circulars, forms | upload PDF (10 MB, checked) or add a link, choose who can see it, edit, delete | read |
| **Votes** | vote once (per flat or per person); see the result after voting closes | create a vote or election with 2 to 12 options, edit before it opens, cancel; sees turnout only | n/a |
| **Upkeep** | see when tanks, lifts, fire gear etc. were last done and are next due | add recurring jobs, contractor, notes; record work done with cost | record that a job was done (no cost) |
| **Shift roster** | n/a | plan shifts for guards and staff (up to 31 days at once, overnight allowed), remove unstarted shifts | `My shifts`: see own shifts, clock in (from 30 min early) and out |
| **Pay service bills online** | pay a completed booking by Razorpay; amount is set by the server and the payment is signature-checked | sees payments as "online" | n/a |
| **Languages** | English, Hindi, Telugu from the header; the choice is remembered. Menus, headings, table headers, statuses, dates and the whole guide are translated on screen; names, notes and other text people typed stay as entered | same | same |

Rules worth knowing:

- Votes are secret: the database stores only a one-way hash that stops double voting, not who chose what. Results stay hidden until voting closes.
- Upkeep marked done twice for the same day is ignored (conditional update); dates in the future or older than 60 days are refused.
- A guard cannot be given two shifts that start together (unique index); removing a shift is refused once the person has clocked in.
- Online payment needs `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`; without them the Pay online button is not offered.
- Translations cover the menu, buttons and common labels. Text typed by users and the guide itself stay in English. Missing words fall back to English.

New endpoints: `/documents`, `/elections` (+ `/:id/vote`, `/:id/cancel`), `/facility` (+ `/:id/complete`), `/roster` (`/people`, `/mine`, `/clock-in`, `/clock-out`),
`/manual`, `POST /uploads/document`, `POST /service-requests/:id/pay-online` and `/pay-verify`.


## Tests

```bash
cd backend && npm test          # 390 tests: slot engine, lifecycle, permissions, privacy, community, SOS, daily help, accounts, amenity booking, documents, votes, upkeep, roster, payments, guide, seed data
cd frontend && npm run build    # compile check
cd frontend && python3 smoke/smoke.py && python3 smoke/flows.py   # browser smoke tests, see smoke/README.md
```

The backend tests run the real routes, validation, schemas and hooks against a mocked database (`mockingoose`).
**What that cannot prove**: the unique-index race protection, aggregation pipelines and populate behave against a real
MongoDB. Run through one booking per vendor slot (two browsers at once) and the seed script on a staging database
before going live.

## Upgrade notes

- Run `npm install` in `backend` (adds `supertest` and `mockingoose` as dev dependencies).
- New collections are created automatically. Indexes (including the unique slot index) are built on first start; on an
  existing production database with many documents, check index builds finish.
- Existing amenities keep working: new fields default to 06:00 to 22:00, 60-minute slots, approval required.
- Existing bookings have no `dateStr`; the app falls back to the stored date for them.
- Old clients that post `slotDate/startTime/endTime` as ISO timestamps to `POST /bookings` must switch to
  `date` (YYYY-MM-DD), `startTime` and `endTime` (HH:mm). The bundled frontend already does.
- Vendors sign up with role `Vendor` and wait for the office's approval like residents do.
- Text messages for SOS and urgent bookings use the existing SMS setup; without one they are skipped (push and in-app still work).

## Known limits

- Poll notices still send voter ids to residents (existing behaviour, used by the poll screen to show your own vote). Hide them before running anonymous polls.
- The tests mock the database, see "What that cannot prove" above. Also unproven without MongoDB: vote double-ballot and duplicate-shift unique indexes, and the vote tally aggregation.
- Votes count flats or people as entered by the office; there is no proof-of-ownership check.
- Payment checkout was tested against a stub, not the live Razorpay window.


## Nivora (app name) and translation notes

- The app is called **Nivora** ("Every Community. One Platform."). Technical identifiers were deliberately kept: database name `mygate`, seed emails `@mygate.com`, Cloudinary folder `mygate/`, repo URLs.
- Translation works by a runtime dictionary (`frontend/src/i18n/rows*.js`, rows of `[English, Hindi, Telugu]`) plus rules for dates, numbers and `{0}` templates. `npm run check:i18n` checks the tables; `python3 smoke/i18n_audit.py <lang> <role>` lists English still on screen.
- Known limits: the Hindi/Telugu wording should be reviewed by a native speaker; push/e-mail text built on the server stays English; user-entered data is not translated.


## Round 4: amenity list, who reacted, who voted, gate scan details, expected exit

| Feature | Who | What it does |
|---|---|---|
| **Amenity list per society** | Society office | Amenities, then "Our amenities": add a space (with quick-start names like Clubhouse or Gym), set hours, price, capacity, slot length, booking rules, close it for booking, edit or remove it. Residents only see their own society's open amenities, as cards they can tap to book. A space with upcoming bookings cannot be removed: close it instead. API: `POST/PUT/DELETE /api/bookings/amenities`, `GET /api/bookings/amenities?all=1` |
| **Who liked and who reported** | Society office | Opening a community post shows the people who liked it and who reported it, with each reason. Residents see counts only. Reporting now asks for a reason |
| **Who has voted** | Society office | Opening a vote shows turnout, the people (or flats) who voted, and those still to vote. It never shows what anyone chose: the turnout record is stored apart from the ballots, ballots have no timestamp and a random id, so the two cannot be matched. `GET /api/elections/:id/voters`. Votes cast before this release are counted but not named |
| **Gate scan details** | Guard, office | After scanning a pass or typing its code the guard sees the visitor, the flat and floor (worked out from the flat number, so the screen says so), the resident, and who approved the visit and when |
| **Expected exit** | Guard | Check in now asks how long the visitor will stay (30 minutes to 8 hours, or a time). The server refuses a check-in without it. The resident is told when to expect them out; the gate console and visitor list flag anyone still inside past that time |
| **Gate pass** | Resident | The pass is a ticket with the flat, floor, arrival time, QR and pass code, with Copy code and Share |
| **Look and feel** | Everyone | Softer cards, sheet-style dialogs, a redesigned guide (search in the header, step timeline, previous and next topic), narrower and calmer post page, readable dropdown lists in dark theme |

Notes: the Hindi and Telugu wording for these screens was written by the assistant and should be reviewed by a native speaker. Floors are a guess from the flat number (210 is floor 2); a society that numbers flats differently would need a floor field on the user.

## Round 5: code-only gate entry, daily help passes, account verification

| Feature | Who | What it does |
|---|---|---|
| **No check-in on a click** | Guard | An invited visitor is let in only when the guard scans their QR code or types their 8-character pass code. The server checks the code on `PUT /api/visitors/:id/check-in` and refuses without it (403). The Visitors list no longer has a Check in button for invited guests; it sends the guard to the Gate console |
| **Check-out needs the code too** | Guard | Leaving needs the same QR or pass code (`PUT /api/visitors/:id/check-out`). The one exception is a **walk-in**: someone the guard logged at the gate and the resident approved. The guard checks those in and out by hand, because they have no pass |
| **Resident approves walk-ins** | Resident | Only the resident being visited can approve a walk-in. Guards and the office can no longer approve on their behalf. Nobody is let in before that |
| **Codes stay with the resident** | Everyone | The pass code is returned only to the resident who owns the invitation. Guards and admins never receive it in any list or lookup, so they cannot check someone in without the visitor. Wrong codes are rate limited (30 per 15 minutes) |
| **One pass, one visit** | Guard | A pass that was already used is refused, and an invitation stops working after its validity window (see Round 6) |
| **Daily help in Visitors** | Resident, guard | Visitors has a Daily help tab. Residents see each helper's status today and tap **Show pass** for a QR code and 6-digit code (`GET /api/daily-help/:id/pass`). Guards get the same gate panel as on the Gate console and Daily help page |
| **Daily help check-in and check-out** | Guard | The guard scans the helper's QR or types the code, sees who it is and whether they are inside (`GET /api/daily-help/lookup/:code`), then taps Check in or Check out. The server now accepts `action` (`in` or `out`) and refuses a mismatch ("already inside", "not inside") instead of silently doing the opposite. The Inside now list has Check out, which asks for the helper's code. The society office can no longer read helper codes |
| **Email and mobile verification** | Everyone who signs up | Sign-up no longer signs the person in. A 6-digit code goes to their email and, when text messages are set up, to their mobile number. They enter them on the Verify your account screen, then sign in automatically. Signing in with an unverified account sends fresh codes and opens the same screen. Codes work for 10 minutes, five wrong tries lock a code, a new one can be requested every 30 seconds, and only a keyed hash of the code is stored. Changing your mobile number in Profile asks for a new code. Accounts made before this release keep working |
| **Free OTP, no Twilio** | Operator | Email codes go through any SMTP server (a Gmail app password is free). Text codes go through `SMS_PROVIDER`: `console` (prints the code in the backend terminal, free, for development), `2factor` or `fast2sms` (Indian OTP gateways, need their own API key), or `twilio`. See `backend/.env.example` |
| **No more blank screens** | Everyone | A screen that fails while drawing now shows "This screen hit a problem" with Try again, and the menu still works. A society time zone that is missing or wrong no longer breaks the booking page. Browser auto-translate is switched off for the app, because it rewrites the page under React |

### Setting up the codes

1. **Email (free).** Turn on 2-step verification on a Gmail account, create an App password, then set `EMAIL_USER` and `EMAIL_PASS` in `backend/.env`. Leave them empty while developing and the code is printed in the backend terminal.
2. **Mobile.** Leave `SMS_PROVIDER=console` while developing: the code is printed in the backend terminal. For real delivery set `SMS_PROVIDER=2factor` with `TWOFACTOR_API_KEY`, or `fast2sms` with `FAST2SMS_API_KEY`. Check each service for its current free credits and prices; none of them promises unlimited free texts.
3. Email is always required. The **mobile code is optional**: sign-up and sign-in only ask for the email code, and a person can verify their number later from Profile. Set `OTP_REQUIRE_PHONE=true` to make the mobile code compulsory once your SMS provider works.

Notes: nobody who signed up before this release is asked to verify. The Hindi and Telugu wording for the new screens was written by the assistant and should be reviewed by a native speaker. Visitor records made before this release count as invited visitors (they need the code).


## Round 6: invitation validity and daily help codes that change every day

| Feature | Who | What it does |
|---|---|---|
| **Resident sets how long an invitation lasts** | Resident | The invite form has **Invitation valid for** (6 hours, 12 hours, 24 hours, 48 hours, 3 days, 7 days). It is **24 hours** unless the resident picks something else. The window starts at the expected arrival time (or at creation when no time was given). Stored as `validForHours` (1 to 720) on the visitor; sent to `POST /api/visitors/invite` and `PUT /api/visitors/:id`, which refuse anything outside the range. Check-in is refused with "This invitation has expired" once the window is over |
| **See the expiry** | Resident, guard | The gate pass shows **Valid until**, visitor cards show the expiry, and an unused invitation past its window is tagged **Expired**. Visitor responses carry `validForHours`, `expiresAt` and `expired`. A resident can extend an expired invitation by editing it |
| **Daily help code changes every day** | Resident, guard | Every helper gets a new random 6-digit code for each day in the society's time zone (`codeDate` on the helper records which day it belongs to). Anything that reads or checks a code first renews the codes that are out of date, so no scheduled job is needed and yesterday's code stops working at midnight. The resident sees today's code in the list and in **Show pass**; the QR code carries the day too (`GET /api/daily-help/:id/pass` returns `validOn`) |
| **Gate and linking use today's code** | Guard, resident | Lookup, check in/out and **Add by code** all work with today's code only; an old code gets "This code is not valid today". Guards and the office still never see codes. The renewed code is unique within the society (a clash draws again), and two requests at midnight cannot renew the same helper twice |

Notes: helpers made before this release get their first new code the next time anyone opens or checks them. A helper who checked in the evening can check out after midnight using the new code. The Hindi and Telugu wording was written by the assistant and should be reviewed by a native speaker.


## Round 7: pass links for guests and alerts for what needs action

| Feature | Who | What it does |
|---|---|---|
| **Entry pass sent to the guest** | Guest, resident | When a resident saves an invitation the guest gets a message "Nivora: You have an entry pass for <society> (<flat>) from <host>. Pass code ... Open your pass: <link>" by text message, and by email (with the QR code attached and an Open your pass button) when the resident entered the guest's email. The invite form has a new optional **Guest's email** field, and the resident is told what was sent. A slow or failing provider never blocks the invitation (`utils/passLink.js`) |
| **Pass page for the guest** | Guest | The link opens `/pass/:passId`, a page that needs no sign-in: QR code, pass code, society, flat, floor, people, arrival and validity. A used, cancelled or expired pass shows why instead of the QR code. The link is a 32-character secret, rate limited, and the page never shows the guest's phone number (`GET /api/public/pass/:passId`) |
| **Service booked** | Resident, vendor | The vendor gets an in-app alert, a text and an email for every new booking or request. The resident gets a receipt by email (and a text when the vendor confirms). Vendor declined, cancelled by either side, moved (a text when the vendor has to confirm again), completed and payment received all reach the other side by email, with a text where someone must act |
| **Amenities** | Resident, office | A booking that needs the office's decision texts and emails the office. The resident gets a receipt by email, and the decision (approved, not approved, cancelled by the office) by email, with a text when it was refused or cancelled |
| **Payments** | Resident | New dues arrive by text and email; a successful or recorded payment sends a receipt by email |
| **Choose what you get** | Everyone | Profile has a new **Email** switch beside Text messages and Push (`PUT /api/push/prefs` accepts `email`). Only events that need action or are a record of money or access are sent outside the app; everything else stays in the bell. The text switch now works with Fast2SMS as well as Twilio |

Setup: email uses the same `EMAIL_*` settings as the verification codes. Text messages for pass links and alerts need `SMS_PROVIDER=fast2sms` with `FAST2SMS_API_KEY` (or Twilio); with neither they are printed in the backend terminal while developing. Set `FRONTEND_URL` to the address guests can open, because it is the start of the pass link: `localhost` links only open on your own computer.


### Free texts with TextBee (Round 8)

`SMS_PROVIDER=textbee` sends every text (sign-up codes, guest pass links, alerts) from **your own Android phone** through the free TextBee app, so no gateway account or Twilio is needed.

1. Install the TextBee app on an Android phone that has a SIM and mobile data or Wi-Fi.
2. On https://textbee.dev choose **Add device** and scan the code with the app. Keep the app running with its battery restrictions off, because the phone is the one that sends the message.
3. Create an API key on the dashboard and put it in `backend/.env`:
   ```
   SMS_PROVIDER=textbee
   TEXTBEE_API_KEY=your_key
   # optional: TEXTBEE_DEVICE_ID=the_device_id   (otherwise TextBee picks one of your enabled devices)
   ```
4. Restart the backend and sign up with a mobile number. The code arrives as a text from your phone's SIM.

Numbers without a country code get `+91`; change it with `SMS_DEFAULT_COUNTRY_CODE`. The free plan has daily and monthly limits that are shown on the TextBee dashboard, and each text uses your SIM's own SMS allowance. If the phone is off or offline the text is not sent, and the person can ask for a new code.

## Guards, shifts and ratings (added)

- **Guard head role** (`guard_admin`): head of all guards. Admins make a guard the head under People. Plans the roster, sees attendance, tracks guards, and gets shift-swap and attendance notifications along with the admin and other guards (never residents).
- **Guard posts and society location** (`/guard-posts`): the admin sets the society pin and the places where guards are needed, with time slots and the number of guards for each.
- **Automatic roster** (`/roster` → Plan automatically): preview, then create shifts from each guard's availability, with fair hours and rest between shifts.
- **Availability** (`/my-shifts` → When I can work): days, hours and days off per guard.
- **Shift swaps** (`/swaps`): guard 1 asks, guard 2 accepts or declines; both rosters change on accept. Admin, guard head and other guards are notified.
- **Attendance** (`/attendance`, `/my-shifts`): on time, late, missed, hours worked, and clock-in distance from the post.
- **Guard tracking** (`/live`): map of guards who are clocked in, last seen, distance from post. Location is recorded only while clocked in and only while the app is open on the guard's phone; points are deleted after 14 days.
- **Who is on duty / dynamic emergency number**: residents see the guard on duty; the Security desk number follows the guard on duty.
- **Personal emergency contacts** (Profile): up to 5 people, texted on SOS and callable from the Emergency screen.
- **Ratings both ways**: residents rate vendors; vendors rate residents. Vendors get Top rated / Recommended badges, "Recommended" sort, and "You booked before".
- **Notification links**: every notification opens the right screen and flashes the item; notices open at `/notices/:id`.
- **Profile**: Sign out, and Change password is hidden until opened.

## Branding, approvals and nearby places (added)

- **Logo and look**: the Nivora logo is the app icon, favicon, sign-in logo and header logo. Sign-in is a two-panel page on desktop and a gradient header with an overlapping card on phones. Loaders are a branded full-page loader, a round spinner, shimmer skeletons, and the menu stays in place while a page loads.
- **Approval email**: the person gets an email the moment they are approved (and a polite one if rejected, with the reason), plus an in-app notice and SMS. A failed email never undoes the approval.
- **Staff can approve residents** (`/admin/residents`): staff see only waiting residents of their own society and can approve them (not reject, and not guards, staff or vendors). New resident sign-ups notify admins and staff; when staff approve, the admins are told who did it.
- **Society address and 1 km circle** (`/guard-posts` → Society location): the admin types the apartment address, taps Find on map, and adjusts the pin. A dashed 1 km circle is drawn around it on the admin and guard tracking maps.
- **Nearby places** (`/nearby`, every role except vendors): supermarkets, hospitals, medical shops, petrol bunks, temples, churches, mosques, gurudwaras, banks and ATMs, food, schools, police and fire, transport, parks and EV charging. Nearest first, 1, 2 or 5 km, from the society or from where the person is, with Walk or Drive directions that open in the phone's maps app and a Call button when a number exists. Place data comes from OpenStreetMap in the browser (no map key needed).

## Amenity payments, staff booking approvals, faster screens, reliable nearby search (added)

- **Pay for an approved amenity booking**: when the admin or staff approves a booking that has a price (or the amenity confirms instantly), the amount is added to the resident's Payments as an "amenity booking" due, and they get a high-priority notification, text and email to pay. The notification opens Payments on that bill. The Amenities screen has a Payment column with Pay, Paid, Refunded or Waiting for payment. A rejected or cancelled booking removes an unpaid bill, and marks a paid one Refunded for the office to return.
- **Staff and amenity bookings**: staff see Amenities, are told about new requests with the admin, and can approve or reject. The admin is told when staff approve.
- **No loader flash between screens**: the last answer for each screen is shown at once and refreshed quietly; every screen's code is loaded ahead of time when the phone is idle; page changes use a short fade; a loader only appears if something is genuinely slow (after about a third of a second). The cache is emptied on sign out.
- **Nearby places search is done by our server** (`GET /api/nearby/places`): it tries four free OpenStreetMap servers, then the OSM address search, and remembers answers for six hours. The browser falls back to the public server only if ours is unreachable. No API key is needed for any of it.

## Adding people from the People screen (added)

- **Add person** (`/admin/residents`): the society admin creates a resident, security guard, guard head, staff member or service vendor in their own society. The platform admin picks the society and can also create society admins. Staff cannot add people.
- **No passwords handed around**: the person is approved straight away and gets an email with a link to choose their own password (valid 7 days). If the email cannot be sent, the screen shows the link to copy or share on WhatsApp. **Send link again** appears for people who have not signed in yet.
- When the platform admin adds staff or a guard head, that society's admins are notified.
- The All people list now includes society admins, shows "Not signed in yet", and the platform admin can deactivate a society admin. Guard heads can be deactivated like anyone else.

## Reliability, visitor pass times and daily help QR (latest)

- **Society list on sign-up**: retries up to four times, remembers the last list, refreshes when the tab or network comes back, and shows a "Try again" link instead of an empty box. The public list is never cached and includes societies created before `isActive` existed.
- **Automatic refresh**: any successful save, approve or delete (a POST, PUT, PATCH or DELETE call) makes every open list reload by itself. Screens also reload when the tab is opened again after 20 seconds. Background calls (guard location pings, push settings, sign-in) are excluded.
- **Forms are not lost**: a dialog that has input fields no longer closes when the dimmed area outside is tapped, and Escape is ignored once something was typed. The Cancel button and the X still close it. Confirmation dialogs (no fields) still close on an outside tap.
- **Visitor pass times**: the resident sets *Expected to leave by* when inviting. The QR works until that time (a visit of up to 30 days), and the guard no longer types an exit time at the gate; the guard can still change it (a stay chosen at the gate is limited to 24 hours). Without a leaving time the pass works for 24 hours after the expected arrival, as before. One rule (`utils/visitorPass.js`) is used by the gate and the guest's pass page.
- **Daily help QR**: a new code and QR are made for every helper each day. The QR is mailed every morning (05:00 society time, `DAILY_CODE_MAIL_HOUR`) to the helper's email, or to the households when none was given. If a helper says yesterday's code, the guard still finds them, can check them in, and is shown today's code to tell them (codes up to 2 days old identify, never open the gate by themselves).
- **Daily help attendance**: every visit shows how long the helper stayed inside (and "so far" while inside), the month shows days present and total time, and it downloads as CSV or PDF. A visit never closed at the gate counts as unknown, not as days.
- **Look**: the sign-in panel uses one teal gradient without floating circles; dashboard tiles and the attention list line up on phones.

## Occasions, private ratings, footer, scrollbars (Oct 20)

- **Occasions** (`/occasions`): the society office and staff add festivals, celebrations, matches and get-togethers with date(s), venue, organiser, attendance, a description, up to 8 highlights and up to 24 photos (first photo is the cover). Everyone in the society can browse them (featured latest, filters by type and year, full-screen photo viewer). Staff can edit only their own; the office can edit all. Optional notification to residents and staff.
- **Private vendor ratings**: a vendor's rating and comment about a resident are never shown to that resident (job page, notifications, API). Vendors still see the resident's average.
- **Footer**: "© year Nivora. All rights reserved. Developed with ♥ by Nivero-Dev Team" on every screen, including sign-in and guest pass pages.
- **Scrollbars**: hidden everywhere; scrolling by touch, wheel and keyboard still works.

## City updates: weather, alerts, gold, news and nearby help

Free public data for the society's area, shown on the home screen and on `/weather`, `/more` and `/news`. No API keys and no cost.

| What | Source | Notes |
|---|---|---|
| Weather, hourly and 7-day | Open-Meteo | Free tier is for non-commercial use. Take their commercial plan or swap `backend/utils/insights/weather.js` before selling Nivora as a paid service. |
| Official warnings | NDMA SACHET CAP feeds | State feed first, then the national feed filtered by city/state. |
| Forecast advisories | Worked out from the forecast | Heavy rain (IMD 64.5 mm), thunderstorm, strong wind, heat. |
| Earthquakes | USGS | Within 500 km, last 3 days, magnitude 3.5+. |
| Gold per gram (24K/22K, INR) | Gold-API.com + open.er-api.com (Frankfurter backup) | International spot converted to rupees. Labelled "indicative"; Indian shop rates differ. Check Gold-API's current terms. |
| Local news | Google News RSS (GDELT backup) | Headline, publisher and link only. Hindi and Telugu follow the app language. |
| Police, hospitals | OpenStreetMap (existing nearby helper) + national helplines | |

Everything is cached on the server (`backend/utils/insights/cache.js`) and shared by all residents of the same area. If a source is down, the last good answer is shown, marked stale. API: `GET /api/insights/{overview,weather,alerts,gold,news,emergency}`. Tests: `backend/tests/insights.test.js`.

The society needs a map pin or a city name (Society admin > location) so the area can be found.

### Live location
Weather, alerts, news and nearby emergency help can use the person's own position instead of the society's. The app asks only when the person taps **Use my live location** (or the browser already allows it) and sends `?lat=&lng=` to `/api/insights/*`. The town name comes from OpenStreetMap Nominatim (free, cached per ~1 km cell, falls back to the society's town). The position is never stored. Code: `frontend/src/contexts/LocationContext.jsx`, `backend/utils/insights/place.js` (`placeFromCoords`).

## Family accounts and permanent entry passes

- **Family** (`/household`, residents): the head of the house adds family members with name, relation, phone, photo and (optionally) an email. With an email the person gets a setup link and their own login; without one they are "pass only". Members share the flat, can be switched off and on, and the head can send the sign-in link again. Up to 10 members.
- **Entry passes** (`/my-pass`): every resident (including the head), guard, guard head, staff and society admin has one permanent QR pass plus a typed code (`NV-xxxx-xxxx-xxxx-xxxx`). It can be saved as a picture. **Make a new pass** replaces the code and the old QR stops working at once. Heads can do this for family; the society admin for anyone (People > Entry pass); a guard head for guards.
- **At the gate** (Gate console > Family & staff): scan the QR or type the code to see photo, name, relation, flat, phone and who is in or out, then record the movement.
- **Going out / coming in is for family only.** Family members are presumed at home, so their first scan is "going out", then "coming in", and the head is notified. Guards, staff and admins are presumed outside: "entry" then "exit", no family notification. Visitors, deliveries and daily help keep their existing flows.
- **Flat log** (`/household` > Entry and exit log, head only): family movements, visitors and daily help for the flat, 1 to 30 days.
- Family accounts are not billed separately (maintenance bills go to heads), and walk-in visitor approvals go to the head.

API: `/api/household`, `/api/passes` (`me`, `user/:id`, `user/:id/regenerate`, `lookup`, `check`, `recent`). Tests: `passes.test.js`, `household.test.js`.

## Walking challenge

`/steps`: a daily goal (8,000 steps), a 7-day chart, a streak and a society leaderboard (today / this week; people can hide their name). Steps are counted from the phone's motion sensor **only while Nivora is open** (a web app cannot count in the background; iPhones ask for motion permission). Totals are saved to `POST /api/steps` and only ever go up. Code: `frontend/src/utils/stepCounter.js`, `backend/routes/steps.js`.

### Plan for counting steps when Nivora is closed
Build a small Android companion app (or wrap the PWA and add a native module). It would use Android's step counter sensor or Health Connect, sign in with the same Nivora login (`POST /api/auth/login`), and send the day's total with a daily background job to the API that already exists: `POST /api/steps { "steps": 7421, "date": "2026-10-28", "source": "android" }`. The server accepts today and the last two days, and keeps the highest value, so web and Android counts never conflict. No backend change is needed for it.
