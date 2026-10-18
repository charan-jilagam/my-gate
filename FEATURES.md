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
