import os
import json, re, sys, datetime, subprocess
from playwright.sync_api import sync_playwright

BASE = os.environ.get('SMOKE_URL', 'http://localhost:4173')
OUT = os.environ.get('SMOKE_OUT', '.')
today = datetime.date.today()
d = lambda n: (today + datetime.timedelta(days=n)).isoformat()
NOW = datetime.datetime.utcnow().isoformat() + 'Z'

SOC = 's1'
HERE = os.path.dirname(os.path.abspath(__file__))
# The real guides, straight from the backend, so the browser checks what people will actually read.
MANUALS = json.loads(subprocess.check_output(['node', '-e', "console.log(JSON.stringify(require('../../backend/content/manual').manuals))"], cwd=HERE))
USERS = {
  'resident': dict(_id='u1', name='Asha Rao', role='resident', flatNo='101', block='A', societyId=dict(_id=SOC, name='Green Heights'), isApproved=True, email='a@x.com'),
  'vendor': dict(_id='u2', name='Ravi Kumar', role='vendor', societyId=dict(_id=SOC, name='Green Heights'), isApproved=True, email='r@x.com'),
  'society_admin': dict(_id='u3', name='Office Admin', role='society_admin', societyId=dict(_id=SOC, name='Green Heights'), isApproved=True, email='o@x.com'),
  'security': dict(_id='u4', name='Gate Guard', role='security', societyId=dict(_id=SOC, name='Green Heights'), isApproved=True, email='g@x.com'),
  'staff': dict(_id='u5', name='Sunil Staff', role='staff', societyId=dict(_id=SOC, name='Green Heights'), isApproved=True, email='s@x.com'),
  'super_admin': dict(_id='u6', name='Platform Owner', role='super_admin', isApproved=True, email='p@x.com'),
}
OFFICE = ('society_admin', 'super_admin')
STAFFY = ('security', 'staff')
def person(name, phone=None): return dict(name=name, phone=phone, photo=None)
REQ = dict(_id='r1', category='plumber', categoryLabel='Plumber', title='Leaking kitchen tap', description='Drips all night', urgency='normal', status='confirmed',
           date=d(2), startTime='10:00', endTime='11:00', flat='A-101', viewerRole='resident', startOtp='4821', visitCharge=250,
           provider=dict(profileId='p1', **person('Ravi Kumar', '9123456780')), resident=person('Asha Rao', '9876543210'),
           statusHistory=[dict(status='requested', at=NOW), dict(status='confirmed', at=NOW)],
           actions=dict(cancel=True, reschedule=True, onTheWay=False), images=[])
SLOTS = [dict(start=f'{h:02d}:00', end=f'{h+1:02d}:00', available=(h != 11), reason=None if h != 11 else 'booked', startAt=NOW, endAt=NOW) for h in range(9, 18)]
PROVIDER = dict(_id='p1', name='Ravi Kumar', photo=None, categories=['plumber', 'electrician'], bio='Fifteen years fixing taps.', experienceYears=15, visitCharge=250, priceNote='Parts extra',
                rating=dict(avg=4.6, count=12), jobsCompleted=40, isVerified=True, acceptingJobs=True, autoAccept=False, slotMinutes=60,
                nextAvailable=dict(date=d(1), start='10:00', end='11:00', available=True))
POST = dict(_id='po1', category='buy_sell', title='Study table', body='Barely used', price=1500, images=[], isPinned=True, isResolved=False, isHidden=False,
            author=dict(id='u9', name='Bina Shah', flat='B-202', isAdmin=False), likeCount=2, liked=False, commentCount=1, mine=False, canManage=False, createdAt=NOW)
WEEK = [dict(day=i, enabled=i != 0, start='09:00', end='18:00') for i in range(7)]
VISITORS = [
    dict(_id='v1', name='siri', phone='9876543210', purpose='personal', status='checked_out', numberOfVisitors=1, entryTime='2026-10-12T09:37:00Z', exitTime='2026-10-12T11:00:00Z', flatNo='101', block='A', residentId=dict(name='Asha Rao')),
    dict(_id='v2', name='Ravi Teja', phone='9876500001', purpose='business', status='approved', approved=True, numberOfVisitors=2, flatNo='101', block='A', qrCode='{"visitorId":"abcdef123456"}', approvedBy=dict(_id='u1', name='Asha Rao', role='resident'), residentId=dict(_id='u1', name='Asha Rao', phone='9876543210')),
    dict(_id='v3', name='Meena Courier', phone='9876500002', purpose='delivery', status='checked_in', approved=True, numberOfVisitors=1, flatNo='101', block='A', entryTime='2026-10-12T09:00:00Z', expectedExit='2026-10-12T09:30:00Z', approvedBy=dict(_id='u1', name='Asha Rao', role='resident'), residentId=dict(_id='u1', name='Asha Rao', phone='9876543210'))
]
AMEN = dict(_id='am1', name='Clubhouse', capacity=40, hourlyRate=500, openTime='06:00', closeTime='22:00', slotMinutes=60, maxSlotsPerBooking=3, requiresApproval=True, maxAdvanceDays=30)

def api(role, method, path, q):
    u = USERS[role]
    p = path
    if p == '/auth/me': return dict(success=True, user=u)
    if p.startswith('/users/notifications'): return dict(success=True, notifications=[dict(_id='n1', title='Booking confirmed', message='Ravi confirmed your plumber visit', isRead=False, createdAt=NOW, actionUrl='/services/requests/r1'), dict(_id='n2', title='Visitor', message='Raj is at the gate', isRead=False, createdAt=NOW, actionUrl='/visitors/abc123')], unreadCount=2)
    if p == '/services/categories': return dict(success=True, categories=[dict(key='electrician', label='Electrician'), dict(key='plumber', label='Plumber'), dict(key='carpenter', label='Carpenter')])
    if p == '/services/providers': return dict(success=True, count=1, providers=[PROVIDER])
    if p.startswith('/services/providers/') and p.endswith('/availability'): return dict(success=True, days=[dict(date=d(i), closed=(i == 0), reason='day_off' if i == 0 else None, total=9, free=8) for i in range(15)])
    if p.startswith('/services/providers/') and p.endswith('/slots'): return dict(success=True, date=q.get('date'), closed=False, slots=SLOTS)
    if p.startswith('/services/providers/'): return dict(success=True, provider=PROVIDER, reviews=[dict(rating=5, review='Quick and tidy', by='Bina', categoryLabel='Plumber', reviewedAt=NOW)])
    if p == '/services/admin/providers': return dict(success=True, providers=[dict(PROVIDER, isActive=True, phone='9123456780', accountApproved=True, openJobs=2)])
    if p == '/services/me': return dict(success=True, today=d(0), timezone='Asia/Kolkata', profile=dict(PROVIDER, weeklySchedule=WEEK, breakTime=dict(enabled=False, start='13:00', end='14:00'), timeOff=[], minNoticeMinutes=60, maxAdvanceDays=14, isActive=True), stats=dict(today=1, awaiting=1, upcoming=3, monthJobs=5, monthEarnings=4200))
    if p == '/service-requests/r1': return dict(success=True, request=REQ)
    if p == '/service-requests/r9': return dict(success=True, request=dict(REQ, _id='r9', status='completed', finalAmount=450, paymentStatus='unpaid', workSummary='Replaced washer', startOtp=None, actions=dict(payOnline=True, review=True)))
    if p == '/service-requests':
        r = dict(REQ, viewerRole='provider' if role == 'vendor' else ('admin' if role == 'society_admin' else 'resident'))
        pend = dict(r, _id='r2', status='requested', date=d(0), title='No power in bedroom', actions=dict(accept=True, decline=True))
        return dict(success=True, requests=[r, pend] if role == 'vendor' else [r])

    if p == '/manual': return dict(success=True, manual=MANUALS[role])
    if p == '/documents': return dict(success=True, documents=[dict(_id='d1', title='Society bylaws 2026', category='bylaws', description='Rules everyone follows', url='/uploads/a.pdf', fileName='bylaws.pdf', visibility='all', createdAt=NOW)] + ([dict(_id='d2', title='Audit draft', category='financial', url='https://example.com/audit', visibility='admins', createdAt=NOW)] if role in OFFICE else []))
    if p == '/elections':
        return dict(success=True, elections=[
            dict(_id='e1', title='Install solar panels?', kind='resolution', voting='per_flat', phase='open', voted=False, opensAt=NOW, closesAt=(datetime.datetime.utcnow() + datetime.timedelta(days=3)).isoformat() + 'Z', options=[dict(_id='o1', label='Yes'), dict(_id='o2', label='No')], canManage=role in OFFICE),
            dict(_id='e2', title='Elect the treasurer', kind='election', voting='per_flat', phase='closed', voted=True, opensAt=NOW, closesAt=NOW, options=[dict(_id='o3', label='Meera'), dict(_id='o4', label='Kabir')], canManage=role in OFFICE)])
    if p == '/elections/e1/voters': return dict(success=True, voting='per_flat', votes=12, unlisted=2, voted=[dict(name='Asha Rao', flat='A-101', votedAt=NOW)], waiting=[dict(name='Bina Shah', flat='B-202')])
    if p == '/elections/e1': return dict(success=True, election=dict(_id='e1', title='Install solar panels?', description='Cost 4 lakh, saves 30 percent of power bills.', kind='resolution', voting='per_flat', phase='open', voted=False, opensAt=NOW, closesAt=(datetime.datetime.utcnow() + datetime.timedelta(days=3)).isoformat() + 'Z', options=[dict(_id='o1', label='Yes', detail='Install this year'), dict(_id='o2', label='No')], canManage=role in OFFICE, **(dict(turnout=dict(votes=12, eligible=40)) if role in OFFICE else {})))
    if p == '/elections/e2': return dict(success=True, election=dict(_id='e2', title='Elect the treasurer', kind='election', voting='per_flat', phase='closed', voted=True, opensAt=NOW, closesAt=NOW, resultsVisible=True, tied=False, turnout=dict(votes=20, eligible=40), options=[dict(_id='o3', label='Meera', votes=14, percent=70, leading=True), dict(_id='o4', label='Kabir', votes=6, percent=30, leading=False)]))
    if p == '/facility':
        t = [dict(_id='f1', name='Clean overhead water tanks', category='water_tank', location='Block B terrace', intervalDays=90, nextDue=d(-4), lastDone=d(-94), active=True, status='overdue', daysLeft=-4, history=[dict(_id='hh1', doneOn=d(-94), byName='Sunil', note='Cleaned')], canComplete=role in OFFICE + STAFFY, canManage=role in OFFICE, contractor='Aqua Clean', contractorPhone='9000000001'),
             dict(_id='f2', name='Service the lifts', category='lift', intervalDays=30, nextDue=d(5), lastDone=d(-25), active=True, status='due_soon', daysLeft=5, history=[], canComplete=role in OFFICE + STAFFY, canManage=role in OFFICE),
             dict(_id='f3', name='Fire extinguisher check', category='fire_safety', intervalDays=180, nextDue=d(100), active=True, status='ok', daysLeft=100, history=[], canComplete=role in OFFICE + STAFFY, canManage=role in OFFICE)]
        return dict(success=True, today=d(0), tasks=t, counts=dict(overdue=1, due_soon=1, ok=1))
    if p == '/roster/people': return dict(success=True, people=[dict(_id='u4', name='Gate Guard', role='security'), dict(_id='u5', name='Sunil Staff', role='staff')])
    if p == '/roster/mine': return dict(success=True, today=d(0), shifts=[dict(_id='s1', userId='u4', date=d(0), startTime='08:00', endTime='16:00', overnight=False, post='main_gate', note='', phase='scheduled', canClockIn=True, canClockOut=False), dict(_id='s2', userId='u4', date=d(1), startTime='22:00', endTime='06:00', overnight=True, post='patrol', note='', phase='scheduled', canClockIn=False, canClockOut=False)])
    if p == '/roster': return dict(success=True, from_=d(0), today=d(0), shifts=[dict(_id='s1', userId='u4', person=dict(name='Gate Guard', role='security'), date=d(0), startTime='08:00', endTime='16:00', overnight=False, post='main_gate', phase='on_duty', clockInAt=NOW), dict(_id='s3', userId='u5', person=dict(name='Sunil Staff', role='staff'), date=d(1), startTime='22:00', endTime='06:00', overnight=True, post='housekeeping', phase='scheduled')])
    if p == '/community/posts': return dict(success=True, posts=[POST])
    if p.startswith('/community/posts/'):
        extra = dict(likers=[dict(id='u1', name='Asha Rao', flat='A-101', isAdmin=False), dict(id='u8', name='Kabir Mehta', flat='C-303', isAdmin=False)], reports=[dict(by=dict(id='u8', name='Kabir Mehta', flat='C-303', isAdmin=False), reason='Spam: selling twice')], reportCount=1) if role in OFFICE else {}
        return dict(success=True, post=dict(POST, **extra, comments=[dict(_id='c1', text='Is it still available?', createdAt=NOW, author=dict(id='u1', name='Asha Rao', flat='A-101'), canDelete=False)]))
    if p == '/emergency/contacts': return dict(success=True, contacts=[dict(_id='e1', name='City Police', phone='100', kind='police', note='24x7')])
    if p == '/emergency/alerts': return dict(success=True, alerts=[dict(_id='a1', type='medical', typeLabel='Medical emergency', note='Father fainted', status='active', flat='A-101', resident=dict(name='Asha Rao', phone='9876543210'), createdAt=NOW)] if role in ('security', 'society_admin') else [])
    if p == '/daily-help': return dict(success=True, helpers=[dict(_id='h1', name='Lakshmi', phone='9000000000', kind='maid', isActive=True, flats=['A-101'], households=1, code='482913' if role == 'resident' else None, today=dict(status='inside', checkIn=NOW))])
    if p == '/expenses/summary': return dict(success=True, month=today.strftime('%Y-%m'), collected=100000, spent=42500, balance=57500, pendingDues=8000, pendingCount=4, byCategory=[dict(category='security', amount=30000, count=2), dict(category='lift', amount=12500, count=1)])
    if p == '/expenses': return dict(success=True, total=0, expenses=[dict(_id='x1', title='Lift service', amount=12500, date=d(-3), category='lift', vendor='OTIS')])
    if p == '/bookings/amenities': return dict(success=True, amenities=[dict(AMEN, isActive=True)], timezone='Asia/Kolkata')
    if p == '/bookings/availability': return dict(success=True, amenity=AMEN, date=q.get('date'), closed=False, slots=[dict(start=f'{h:02d}:00', end=f'{h+1:02d}:00', available=(h != 18), reason=None if h != 18 else 'booked') for h in range(6, 22)])
    if p == '/bookings': return dict(success=True, bookings=[dict(_id='b1', amenity='Clubhouse', dateStr=d(3), slotDate=NOW, startTime=NOW, endTime=NOW, status='pending', amount=1000, residentId=dict(name='Asha Rao', flatNo='101'))])
    if p == '/notices': return dict(success=True, notices=[dict(_id='nt1', title='Diwali night', content='Join us', type='event', priority='medium', category='general', isPublished=True, eventDate=(datetime.datetime.utcnow() + datetime.timedelta(days=5)).isoformat() + 'Z', eventLocation='Clubhouse lawn', createdBy=dict(name='Admin'), createdAt=NOW, pollOptions=[], rsvp=dict(going=3, people=7, maybe=1, no=0, mine=None))])
    if p.startswith('/visitors/lookup/'): return dict(success=True, visitor=dict(VISITORS[1], floor='Floor 1', approvedAt=NOW, approvedBy=dict(_id='u1', name='Asha Rao', role='resident'), residentId=dict(_id='u1', name='Asha Rao', phone='9876543210')))
    if p == '/visitors':
        rows = VISITORS if q.get('status') is None else [v for v in VISITORS if v['status'] == q['status']]
        return dict(success=True, count=len(rows), visitors=rows)
    if p in ('/deliveries', '/vehicles', '/complaints', '/payments'): return dict(success=True, count=0, **{p[1:]: []})
    if p == '/users/pending-approvals': return dict(success=True, count=0, users=[])
    if p == '/societies': return dict(success=True, societies=[dict(_id=SOC, name='Green Heights', amenities=[dict(AMEN)])])
    return dict(success=True)

def run(role, pages, mobile=True):
    errors, results = [], []
    with sync_playwright() as pw:
        br = pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or None, args=['--no-sandbox'])
        ctx = br.new_context(viewport=dict(width=390, height=800) if mobile else dict(width=1280, height=800), service_workers='block')
        ctx.add_init_script("localStorage.setItem('token','t')")
        def handler(route):
            req = route.request
            url = req.url
            m = re.search(r'/api(/[^?]*)(?:\?(.*))?', url)
            if not m: return route.continue_()
            q = dict(x.split('=', 1) for x in (m.group(2) or '').split('&') if '=' in x)
            body = api(role, req.method, m.group(1), q)
            route.fulfill(status=200, content_type='application/json', body=json.dumps(body))
        ctx.route('**/api/**', handler)
        ctx.route('**/socket.io/**', lambda r: r.abort())
        for path, expect in pages:
            page = ctx.new_page()
            page.on('pageerror', lambda e, path=path: errors.append(f'{role} {path}: PAGEERROR {e}'))
            page.on('console', lambda msg, path=path: errors.append(f'{role} {path}: console.{msg.type} {msg.text}') if msg.type == 'error' and 'socket' not in msg.text.lower() and 'fonts.g' not in msg.text and 'ERR_FAILED' not in msg.text and 'Failed to load resource' not in msg.text else None)
            page.goto(BASE + path)
            try:
                page.wait_for_selector('main', timeout=8000)
                page.wait_for_timeout(700)
            except Exception as e:
                errors.append(f'{role} {path}: main never rendered')
            text = page.inner_text('body')
            for e_ in expect:
                if e_ not in text: errors.append(f'{role} {path}: missing text "{e_}"')
            overflow = page.evaluate('document.documentElement.scrollWidth > window.innerWidth + 1')
            if overflow: errors.append(f'{role} {path}: horizontal scroll at {"390" if mobile else "1280"}px')
            slug = path.strip('/').replace('/', '_') or 'root'
            page.screenshot(path=f'{OUT}/{role}_{slug}.png', full_page=False)
            results.append((role, path, page.url.replace(BASE, '')))
            page.close()
        br.close()
    return errors, results

if __name__ == '__main__':
    allerr = []
    plans = {
      'resident': [('/documents', ['Society bylaws 2026', 'Bylaws and rules']), ('/votes', ['Install solar panels?', 'Open now']), ('/upkeep', ['Clean overhead water tanks', 'Overdue']), ('/help', ['Resident guide', 'How to use this guide', 'Getting started']), ('/dashboard', ['Pre-approve a visitor', 'Your home services', 'Leaking kitchen tap']), ('/services', ['Home services', 'Ravi Kumar', 'Next free']),
                   ('/services/providers/p1', ['Choose a time', 'Fifteen years', 'Verified']), ('/services/requests', ['My bookings', 'Leaking kitchen tap']),
                   ('/services/requests/r1', ['4821', 'Progress', 'Cancel']), ('/community', ['Study table', 'Pinned']), ('/community/po1', ['Is it still available?']),
                   ('/emergency', ['SOS', 'City Police']), ('/daily-help', ['Lakshmi', '482913', 'Inside since']), ('/accounts', ['Collected', 'Where the money went', 'Security']),
                   ('/bookings', ['Clubhouse']), ('/notices', ['Diwali night', 'people coming', 'Going']), ('/visitors/abc123', [])],
      'vendor': [('/help', ['Service provider guide', 'My schedule']), ('/dashboard', ['Need your reply', 'Waiting for your reply']), ('/work', ['Waiting for your reply', 'No power in bedroom', 'Accept']), ('/work/setup', ['Working hours', 'Days off', 'Slot length']), ('/services/requests/r1', ['Progress'])],
      'society_admin': [('/help', ['Society admin guide', 'Duty roster']), ('/documents', ['Add document', 'Audit draft', 'Office only']), ('/votes', ['New vote', 'Install solar panels?']), ('/upkeep', ['Add job', 'Clean overhead water tanks']), ('/roster', ['Add shifts', 'Gate Guard', 'overnight']), ('/dashboard', ['Approve people', 'Duty roster']), ('/admin/services', ['Ravi Kumar', 'Verified']), ('/accounts', ['Add expense', 'Lift service']), ('/emergency', ['Medical emergency', 'I am responding']), ('/admin/societies', [])],
      'security': [('/help', ['Security guard guide', 'Gate console']), ('/my-shifts', ['My shifts', 'Clock in', 'overnight']), ('/upkeep', ['Mark done']), ('/documents', ['Society bylaws 2026']), ('/dashboard', ['Gate console', 'My shifts']), ('/daily-help', ['Gate check']), ('/emergency', ['Medical emergency'])],
      'staff': [('/dashboard', ['My shifts', 'Upkeep']), ('/my-shifts', ['Clock in']), ('/upkeep', ['Mark done']), ('/help', ['Staff guide']), ('/documents', ['Society bylaws 2026'])],
      'super_admin': [('/help', ['Platform admin guide', 'Societies']), ('/roster', ['Society', 'Green Heights', 'Add shifts']), ('/votes', ['Green Heights', 'New vote']), ('/documents', ['Green Heights', 'Add document']), ('/upkeep', ['Green Heights', 'Add job'])],
    }
    for role, pages in plans.items():
        e, r = run(role, pages)
        allerr += e
        for x in r: print(x)
    print('\n--- PROBLEMS ---')
    print('\n'.join(allerr) or 'none')
