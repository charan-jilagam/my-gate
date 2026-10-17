// Shared setup for route tests. The database is faked with mockingoose: queries return what a test says they
// should, while the real route code, validation, Mongoose schemas and hooks all run.

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-jest-'.padEnd(48, 'x');

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const mockingoose = require('mockingoose');
const supertest = require('supertest');

const { app } = require('../../server');
const User = require('../../models/User');
const Society = require('../../models/Society');
const ServiceProvider = require('../../models/ServiceProvider');
const ServiceRequest = require('../../models/ServiceRequest');
const Visitor = require('../../models/Visitor');
const Notification = require('../../models/Notification');
const { todayIn, addDays } = require('../../utils/timezone');

const oid = () => new mongoose.Types.ObjectId();
const SOCIETY_ID = oid();
const OTHER_SOCIETY_ID = oid();
const TZ = 'Asia/Kolkata';

const api = () => supertest(app);
const tokenFor = (user) => jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET);
const auth = (user) => ({ Authorization: `Bearer ${tokenFor(user)}` });

const makeUser = (over = {}) =>
  new User({
    _id: oid(),
    name: 'Asha Rao',
    email: `u${Math.random().toString(36).slice(2)}@example.com`,
    phone: '9876543210',
    role: 'resident',
    societyId: SOCIETY_ID,
    flatNo: '101',
    block: 'A',
    isApproved: true,
    isActive: true,
    ...over
  });

const makeVendor = (over = {}) => makeUser({ name: 'Ravi Kumar', role: 'vendor', phone: '9123456780', flatNo: undefined, block: undefined, ...over });

// A provider that works every day 09:00-18:00 in 60-minute slots with no break, so tests do not depend on the weekday.
const makeProvider = (vendor, over = {}) => {
  const doc = new ServiceProvider({
    _id: oid(),
    userId: vendor._id,
    societyId: vendor.societyId,
    categories: ['plumber', 'electrician'],
    visitCharge: 250,
    slotMinutes: 60,
    weeklySchedule: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, enabled: true, start: '09:00', end: '18:00' })),
    breakTime: { enabled: false },
    minNoticeMinutes: 60,
    maxAdvanceDays: 14,
    ...over
  });
  doc.userId = vendor; // behaves like a populated reference
  return doc;
};

// A date a few days ahead, always inside the booking window.
const futureDate = (days = 3) => addDays(todayIn(TZ), days);

const makeRequest = ({ resident, vendor, provider, ...over }) => {
  const date = over.date || futureDate();
  const doc = new ServiceRequest({
    _id: oid(),
    societyId: resident.societyId,
    residentId: resident._id,
    providerId: provider._id,
    providerUserId: vendor._id,
    category: 'plumber',
    title: 'Leaking kitchen tap',
    flatNo: resident.flatNo,
    block: resident.block,
    date,
    startTime: '10:00',
    endTime: '11:00',
    startAt: new Date(`${date}T04:30:00.000Z`), // 10:00 IST
    endAt: new Date(`${date}T05:30:00.000Z`),
    status: 'requested',
    startOtp: '4821',
    visitCharge: 250,
    ...over
  });
  doc.residentId = resident;
  doc.providerUserId = vendor;
  return doc;
};

// Make the fake database know these users, so the sign-in check passes for them.
const knowUsers = (...users) => {
  mockingoose(User).toReturn((query) => {
    const id = String(query.getQuery()._id);
    return users.find((u) => String(u._id) === id) || null;
  }, 'findOne');
};

const knowSociety = (over = {}) => mockingoose(Society).toReturn({ _id: SOCIETY_ID, timezone: TZ, ...over }, 'findOne');

// Every save() the routes made, in order, as the documents that were saved.
// Both doc.save() and Model.create() end up here (create goes through $save).
const savedDocs = (Model) => {
  const all = [...mongoose.Model.prototype.save.mock.contexts, ...mongoose.Model.prototype.$save.mock.contexts];
  return all.filter((doc) => doc.constructor.modelName === Model.modelName);
};

// Every updateOne() the routes issued against a model: [{ filter, update }].
const updatesTo = (Model) => {
  const { calls, contexts } = mongoose.Query.prototype.updateOne.mock;
  return calls.map((args, i) => ({ model: contexts[i].model.modelName, filter: args[0], update: args[1] })).filter((u) => u.model === Model.modelName);
};

const reset = () => {
  mockingoose.resetAll();
  mongoose.Model.prototype.save.mockClear();
  mongoose.Model.prototype.$save.mockClear();
  mongoose.Query.prototype.updateOne.mockClear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
};

module.exports = {
  mockingoose,
  mongoose,
  api,
  auth,
  oid,
  reset,
  TZ,
  SOCIETY_ID,
  OTHER_SOCIETY_ID,
  makeUser,
  makeVendor,
  makeProvider,
  makeRequest,
  knowUsers,
  knowSociety,
  savedDocs,
  updatesTo,
  futureDate,
  models: { User, Society, ServiceProvider, ServiceRequest, Visitor, Notification }
};
