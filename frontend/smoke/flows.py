import os
import json, re, warnings
warnings.filterwarnings('ignore')
import smoke
from playwright.sync_api import sync_playwright

posts = []
def go(role, fn):
    errs = []
    with sync_playwright() as pw:
        br = pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or None, args=['--no-sandbox'])
        ctx = br.new_context(viewport=dict(width=390, height=800), service_workers='block')
        ctx.add_init_script("localStorage.setItem('token','t')")
        def handler(route):
            req = route.request
            m = re.search(r'/api(/[^?]*)(?:\?(.*))?', req.url)
            q = dict(x.split('=', 1) for x in (m.group(2) or '').split('&') if '=' in x)
            if req.method != 'GET': posts.append((req.method, m.group(1), json.loads(req.post_data or '{}')))
            body = smoke.api(role, req.method, m.group(1), q)
            if req.method == 'POST' and m.group(1) == '/service-requests': body = dict(success=True, message='Booked', request=smoke.REQ)
            if req.method == 'POST' and m.group(1) == '/daily-help/check': body = dict(success=True, action='in', time='2026-10-19T04:00:00Z', helper=dict(_id='h1', name='Lakshmi', kind='maid', flats=['A-101']))
            if req.method == 'POST' and m.group(1) == '/emergency/sos': body = dict(success=True, message='Alert sent to the gate and the society office.', alert={}, notified=2)
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

def main():
  for role, name, fn in [('resident', 'book service', book_service), ('resident', 'amenity booking', amenity), ('resident', 'SOS', sos), ('resident', 'RSVP', rsvp), ('resident', 'notification deep link', notif), ('security', 'gate check', gate_check)]:
      try:
          e = go(role, fn); print('OK  ' if not e else 'ERR ', name, e or '')
      except Exception as ex:
          print('FAIL', name, str(ex)[:300])
  print()
  for p in posts: print(p)

if __name__=='__main__': main()
