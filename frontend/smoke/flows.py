import os
import json, re, warnings
warnings.filterwarnings('ignore')
import smoke
from playwright.sync_api import sync_playwright

posts = []
RAZORPAY_STUB = "window.Razorpay = function (o) { this.on = function () {}; this.open = function () { o.handler({ razorpay_order_id: o.order_id, razorpay_payment_id: 'pay_1', razorpay_signature: 'sig_1' }) } }; "

def go(role, fn, init=None):
    errs = []
    with sync_playwright() as pw:
        br = pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or None, args=['--no-sandbox'])
        ctx = br.new_context(viewport=dict(width=390, height=800), service_workers='block')
        ctx.add_init_script("localStorage.setItem('token','t')")
        if init: ctx.add_init_script(init)
        def handler(route):
            req = route.request
            m = re.search(r'/api(/[^?]*)(?:\?(.*))?', req.url)
            q = dict(x.split('=', 1) for x in (m.group(2) or '').split('&') if '=' in x)
            if req.method != 'GET': posts.append((req.method, m.group(1), json.loads(req.post_data or '{}')))
            body = smoke.api(role, req.method, m.group(1), q)
            if req.method == 'POST' and m.group(1) == '/service-requests': body = dict(success=True, message='Booked', request=smoke.REQ)
            if req.method == 'POST' and m.group(1) == '/auth/login':
                ok = any(p == '/auth/otp/verify' for _, p, _ in posts)
                body = dict(success=True, token='t', user=dict(id='u1', name='Asha Rao', role='resident')) if ok else dict(success=False, needsVerification=True, email='asha@example.com', channels=['email', 'phone'], hints=dict(email='a***@example.com', phone='******3210'), delivery=dict(sent=dict(email='console', phone='console'), errors={}), message='Please verify your email to continue. We sent you a code.')
                route.fulfill(status=200 if ok else 403, content_type='application/json', body=json.dumps(body)); return
            if req.method == 'POST' and m.group(1) == '/auth/otp/verify': body = dict(success=True, pending=[], done=True, message='Verified. You can sign in now.')
            if req.method == 'POST' and m.group(1) == '/daily-help/check': body = dict(success=True, action='in', time='2026-10-19T04:00:00Z', helper=dict(_id='h1', name='Lakshmi', kind='maid', flats=['A-101']))
            if req.method == 'GET' and m.group(1).startswith('/public/pass/'): body = dict({'pass': dict(name='Ravi Teja', host='Asha', society='Green Meadows', flat='A-210', floor='2', purpose='personal', numberOfVisitors=2, expectedArrival='2026-10-20T10:00:00Z', expiresAt='2026-10-21T10:00:00Z', status='approved', usable=True, expired=False, qr='{"visitorId":"abcdef1234567890abcdef1234567890"}', code='ABCDEF12')}, success=True)
            if req.method == 'POST' and m.group(1) == '/visitors/invite': body = dict(success=True, visitor=dict(_id='v9', name='Guest', phone='9812345678', status='approved', qrCode='{"visitorId":"abcdef1234567890abcdef1234567890"}', delivery=dict(sms=True, email=True), passLink='http://x/pass/abcdef1234567890abcdef1234567890'))
            if req.method == 'POST' and m.group(1) == '/emergency/sos': body = dict(success=True, message='Alert sent to the gate and the society office.', alert={}, notified=2)
            if req.method == 'POST' and m.group(1) == '/service-requests/r9/pay-online': body = dict(success=True, order=dict(id='order_1', amount=45000, currency='INR'), keyId='rzp_test')
            route.fulfill(status=200, content_type='application/json', body=json.dumps(body))
        ctx.route('**/api/**', handler); ctx.route('**/socket.io/**', lambda r: r.abort())
        page = ctx.new_page()
        page.on('pageerror', lambda e: errs.append(str(e)))
        fn(page)
        br.close()
    return errs

def book_service(page):
    page.goto(smoke.BASE + '/services/providers/p1'); page.wait_for_selector('text=Choose a time')
    page.wait_for_selector('[aria-label="Choose a day"] button')
    page.locator('[aria-label="Choose a day"] button:not([disabled])').nth(1).click()
    page.wait_for_selector('button:has-text("9:00 AM")')
    page.locator('button:has-text("10:00 AM")').first.click()
    page.fill('#bk-title', 'Leaking kitchen tap')
    page.get_by_text('This is urgent').click()
    page.locator('button:has-text("Send request")').click()
    page.wait_for_url('**/services/requests/r1')

def amenity(page):
    page.goto(smoke.BASE + '/bookings'); page.wait_for_selector('text=Book amenity')
    page.click('button:has-text("Book amenity")')
    page.select_option('#b-amenity', 'Clubhouse')
    page.wait_for_selector('[role=option]')
    page.locator('[role=option]').nth(2).click()
    page.wait_for_selector('button:has-text("7:00 PM")')
    page.locator('button:has-text("7:00 PM")').click()
    page.locator('button:has-text("8:00 PM")').click()
    summary = page.locator('[role=status]').inner_text()
    assert '₹1,000' in summary.replace(',', ',') or '1,000' in summary, summary
    page.locator('button:has-text("6:00 PM")').is_disabled() or (_ for _ in ()).throw(AssertionError('booked slot should be disabled'))
    page.click('button:has-text("Request booking")')
    page.wait_for_timeout(600)
    page.wait_for_selector('text=Lakshmi', state='detached') if False else None

def sos(page):
    page.goto(smoke.BASE + '/emergency'); page.wait_for_selector('[aria-label="Send an SOS alert"]')
    page.click('[aria-label="Send an SOS alert"]')
    page.get_by_text('Security threat').click()
    page.fill('#sos-note', 'Stranger at door')
    page.click('button:has-text("Send alert now")')
    page.wait_for_selector('text=Alert sent')

def rsvp(page):
    page.goto(smoke.BASE + '/notices'); page.wait_for_selector('text=Diwali night')
    page.select_option('select[aria-label="Extra guests"]', '2')
    page.click('button:has-text("Going")')
    page.wait_for_timeout(500)

def notif(page):
    page.goto(smoke.BASE + '/dashboard'); page.wait_for_selector('main')
    page.click('[aria-label^="Notifications"]')
    page.click('text=Raj is at the gate')
    page.wait_for_url('**/visitors?highlight=abc123')   # the list opens and the item is flashed

def gate_check(page):
    page.goto(smoke.BASE + '/daily-help'); page.wait_for_selector('[aria-label="Helper code"]')
    page.fill('[aria-label="Helper code"]', '482913'); page.click('button:has-text("Find")'); page.wait_for_selector('text=Not inside right now')
    page.locator('main button:has-text("Check in")').click(); page.wait_for_timeout(500)
    sent = [b for m, p, b in posts if m == 'POST' and p == '/daily-help/check']
    assert sent and sent[-1] == dict(code='482913', action='in'), sent


def language(page):
    page.goto(smoke.BASE + '/dashboard'); page.wait_for_selector('main')
    bar = lambda text: page.locator('nav:has(a[href="/visitors"])').last.get_by_text(text, exact=True).wait_for(state='visible')   # the nav's own label is translated too, so find it by its link
    page.locator('header select').select_option('hi')
    bar('आगंतुक')            # Visitors, in the quick-navigation bar
    body = page.inner_text('body')
    for want in ['होम', 'सेवाएँ', 'आपके ध्यान के लिए']:
        assert want in body, f'missing {want}'
    assert page.evaluate('document.documentElement.lang') == 'hi'
    page.reload(); bar('आगंतुक')        # remembered after a reload
    page.locator('header select').select_option('te')
    bar('సందర్శకులు')
    page.locator('header select').select_option('en')
    bar('Visitors')

def help_isolation(page):
    page.goto(smoke.BASE + '/help'); page.wait_for_selector('text=Resident guide')
    body = page.inner_text('body')
    for forbidden in ['Create dues', 'Add admin', 'Duty roster', 'Approve or Reject']:
        assert forbidden not in body, f'resident guide leaked: {forbidden}'
    page.fill('input[type=search]', 'start code')
    page.wait_for_selector('select[aria-label="Topic"] option:has-text("Home services")', state='attached')
    page.select_option('select[aria-label="Topic"]', label='Home services')
    page.wait_for_selector('text=read out the 4-digit start code')
    page.fill('input[type=search]', 'zzzzqqq'); page.wait_for_selector('text=Nothing matches')

def help_admin(page):
    page.goto(smoke.BASE + '/help'); page.wait_for_selector('text=Society admin guide')
    page.select_option('select[aria-label="Topic"]', label='Payments and dues')
    page.wait_for_selector('text=Create dues')
    assert page.locator('a:visible:has-text("Open this screen")').get_attribute('href') == '/payments'

def vote(page):
    page.goto(smoke.BASE + '/votes'); page.wait_for_selector('text=Install solar panels?')
    page.click('text=Install solar panels?')
    page.wait_for_selector('text=Cost 4 lakh')
    assert page.locator('button:has-text("Cast my vote")').is_disabled()
    page.get_by_text('Yes').first.click()
    page.click('button:has-text("Cast my vote")'); page.wait_for_timeout(500)

def mark_done(page):
    page.goto(smoke.BASE + '/upkeep'); page.wait_for_selector('text=Clean overhead water tanks')
    assert page.locator('#u-cost').count() == 0
    page.locator('button:has-text("Mark done")').first.click()
    page.wait_for_selector('#u-date')
    assert page.locator('#u-cost').count() == 0, 'staff must not see the cost field'
    page.fill('#u-note', 'Cleaned and disinfected')
    page.click('button[form="done-form"]'); page.wait_for_timeout(500)

def add_shift(page):
    page.goto(smoke.BASE + '/roster'); page.wait_for_selector('text=Gate Guard')
    page.click('button:has-text("Add shifts")'); page.wait_for_selector('#s-who')
    assert page.locator('button[form="shift-form"]').is_disabled()
    page.locator('#shift-form label:has(input[type=checkbox])').nth(1).click()
    page.fill('#s-start', '22:00'); page.fill('#s-end', '06:00')
    page.select_option('#s-post', 'patrol')
    page.click('button[form="shift-form"]'); page.wait_for_timeout(500)

def new_vote(page):
    page.goto(smoke.BASE + '/votes'); page.wait_for_selector('text=New vote')
    page.click('button:has-text("New vote")'); page.wait_for_selector('#v-title')
    page.fill('#v-title', 'Paint the clubhouse?')
    page.click('button:has-text("Add option")')
    page.fill('input[aria-label="Option 3"]', 'Later')
    page.click('button[form="vote-form"]'); page.wait_for_timeout(500)

def add_document(page):
    page.goto(smoke.BASE + '/documents'); page.wait_for_selector('text=Add document')
    page.click('button:has-text("Add document")'); page.wait_for_selector('#d-title')
    page.click('button:has-text("Paste a link")')
    page.fill('#d-title', 'Fire safety plan')
    page.fill('input[aria-label="Link"]', 'https://example.com/fire.pdf')
    page.get_by_text('Tell residents about this document').click()
    page.click('button[form="doc-form"]'); page.wait_for_timeout(500)

def pay_online(page):
    page.goto(smoke.BASE + '/services/requests/r9'); page.wait_for_selector('text=Pay online')
    page.click('button:has-text("Pay online")'); page.wait_for_timeout(800)

def super_roster(page):
    page.goto(smoke.BASE + '/roster'); page.wait_for_selector('#scope-society')
    assert page.locator('#scope-society').input_value() == 's1'
    page.click('button:has-text("Add shifts")'); page.wait_for_selector('#s-who')
    page.locator('#shift-form label:has(input[type=checkbox])').first.click()
    page.click('button[form="shift-form"]'); page.wait_for_timeout(500)

def clock_in(page):
    page.goto(smoke.BASE + '/my-shifts'); page.wait_for_selector('button:has-text("Clock in")')
    page.click('button:has-text("Clock in")'); page.wait_for_timeout(500)

def translate_data(page):
    # statuses, purposes, column headings and dates are translated too, names stay as typed, and English comes back
    page.goto(smoke.BASE + '/visitors'); page.wait_for_selector('text=siri', state='attached')
    page.locator('header select').select_option('te')
    for want in ['వ్యక్తిగతం', 'చెక్-అవుట్ అయ్యారు', 'ఉద్దేశ్యం', 'అక్టోబర్']:
        page.wait_for_selector(f'text={want}', state='attached')
    assert page.locator('text=siri').count() >= 1                  # a name is data, not translated
    page.locator('header select').select_option('en')
    for want in ['Personal', 'Checked Out', 'Purpose', 'Oct']:
        page.wait_for_selector(f'text={want}', state='attached')
    assert 'వ్యక్తిగతం' not in page.inner_text('body')

def guide_in_telugu(page):
    page.goto(smoke.BASE + '/help'); page.wait_for_selector('main')
    page.locator('header select').select_option('te')
    page.wait_for_selector('text=నివాసి గైడ్', state='attached')          # the guide itself is translated
    before = page.locator('main li button').count()
    page.fill('input[type=search], input[placeholder]', 'చెల్లింపు')       # and can be searched in Telugu
    page.wait_for_timeout(600)
    body = page.inner_text('body')
    assert 'డౌన్‌లోడ్' in body or 'చెల్లింపు' in body
    assert page.locator('main li button').count() < before, 'search should narrow the topic list'

def admin_amenities(page):
    page.goto(smoke.BASE + '/bookings'); page.wait_for_selector('text=Our amenities')
    page.click('[role=tab]:has-text("Our amenities")'); page.wait_for_selector('h3:has-text("Clubhouse")')
    page.click('button:has-text("Add amenity")'); page.wait_for_selector('#am-name')
    page.click('button:has-text("Gym")')
    assert page.input_value('#am-name') == 'Gym'
    page.click('button[form="amenity-form"]'); page.wait_for_timeout(600)
    sent = [b for m, p, b in posts if m == 'POST' and p == '/bookings/amenities']
    assert sent and sent[-1]['name'] == 'Gym' and sent[-1]['capacity'] == 15, sent

def post_activity(page):
    page.goto(smoke.BASE + '/community/po1'); page.wait_for_selector('text=Who reacted')
    page.click('[role=tab]:has-text("Liked by")'); page.wait_for_selector('text=Kabir Mehta')
    page.click('[role=tab]:has-text("Reports")'); page.wait_for_selector('text=Spam: selling twice')

def voter_list(page):
    page.goto(smoke.BASE + '/votes'); page.wait_for_selector('text=Install solar panels?')
    page.click('text=Install solar panels?'); page.wait_for_selector('text=turnout')
    page.wait_for_selector('text=Asha Rao')
    page.click('[role=tab]:has-text("Yet to vote")'); page.wait_for_selector('text=Bina Shah')
    page.wait_for_selector('text=What each person chose stays secret')

def gate_scan(page):
    page.goto(smoke.BASE + '/gate'); page.wait_for_selector('#pass')
    page.fill('#pass', 'ABCDEF12'); page.click('button:has-text("Find")')
    page.wait_for_selector('text=Approved by'); body = page.inner_text('main')
    assert 'Asha Rao · Resident' in body and 'Floor 1' in body, body[:400]
    page.locator('main button:has-text("Check in")').first.click()
    page.wait_for_selector('text=How long will they stay?')
    page.click('[role=radio]:has-text("2 hours")'); page.wait_for_selector('text=Expected out by')
    page.click('button:has-text("Let them in")'); page.wait_for_timeout(600)
    sent = [(p, b) for m, p, b in posts if m == 'PUT' and p.endswith('/check-in')]
    assert sent and sent[-1][1].get('stayMinutes') == 120 and sent[-1][1].get('code') == 'ABCDEF12', sent

def gate_pass(page):
    page.goto(smoke.BASE + '/visitors'); page.locator('button:has-text("Show pass"):visible').first.wait_for()
    page.locator('button:has-text("Show pass"):visible').first.click()
    page.wait_for_selector('text=Nivora gate pass'); body = page.inner_text('[role=dialog]')
    assert 'ABCDEF12' in body and 'Floor 1' in body, body

def inside_overdue(page):
    page.goto(smoke.BASE + '/gate'); page.wait_for_selector('text=Inside now')
    page.wait_for_selector('text=over')

def exit_needs_code(page):
    page.goto(smoke.BASE + '/gate'); page.wait_for_selector('text=Inside now')
    page.locator('button:has-text("Check out with code")').first.click()
    page.wait_for_selector('text=shows their QR code or says their pass code')
    page.fill('#gate-code', 'ABCDEF12'); page.click('button[form="code-form"]')
    page.wait_for_selector('text=belongs to Ravi Teja, not Meena Courier')           # someone else's code does not work
    assert not [1 for m, p, b in posts if m == 'PUT' and p.endswith('/check-out')], 'nobody is checked out with the wrong code'

def visitors_no_click_checkin(page):
    page.goto(smoke.BASE + '/visitors'); page.wait_for_selector('text=Ravi Teja', state='attached')
    page.wait_for_selector('text=Check in at the gate', state='attached')
    assert page.locator('button:has-text("Check in")').count() == 0, 'invited visitors cannot be checked in with a click'
    assert page.locator('button:has-text("Approve")').count() == 0, 'only the resident approves'

def resident_help_pass(page):
    page.goto(smoke.BASE + '/visitors'); page.wait_for_selector('text=Ravi Teja', state='attached')
    page.click('[role=tab]:has-text("Daily help")'); page.wait_for_selector('text=Lakshmi')
    page.locator('button:has-text("Show pass")').first.click()
    page.wait_for_selector('text=Daily help pass'); assert '482913' in page.inner_text('[role=dialog]')

def public_pass(page):
    page.goto(smoke.BASE + '/pass/abcdef1234567890abcdef1234567890'); page.wait_for_selector('text=Nivora entry pass')
    body = page.inner_text('body')
    assert 'ABCDEF12' in body and 'Green Meadows' in body and 'Flat A-210' in body and 'Invited by Asha' in body, body
    assert 'Sign out' not in body, 'the guest page must not show the app menu'
    assert page.locator('svg').count() >= 1

def invite_with_email(page):
    page.goto(smoke.BASE + '/visitors'); page.wait_for_selector('text=Ravi Teja', state='attached')
    page.locator('button:has-text("Invite visitor"):visible').first.click()
    page.fill('#v-name', 'Guest'); page.fill('#v-phone', '9812345678'); page.fill('#v-email', 'guest@example.com')
    page.click('button[form=invite-form]'); page.wait_for_selector('text=by text and email', timeout=5000)
    sent = [b for m, p, b in posts if p == '/visitors/invite']
    assert sent and sent[-1].get('email') == 'guest@example.com', sent

def verify_flow(page):
    page.goto(smoke.BASE + '/login'); page.fill('#email', 'asha@example.com'); page.fill('#password', 'Passw0rd123')
    page.click('button[type=submit]'); page.wait_for_url('**/verify')
    page.wait_for_selector('text=Verify your account'); body = page.inner_text('main')
    assert 'a***@example.com' in body and '******3210' in body and 'printed in the backend terminal' in body, body[:500]
    page.fill('#code-email', '123456'); page.fill('#code-phone', '654321'); page.click('button[type=submit]')
    page.wait_for_url('**/dashboard')
    sent = [b for m, p, b in posts if p == '/auth/otp/verify']
    assert sent and sent[-1] == dict(email='asha@example.com', emailCode='123456', phoneCode='654321'), sent

def no_flash(page):
    # Visit two screens once, then switch back and forth: nothing that is already known may flash a loader.
    page.goto(smoke.BASE + '/dashboard'); page.wait_for_selector('main'); page.wait_for_timeout(1500)
    nav = lambda href: page.locator(f'a[href="{href}"]:visible').first
    nav('/payments').click(); page.wait_for_url('**/payments'); page.wait_for_timeout(800)
    nav('/dashboard').click(); page.wait_for_url('**/dashboard'); page.wait_for_timeout(800)
    page.evaluate("""() => { window.__flash = 0; new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && (n.matches?.('.skeleton, .loader-ring, .spinner') || n.querySelector?.('.skeleton, .loader-ring, .spinner'))) window.__flash++ }).observe(document.body, { childList: true, subtree: true }) }""")
    for href in ['/payments', '/dashboard', '/payments', '/dashboard']:
        nav(href).click(); page.wait_for_url('**' + href); page.wait_for_timeout(300)
    flashes = page.evaluate('window.__flash')
    assert flashes == 0, f'a loader flashed {flashes} times while switching between screens already visited'

def admin_adds_person(page):
    page.goto(smoke.BASE + '/admin/residents'); page.wait_for_selector('button:has-text("Add person")')
    page.click('button:has-text("Add person")'); page.wait_for_selector('#np-name')
    page.select_option('#np-role', 'guard_admin')
    assert page.locator('#np-flat').count() == 0, 'only residents are asked for a flat'
    page.fill('#np-name', 'Gopi Head'); page.fill('#np-email', 'gopi@example.com'); page.fill('#np-phone', '9876500011')
    page.click('button[form="add-person-form"]'); page.wait_for_selector('text=Account created')
    sent = [b for m, p, b in posts if m == 'POST' and p == '/users/create']
    assert sent and sent[-1] == dict(role='guard_admin', name='Gopi Head', email='gopi@example.com', phone='9876500011'), sent
    body = page.inner_text('body')
    assert 'could not be sent' in body and 'reset-password/abc123' in page.input_value('#np-link'), body[:400]
    assert page.locator('a:has-text("Share on WhatsApp")').count() == 1

def super_adds_admin(page):
    page.goto(smoke.BASE + '/admin/residents'); page.wait_for_selector('button:has-text("Add person")')
    page.click('button:has-text("Add person")'); page.wait_for_selector('#np-society')
    opts = page.locator('#np-role option').all_inner_texts()
    assert 'Society admin' in opts, opts
    page.select_option('#np-role', 'society_admin')
    page.fill('#np-name', 'New Admin'); page.fill('#np-email', 'na@example.com'); page.fill('#np-phone', '9876500022')
    assert page.input_value('#np-society'), 'the society being viewed is chosen for you'
    page.click('button[form="add-person-form"]'); page.wait_for_selector('text=Account created')
    sent = [b for m, p, b in posts if m == 'POST' and p == '/users/create']
    assert sent[-1]['role'] == 'society_admin' and sent[-1]['societyId'], sent[-1]

def admin_cannot_add_admin(page):
    page.goto(smoke.BASE + '/admin/residents'); page.wait_for_selector('button:has-text("Add person")')
    page.click('button:has-text("Add person")'); page.wait_for_selector('#np-role')
    assert 'Society admin' not in page.locator('#np-role option').all_inner_texts()
    assert page.locator('#np-society').count() == 0

def staff_has_no_add(page):
    page.goto(smoke.BASE + '/admin/residents'); page.wait_for_selector('main')
    page.wait_for_timeout(500)
    assert page.locator('button:has-text("Add person")').count() == 0

def modal_outside_tap(page):
    page.goto(smoke.BASE + '/daily-help'); page.wait_for_selector('button:has-text("Add helper")')
    page.locator('main button:has-text("Add helper")').first.click(); page.wait_for_selector('#h-name')
    page.fill('#h-name', 'Savitri')
    page.mouse.click(8, 300)                       # a tap on the dimmed area outside the form
    page.wait_for_timeout(300)
    assert page.locator('#h-name').count() == 1 and page.input_value('#h-name') == 'Savitri', 'tapping outside must not close a form that has been typed in'
    page.keyboard.press('Escape'); page.wait_for_timeout(300)
    assert page.locator('#h-name').count() == 1, 'Escape must not throw away typed details either'
    page.click('button:has-text("Cancel")'); page.wait_for_timeout(300)
    assert page.locator('#h-name').count() == 0, 'the Cancel button still closes it'
    # a dialog with no fields (a confirmation) is still closed by tapping outside
    page.locator('button:has-text("Remove")').first.click(); page.wait_for_selector('text=Remove this helper?')
    page.mouse.click(8, 300); page.wait_for_timeout(300)
    assert page.locator('text=Remove this helper?').count() == 0

def refreshes_after_action(page):
    seen = []
    page.on('request', lambda r: seen.append((r.method, r.url.split('/api')[-1])) if '/api/daily-help' in r.url and '/pass' not in r.url else None)
    page.goto(smoke.BASE + '/daily-help'); page.wait_for_selector('text=Lakshmi'); page.wait_for_timeout(600)
    page.click('button:has-text("Edit")'); page.wait_for_selector('#e-email')
    page.fill('#e-email', 'lakshmi@example.com')
    before = len([1 for m, u in seen if m == 'GET' and u.startswith('/daily-help')])
    page.click('button[form="edit-help-form"]'); page.wait_for_timeout(1200)
    after = len([1 for m, u in seen if m == 'GET' and u.startswith('/daily-help')])
    sent = [b for m, p, b in posts if m == 'PUT' and p == '/daily-help/h1']
    assert sent and sent[-1]['email'] == 'lakshmi@example.com', sent
    assert after > before, 'the list must reload by itself after a save, without a manual refresh'

def helper_attendance(page):
    page.goto(smoke.BASE + '/daily-help'); page.wait_for_selector('text=Lakshmi')
    assert 'Inside since' in page.inner_text('main') and ' · ' in page.inner_text('main')
    page.click('button:has-text("Attendance")'); page.wait_for_selector('text=4 h in total')
    body = page.inner_text('[role=dialog]')
    assert '2 h 30 min' in body and '1 h 30 min' in body and '2 days present' in body, body
    with page.expect_download() as dl: page.click('[role=dialog] button:has-text("CSV")')
    path = dl.value.path(); text = open(path, encoding='utf-8-sig').read()
    assert 'Time inside' in text and '2 h 30 min' in text and 'Total' in text and '240' in text, text

def helper_old_code(page):
    page.goto(smoke.BASE + '/daily-help'); page.wait_for_selector('[aria-label="Helper code"]')
    page.fill('[aria-label="Helper code"]', '111222'); page.click('button:has-text("Find")')
    page.wait_for_selector('text=That was an old code'); assert '482913' in page.inner_text('main')
    page.locator('main button:has-text("Check in")').click(); page.wait_for_timeout(500)

def checkin_uses_planned_exit(page):
    page.goto(smoke.BASE + '/gate'); page.wait_for_selector('#pass')
    page.fill('#pass', 'FEEDBEEF'); page.click('button:has-text("Find")'); page.wait_for_selector('text=Approved by')
    page.locator('main button:has-text("Check in")').first.click()
    page.wait_for_selector('text=The resident set the leaving time when inviting.')
    assert page.locator('text=How long will they stay?').count() == 0, 'the guard has no stay to pick'
    assert 'Expected out by' in page.inner_text('[role=dialog]')
    page.click('button:has-text("Let them in")'); page.wait_for_timeout(600)
    sent = [b for m, p, b in posts if m == 'PUT' and p.endswith('/check-in')]
    assert sent and sent[-1] == dict(code='FEEDBEEF'), sent[-1:]

def invite_with_leaving_time(page):
    page.goto(smoke.BASE + '/visitors'); page.wait_for_selector('button:has-text("Invite visitor")')
    page.locator('main button:has-text("Invite visitor")').first.click(); page.wait_for_selector('#v-out')
    assert page.locator('#v-valid').count() == 1
    page.fill('#v-name', 'Guest Two'); page.fill('#v-phone', '9812345678')
    page.fill('#v-out', (__import__('datetime').datetime.now() + __import__('datetime').timedelta(days=2)).strftime('%Y-%m-%dT%H:%M'))
    assert page.locator('#v-valid').count() == 0, 'with a leaving time the validity choice is not needed'
    page.click('button[form="invite-form"]'); page.wait_for_timeout(800)
    sent = [b for m, p, b in posts if m == 'POST' and p == '/visitors/invite']
    assert sent and sent[-1]['plannedExit'].endswith('Z') and 'validForHours' in sent[-1], sent[-1:]

def main():
  for role, name, fn in [('resident', 'book service', book_service), ('resident', 'amenity booking', amenity), ('resident', 'SOS', sos), ('resident', 'RSVP', rsvp), ('resident', 'notification deep link', notif), ('society_admin', 'admin adds a guard head', admin_adds_person), ('society_admin', 'admin cannot add admins', admin_cannot_add_admin), ('super_admin', 'super admin adds a society admin', super_adds_admin), ('staff', 'staff cannot add people', staff_has_no_add), ('resident', 'switching screens does not flash a loader', no_flash), ('security', 'gate check', gate_check), ('resident', 'outside tap keeps typed details', modal_outside_tap), ('resident', 'list reloads after a save', refreshes_after_action), ('resident', 'helper attendance shows time inside and downloads', helper_attendance), ('security', 'old daily help code still finds them', helper_old_code), ('security', 'check-in uses the leaving time the resident set', checkin_uses_planned_exit), ('resident', 'invite with a leaving time', invite_with_leaving_time),
                         ('resident', 'language switch', language), ('resident', 'data and headings translate and restore', translate_data), ('resident', 'guide is role-only and searchable', help_isolation), ('resident', 'guide is translated and searchable in Telugu', guide_in_telugu), ('society_admin', 'admin guide', help_admin),
                         ('resident', 'cast a vote', vote), ('staff', 'mark upkeep done', mark_done), ('society_admin', 'add shifts', add_shift),
                         ('society_admin', 'create a vote', new_vote), ('society_admin', 'add a document', add_document),
                         ('resident', 'pay a service bill online', pay_online), ('super_admin', 'roster as platform admin', super_roster), ('security', 'clock in', clock_in),
                         ('society_admin', 'admin manages amenities', admin_amenities), ('society_admin', 'admin sees who liked and reported', post_activity), ('society_admin', 'admin sees who voted', voter_list), ('security', 'gate scan and expected exit', gate_scan), ('resident', 'gate pass ticket', gate_pass), ('security', 'overdue visitor is flagged', inside_overdue), ('security', 'exit needs the visitor code', exit_needs_code), ('security', 'no click check-in or approval for staff', visitors_no_click_checkin), ('resident', 'daily help pass from visitors', resident_help_pass), ('resident', 'verify email and mobile with codes', verify_flow), ('resident', 'guest opens the pass link', public_pass), ('resident', 'invite sends the pass by text and email', invite_with_email)]:
      try:
          e = go(role, fn, init=RAZORPAY_STUB if name == 'pay a service bill online' else ("localStorage.removeItem('token')" if name.startswith('verify') else None)); print('OK  ' if not e else 'ERR ', name, e or '')
      except Exception as ex:
          print('FAIL', name, str(ex)[:300])
  print()
  for p in posts: print(p)

if __name__=='__main__': main()
