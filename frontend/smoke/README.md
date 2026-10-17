# Browser smoke tests

These open the built app in a real browser with the API faked (no database or backend needed), then check that every
page renders, nothing throws, nothing scrolls sideways on a phone, and the main flows send the right requests:
booking a service, booking an amenity, SOS, event RSVP, daily-help check-in, notification links, language switch, guide isolation per role, voting, upkeep, documents, shift roster and clock-in, and paying a bill online (Razorpay is stubbed).

```bash
cd frontend
npm run build && npx vite preview --port 4173 &
pip install playwright && playwright install chromium     # once
python3 smoke/smoke.py     # every page for resident, vendor, admin, guard, staff and super admin; prints PROBLEMS: none when clean
python3 smoke/flows.py     # interactive flows; prints OK for each and the requests that were sent
```

Set `SMOKE_URL` for another address, `SMOKE_OUT` for where screenshots go, `CHROMIUM_PATH` to use a specific browser.
They use fixtures defined at the top of `smoke.py`, so update those when an API response changes shape.

python3 smoke/i18n_audit.py te resident   # lists English text still shown in a language (people-entered data and brand names are expected)
npm run check:i18n                         # translation tables are consistent
