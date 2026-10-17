const crypto = require('crypto');
const h = require('./helpers/harness');
const { mockingoose, models } = h;
const { ServiceRequest, ServiceProvider } = models;
const Notification = models.Notification;
const gateway = require('../utils/gateway');

let resident;
let other;
let vendor;
let provider;
let admin;
let orders;

const sign = (orderId, paymentId, secret = 'test_secret') => crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');

const job = (over = {}) => {
  const r = h.makeRequest({ resident, vendor, provider, status: 'completed', finalAmount: 450, paymentStatus: 'unpaid', ...over });
  mockingoose(ServiceRequest).toReturn(r, 'findOne');
  return r;
};
const payOnline = (r, who = resident) => h.api().post(`/api/service-requests/${r._id}/pay-online`).set(h.auth(who)).send({});
const verify = (r, body, who = resident) => h.api().post(`/api/service-requests/${r._id}/pay-verify`).set(h.auth(who)).send(body);

beforeEach(() => {
  h.reset();
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
  process.env.RAZORPAY_KEY_SECRET = 'test_secret';
  resident = h.makeUser();
  other = h.makeUser({ name: 'Bina Shah', flatNo: '202' });
  vendor = h.makeVendor();
  provider = h.makeProvider(vendor);
  admin = h.makeUser({ role: 'society_admin', name: 'Office', flatNo: undefined, block: undefined });
  h.knowUsers(resident, other, vendor, admin);
  h.knowSociety();
  orders = { create: jest.fn().mockResolvedValue({ id: 'order_ABC', amount: 45000, currency: 'INR' }) };
  jest.spyOn(gateway, 'client').mockReturnValue({ orders });
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
});

describe('paying a completed job online', () => {
  test('creates an order for exactly the job amount, in paise, and remembers its id', async () => {
    const r = job();
    const res = await payOnline(r);
    expect(res.status).toBe(200);
    expect(orders.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 45000, currency: 'INR', receipt: `svc_${r._id}` }));
    expect(res.body).toMatchObject({ order: { id: 'order_ABC', amount: 45000 }, keyId: 'rzp_test_key' });
    const [u] = h.updatesTo(ServiceRequest);
    expect(u.update).toEqual({ $set: { razorpayOrderId: 'order_ABC' } });
    expect(u.filter.paymentStatus).toEqual({ $ne: 'paid' });
  });

  test('the amount cannot be chosen by the browser', async () => {
    const r = job();
    await h.api().post(`/api/service-requests/${r._id}/pay-online`).set(h.auth(resident)).send({ amount: 1, finalAmount: 1 });
    expect(orders.create.mock.calls[0][0].amount).toBe(45000);
  });

  test('fractions of a rupee become the right number of paise', async () => {
    const r = job({ finalAmount: 499.5 });
    await payOnline(r);
    expect(orders.create.mock.calls[0][0].amount).toBe(49950);
  });

  test('says so plainly when the society has no payment gateway', async () => {
    gateway.client.mockReturnValue(null);
    const res = await payOnline(job());
    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/Pay the vendor directly/);
  });

  test.each([
    ['not completed yet', { status: 'in_progress' }],
    ['already paid', { paymentStatus: 'paid' }],
    ['no amount', { finalAmount: 0 }]
  ])('refuses a job that is %s', async (_n, over) => {
    const res = await payOnline(job(over));
    expect(res.status).toBe(409);
    expect(orders.create).not.toHaveBeenCalled();
  });

  test('only the resident who booked can pay; the vendor and others cannot', async () => {
    const r = job();
    expect((await payOnline(r, other)).status).toBe(403);
    expect((await payOnline(r, vendor)).status).toBe(403);
    expect((await payOnline(r, admin)).status).toBe(403);
    expect(orders.create).not.toHaveBeenCalled();
  });

  test('the resident is offered "pay online" only when it makes sense', async () => {
    const r = job();
    const detail = await h.api().get(`/api/service-requests/${r._id}`).set(h.auth(resident));
    expect(detail.body.request.actions.payOnline).toBe(true);
    const asVendor = await h.api().get(`/api/service-requests/${r._id}`).set(h.auth(vendor));
    expect(asVendor.body.request.actions.payOnline).toBeUndefined();
    const paid = job({ paymentStatus: 'paid' });
    expect((await h.api().get(`/api/service-requests/${paid._id}`).set(h.auth(resident))).body.request.actions.payOnline).toBe(false);
  });
});

describe('confirming the payment', () => {
  const good = (r) => ({ razorpay_order_id: 'order_ABC', razorpay_payment_id: 'pay_123', razorpay_signature: sign('order_ABC', 'pay_123') });

  test('a correct signature for this job\'s order marks it paid online', async () => {
    const r = job({ razorpayOrderId: 'order_ABC' });
    mockingoose(ServiceRequest).toReturn(r, 'findOneAndUpdate');
    const res = await verify(r, good(r));
    expect(res.status).toBe(200);
    const [call] = h.callsTo(ServiceRequest, 'findOneAndUpdate');
    expect(call.filter.paymentStatus).toEqual({ $ne: 'paid' });
    expect(call.update.$set).toMatchObject({ paymentStatus: 'paid', paymentMethod: 'online', razorpayPaymentId: 'pay_123' });
    expect(call.update.$set.paidAt).toBeInstanceOf(Date);
    expect(h.savedDocs(Notification).some((n) => String(n.userId) === String(vendor._id) && n.title === 'Paid online')).toBe(true);
  });

  test.each([
    ['a wrong signature', (r) => ({ ...good(r), razorpay_signature: 'f'.repeat(64) })],
    ['a signature made with another secret', (r) => ({ ...good(r), razorpay_signature: sign('order_ABC', 'pay_123', 'guessed') })],
    ['a signature for a different payment id', (r) => ({ ...good(r), razorpay_payment_id: 'pay_other' })],
    ['an order that belongs to another job', (r) => ({ razorpay_order_id: 'order_XYZ', razorpay_payment_id: 'pay_123', razorpay_signature: sign('order_XYZ', 'pay_123') })],
    ['a signature of the wrong length', (r) => ({ ...good(r), razorpay_signature: 'abc' })]
  ])('refuses %s', async (_n, make) => {
    const r = job({ razorpayOrderId: 'order_ABC' });
    mockingoose(ServiceRequest).toReturn(r, 'findOneAndUpdate');
    const res = await verify(r, make(r));
    expect(res.status).toBe(400);
    expect(h.callsTo(ServiceRequest, 'findOneAndUpdate')).toHaveLength(0);
  });

  test('a job with no order started cannot be marked paid', async () => {
    const r = job();
    expect((await verify(r, good(r))).status).toBe(400);
  });

  test('missing fields are refused', async () => {
    const r = job({ razorpayOrderId: 'order_ABC' });
    expect((await verify(r, { razorpay_order_id: 'order_ABC' })).status).toBe(400);
  });

  test('replaying a good confirmation does nothing the second time', async () => {
    const r = job({ razorpayOrderId: 'order_ABC' });
    mockingoose(ServiceRequest).toReturn(null, 'findOneAndUpdate');
    expect((await verify(r, good(r))).status).toBe(409);
    const paid = job({ razorpayOrderId: 'order_ABC', paymentStatus: 'paid' });
    expect((await verify(paid, good(paid))).status).toBe(409);
  });

  test('only the resident who booked can confirm', async () => {
    const r = job({ razorpayOrderId: 'order_ABC' });
    expect((await verify(r, good(r), other)).status).toBe(403);
    expect((await verify(r, good(r), vendor)).status).toBe(403);
  });

  test('without gateway keys nothing can be confirmed, even with a signature made from an empty secret', async () => {
    delete process.env.RAZORPAY_KEY_SECRET;
    delete process.env.RAZORPAY_KEY_ID;
    const r = job({ razorpayOrderId: 'order_ABC' });
    expect((await verify(r, { razorpay_order_id: 'order_ABC', razorpay_payment_id: 'pay_123', razorpay_signature: sign('order_ABC', 'pay_123', '') })).status).toBe(503);
  });

  test('the order and payment ids are never sent back in the job details', async () => {
    const r = job({ razorpayOrderId: 'order_ABC', razorpayPaymentId: 'pay_123' });
    const res = await h.api().get(`/api/service-requests/${r._id}`).set(h.auth(resident));
    expect(JSON.stringify(res.body)).not.toMatch(/order_ABC|pay_123/);
  });
});
