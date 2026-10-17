"""Opens every screen in a chosen language and lists the English words still on it.
Usage: python3 smoke/i18n_audit.py te [role ...]      (needs vite preview on :4173)
Reuses the fixtures from smoke.py and adds sample rows for the screens that smoke.py leaves empty."""
import os, re, sys, json, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import smoke
from smoke import *
from playwright.sync_api import sync_playwright

LANG = sys.argv[1] if len(sys.argv) > 1 else 'te'
ROLES = sys.argv[2:] or list(USERS)
orig_api = smoke.api
def iso(n, h=10): return (datetime.datetime.utcnow() + datetime.timedelta(days=n)).replace(hour=h, minute=7).isoformat() + 'Z'
def rich(role, method, p, q):
    if p == '/visitors': return dict(success=True, count=3, visitors=[
        dict(_id='v1', name='siri', phone='9876543210', purpose='personal', status='checked_out', numberOfVisitors=1, entryTime=iso(-5), exitTime=iso(-5), flatNo='101', block='A', passCode='ABC123', residentId=dict(name='Asha Rao')),
        dict(_id='v2', name='Raj', phone='9876543211', purpose='delivery', status='pending', numberOfVisitors=2, createdAt=iso(0), flatNo='101', block='A', residentId=dict(name='Asha Rao')),
        dict(_id='v3', name='Meena', phone='9876543212', purpose='guest', status='approved', numberOfVisitors=1, expectedArrival=iso(1), flatNo='101', block='A', passCode='XYZ789', residentId=dict(name='Asha Rao'))])
    if p == '/deliveries': return dict(success=True, count=2, deliveries=[
        dict(_id='dl1', deliveryPersonName='Ramesh', deliveryPersonPhone='9000000001', company='Amazon', status='pending', createdAt=iso(0), flatNo='101', block='A', trackingNumber='AZ123', residentId=dict(name='Asha Rao')),
        dict(_id='dl2', deliveryPersonName='Sita', deliveryPersonPhone='9000000002', company='Swiggy', status='delivered', createdAt=iso(-1), flatNo='101', block='A', residentId=dict(name='Asha Rao'))])
    if p == '/vehicles': return dict(success=True, count=1, vehicles=[dict(_id='ve1', vehicleNumber='KA01AB1234', vehicleType='car', brand='Honda', model='City', color='White', isInside=True, residentId=dict(name='Asha Rao', flatNo='101', block='A'), flatNo='101', block='A')])
    if p == '/complaints': return dict(success=True, count=2, complaints=[
        dict(_id='c1', title='Water leak in the corridor', description='Third floor', category='plumbing', priority='high', status='open', createdAt=iso(-1), residentId=dict(name='Asha Rao', flatNo='101', block='A'), updates=[]),
        dict(_id='c2', title='Lift not working', description='Block B', category='electrical', priority='medium', status='resolved', createdAt=iso(-4), residentId=dict(name='Asha Rao', flatNo='101', block='A'), updates=[])])
    if p == '/payments': return dict(success=True, count=2, payments=[
        dict(_id='py1', type='maintenance', amount=2500, month='2026-10', status='pending', dueDate=iso(5), createdAt=iso(-2), residentId=dict(name='Asha Rao', flatNo='101', block='A')),
        dict(_id='py2', type='maintenance', amount=2500, month='2026-09', status='completed', paymentMethod='online', paidAt=iso(-20), createdAt=iso(-30), receiptNumber='R-1', residentId=dict(name='Asha Rao', flatNo='101', block='A'))])
    if p == '/users/pending-approvals': return dict(success=True, count=1, users=[dict(_id='u9', name='Bina Shah', role='resident', flatNo='202', block='B', phone='9000000009', email='b@x.com', createdAt=iso(-1), isApproved=False)])
    if p == '/users' or p.startswith('/users?'): return dict(success=True, count=1, users=[dict(_id='u9', name='Bina Shah', role='resident', flatNo='202', block='B', phone='9000000009', email='b@x.com', createdAt=iso(-1), isApproved=True, isActive=True)])
    return orig_api(role, method, p, q)
smoke.api = rich

PATHS = {
 'resident': ['/dashboard','/visitors','/deliveries','/vehicles','/daily-help','/services','/services/providers/p1','/services/requests','/services/requests/r1','/services/requests/r9','/bookings','/community','/community/po1','/notices','/complaints','/payments','/accounts','/emergency','/documents','/votes','/upkeep','/help','/profile'],
 'security': ['/dashboard','/gate','/visitors','/deliveries','/vehicles','/daily-help','/emergency','/my-shifts','/upkeep','/documents','/help','/profile','/notices'],
 'staff': ['/dashboard','/my-shifts','/upkeep','/documents','/help','/notices','/emergency'],
 'vendor': ['/dashboard','/work','/work/setup','/services/requests/r1','/help','/profile'],
 'society_admin': ['/dashboard','/admin/residents','/admin/societies','/admin/services','/visitors','/deliveries','/vehicles','/bookings','/community','/notices','/complaints','/payments','/accounts','/emergency','/documents','/votes','/upkeep','/roster','/help','/profile'],
 'super_admin': ['/dashboard','/admin/societies','/admin/residents','/roster','/votes','/documents','/upkeep','/help','/profile'],
}
OPENERS = re.compile(r'^(add|new|invite|create|raise|expect|register|post|record|make|publish|set up|log|book|change|edit|send|show pass|pay|sos|reject|cancel|decline|accept|mark|complete|start|rate|vote|add by code|bar)', re.I)
ENGLISH = re.compile(r'[A-Za-z]{3,}')
TEL = re.compile(r'[ऀ-ॿఀ-౿]')

def texts(page):
    return page.evaluate('''() => {
      const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) { const n = w.currentNode; const p = n.parentElement; if (!p) continue;
        const tag = p.tagName; if (['SCRIPT','STYLE','OPTION'].includes(tag)) continue;
        if (p.closest('[data-no-translate],[translate=no]')) continue;
        const t = n.nodeValue.replace(/\\s+/g,' ').trim(); if (t) out.push(t); }
      document.querySelectorAll('[placeholder],[title],[aria-label]').forEach(e => ['placeholder','title','aria-label'].forEach(a => { const v = e.getAttribute(a); if (v) out.push(v) }));
      document.querySelectorAll('select option').forEach(o => out.push(o.textContent.trim()));
      return out }''')

found = {}
def collect(role, path, page, where):
    for t in texts(page):
        if ENGLISH.search(t) and not TEL.search(t):
            found.setdefault(t, set()).add(f'{path}{where}')

with sync_playwright() as pw:
    br = pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or None, args=['--no-sandbox'])
    for role in ROLES:
        ctx = br.new_context(viewport=dict(width=1280, height=900), service_workers='block')
        ctx.add_init_script(f"localStorage.setItem('token','t'); localStorage.setItem('lang','{LANG}')")
        def make(role):
          def handler(route, _req=None):
            req = route.request
            m = re.search(r'/api(/[^?]*)(?:\?(.*))?', req.url)
            if not m: return route.continue_()
            q = dict(x.split('=', 1) for x in (m.group(2) or '').split('&') if '=' in x)
            route.fulfill(status=200, content_type='application/json', body=json.dumps(smoke.api(role, req.method, m.group(1), q)))
          return handler
        ctx.route('**/api/**', make(role)); ctx.route('**/socket.io/**', lambda r: r.abort())
        for path in PATHS[role]:
            page = ctx.new_page()
            try:
                page.goto(BASE + path); page.wait_for_selector('main', timeout=8000); page.wait_for_timeout(900)
            except Exception: print('no render', role, path)
            collect(role, path, page, '')
            names = page.eval_on_selector_all('main button, main a.btn-primary, main a.btn-secondary', 'els => els.map(e => e.textContent.trim()).filter(Boolean)')
            tried = set()
            for label in names[:14]:
                if label in tried or not OPENERS.search(label): continue
                tried.add(label)
                try:
                    page.get_by_role('button', name=label, exact=True).first.click(timeout=1500); page.wait_for_timeout(500)
                    if page.locator('[role=dialog]').count(): collect(role, path, page, f' [{label}]')
                    page.keyboard.press('Escape'); page.wait_for_timeout(200)
                    if page.locator('[role=dialog]').count(): page.reload(); page.wait_for_selector('main'); page.wait_for_timeout(500)
                except Exception: pass
            page.close()
        ctx.close()
    br.close()
rows = sorted(found.items(), key=lambda kv: kv[0].lower())
json.dump({k: sorted(v) for k, v in rows}, open(os.environ.get('AUDIT_OUT', '/tmp/audit.json'), 'w'), ensure_ascii=False, indent=0)
print(len(rows), 'English strings left')
for k, v in rows: print(f'{k}   <- {sorted(v)[0]}')
