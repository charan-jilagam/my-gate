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
            if req.method == 'POST' and m.group(1) == '/daily-help/check': body = dict(success=True, action='in', time='2026-10-19T04:00:00Z', helper=dict(_id='h1', name='Lakshmi', kind='maid', flats=['A-101']))
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
    page.wait_for_url('**/visitors')

def gate_check(page):
    page.goto(smoke.BASE + '/daily-help'); page.wait_for_selector('[aria-label="Helper code"]')
    page.fill('[aria-label="Helper code"]', '482913'); page.click('button:has-text("Check")'); page.wait_for_selector('text=Lakshmi checked in')


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

def main():
  for role, name, fn in [('resident', 'book service', book_service), ('resident', 'amenity booking', amenity), ('resident', 'SOS', sos), ('resident', 'RSVP', rsvp), ('resident', 'notification deep link', notif), ('security', 'gate check', gate_check),
                         ('resident', 'language switch', language), ('resident', 'data and headings translate and restore', translate_data), ('resident', 'guide is role-only and searchable', help_isolation), ('society_admin', 'admin guide', help_admin),
                         ('resident', 'cast a vote', vote), ('staff', 'mark upkeep done', mark_done), ('society_admin', 'add shifts', add_shift),
                         ('society_admin', 'create a vote', new_vote), ('society_admin', 'add a document', add_document),
                         ('resident', 'pay a service bill online', pay_online), ('super_admin', 'roster as platform admin', super_roster), ('security', 'clock in', clock_in)]:
      try:
          e = go(role, fn, init=RAZORPAY_STUB if name == 'pay a service bill online' else None); print('OK  ' if not e else 'ERR ', name, e or '')
      except Exception as ex:
          print('FAIL', name, str(ex)[:300])
  print()
  for p in posts: print(p)

if __name__=='__main__': main()
