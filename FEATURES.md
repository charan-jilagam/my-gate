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

## Tests

```bash
cd backend && npm test          # 251 tests: slot engine, lifecycle, permissions, privacy, community, SOS, daily help, accounts, amenity booking, seed data
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
- The tests mock the database, see "What that cannot prove" above.
