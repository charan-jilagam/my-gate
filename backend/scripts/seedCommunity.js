// Sample data for the home-services marketplace and the community features.
// Pure builders: they return unsaved documents, so a test can check every one against its schema without a database.

const mongoose = require('mongoose');
const ServiceProvider = require('../models/ServiceProvider');
const ServiceRequest = require('../models/ServiceRequest');
const Post = require('../models/Post');
const EmergencyContact = require('../models/EmergencyContact');
const DailyHelp = require('../models/DailyHelp');
const HelpAttendance = require('../models/HelpAttendance');
const Expense = require('../models/Expense');
const { generateStartOtp } = require('../utils/serviceFlow');
const { DEFAULT_TZ, todayIn, addDays, zonedToUtc } = require('./../utils/timezone');
const { labelOf } = require('../utils/serviceCatalog');

const oid = () => new mongoose.Types.ObjectId();
const pick = (arr, i) => arr[i % arr.length];

// Vendors created for each society. The seed script creates the User accounts from this list.
const VENDORS = [
  { name: 'Ravi Kumar', categories: ['plumber'], visitCharge: 250, years: 12, bio: 'Leaks, taps, geysers and bathroom fittings. Same-day visits.', verified: true },
  { name: 'Suresh Electricals', categories: ['electrician', 'ac_repair'], visitCharge: 300, years: 9, bio: 'Wiring, switchboards, fans and AC servicing.', verified: true, autoAccept: true },
  { name: 'Mohan Singh', categories: ['carpenter', 'painter'], visitCharge: 200, years: 15, bio: 'Furniture repair, wardrobes, door fixing and touch-up painting.', verified: false },
  { name: 'Clean Nest Services', categories: ['cleaning', 'pest_control'], visitCharge: 0, years: 5, bio: 'Deep cleaning and pest control with safe products.', verified: true }
];

// Email and phone are derived from the society id, so two societies never clash on the unique fields.
const vendorUserData = (society, i) => {
  const tag = String(society._id).slice(-6);
  return {
    name: VENDORS[i].name,
    email: `vendor${i + 1}.${tag.slice(-4)}@example.com`,
    password: 'vendor123',
    phone: `98${String(parseInt(tag, 16) % 1000000).padStart(6, '0')}${String(i).padStart(2, '0')}`,
    role: 'vendor',
    societyId: society._id,
    isApproved: true,
    isActive: true
  };
};

const at = (date, hm, tz) => zonedToUtc(date, hm, tz);

/**
 * @param {object} ctx
 * @param {object} ctx.society
 * @param {Array}  ctx.vendorUsers     saved vendor Users, in VENDORS order
 * @param {Array}  ctx.residents       approved residents of this society
 * @param {object} ctx.admin           society admin
 * @param {Array}  ctx.guards
 * @param {Array}  ctx.notices         saved notices of this society (events get RSVPs)
 */
const buildCommunitySeed = ({ society, vendorUsers, residents, admin, now = new Date() }) => {
  const tz = society.timezone || DEFAULT_TZ;
  const today = todayIn(tz, now);
  const out = { providers: [], requests: [], posts: [], contacts: [], helpers: [], attendance: [], expenses: [], rsvps: [] };
  if (!residents.length) return out;

  // ---- Vendors and their schedules
  vendorUsers.forEach((user, i) => {
    const v = VENDORS[i];
    out.providers.push(
      new ServiceProvider({
        _id: oid(),
        userId: user._id,
        societyId: society._id,
        categories: v.categories,
        bio: v.bio,
        experienceYears: v.years,
        visitCharge: v.visitCharge,
        priceNote: 'Parts and materials are extra.',
        slotMinutes: i === 3 ? 120 : 60,
        breakTime: { enabled: true, start: '13:00', end: '14:00' },
        weeklySchedule: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, enabled: day !== 0 && !(i === 2 && day === 6), start: '09:00', end: i === 3 ? '17:00' : '19:00' })),
        minNoticeMinutes: 120,
        maxAdvanceDays: 14,
        autoAccept: !!v.autoAccept,
        isVerified: v.verified
      })
    );
  });

  // ---- Bookings in every state. Each uses a different vendor/time so no two collide on the unique slot index.
  const jobs = [
    { v: 0, who: 0, title: 'Kitchen tap is leaking', days: -6, time: '10:00', status: 'completed', amount: 650, rating: 5, review: 'Quick, polite and fixed it in half an hour.' },
    { v: 1, who: 1, title: 'Bedroom fan makes noise', days: -3, time: '11:00', status: 'completed', amount: 450, rating: 4, review: 'Good work. Came a bit late.' },
    { v: 0, who: 2, title: 'Bathroom flush not working', days: -2, time: '15:00', status: 'completed', amount: 900, rating: 5, review: '' },
    { v: 2, who: 0, title: 'Wardrobe door off its hinge', days: 1, time: '10:00', status: 'confirmed' },
    { v: 1, who: 1, title: 'AC not cooling', days: 1, time: '16:00', status: 'confirmed', urgency: 'urgent' },
    { v: 0, who: 3, title: 'Water heater leaking', days: 2, time: '09:00', status: 'requested', urgency: 'urgent' },
    { v: 3, who: 2, title: 'Deep clean 2BHK', days: 3, time: '09:00', status: 'requested' },
    { v: 2, who: 1, title: 'Touch-up paint in hall', days: -4, time: '10:00', status: 'cancelled', cancelledBy: 'resident', cancelReason: 'Plans changed' },
    { v: 1, who: 0, title: 'Install ceiling fan', days: 2, time: '12:00', status: 'declined', declineReason: 'Fully booked that day' }
  ];
  jobs.forEach((j, n) => {
    const provider = out.providers[j.v];
    const user = vendorUsers[j.v];
    const resident = pick(residents, j.who);
    // Move to the nearest day the vendor actually works, in the direction of the offset.
    let date = addDays(today, j.days);
    for (let guard = 0; guard < 7 && !provider.weeklySchedule.find((d) => d.day === new Date(`${date}T00:00:00Z`).getUTCDay()).enabled; guard++) {
      date = addDays(date, j.days < 0 ? -1 : 1);
    }
    const [h, m] = j.time.split(':').map(Number);
    const slot = provider.slotMinutes;
    const endMin = h * 60 + m + slot;
    const end = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
    const startAt = at(date, j.time, tz);
    const done = j.status === 'completed';
    out.requests.push(
      new ServiceRequest({
        _id: oid(),
        societyId: society._id,
        residentId: resident._id,
        providerId: provider._id,
        providerUserId: user._id,
        category: provider.categories[0],
        title: j.title,
        description: `${labelOf(provider.categories[0])} visit. ${j.title}.`,
        urgency: j.urgency || 'normal',
        flatNo: resident.flatNo,
        block: resident.block,
        date,
        startTime: j.time,
        endTime: end,
        startAt,
        endAt: at(date, end, tz),
        status: j.status,
        statusHistory: [{ status: 'requested', at: new Date(startAt.getTime() - 86400000) }, ...(j.status !== 'requested' ? [{ status: j.status, at: new Date(startAt.getTime() - 3600000), note: j.cancelReason || j.declineReason }] : [])],
        startOtp: generateStartOtp(),
        visitCharge: provider.visitCharge,
        finalAmount: done ? j.amount : undefined,
        workSummary: done ? 'Work completed and tested.' : undefined,
        startedAt: done ? startAt : undefined,
        completedAt: done ? new Date(startAt.getTime() + 3600000) : undefined,
        paymentStatus: done ? 'paid' : 'unpaid',
        paymentMethod: done ? 'upi' : undefined,
        paidAt: done ? new Date(startAt.getTime() + 3700000) : undefined,
        rating: done && j.rating ? j.rating : undefined,
        review: done && j.review ? j.review : undefined,
        reviewedAt: done && j.rating ? new Date(startAt.getTime() + 7200000) : undefined,
        cancelledBy: j.cancelledBy,
        cancelReason: j.cancelReason,
        cancelledAt: j.cancelledBy ? new Date(startAt.getTime() - 7200000) : undefined,
        declineReason: j.declineReason
      })
    );
    void n;
  });

  // Ratings and job counts on the vendor profiles match the completed jobs above.
  out.providers.forEach((p) => {
    const mine = out.requests.filter((r) => String(r.providerId) === String(p._id) && r.status === 'completed');
    const rated = mine.filter((r) => r.rating);
    p.jobsCompleted = mine.length;
    p.ratingCount = rated.length;
    p.ratingAvg = rated.length ? Math.round((rated.reduce((n, r) => n + r.rating, 0) / rated.length) * 10) / 10 : 0;
  });

  // ---- Community posts
  const posts = [
    { who: admin, cat: 'discussion', title: 'Water tank cleaning on Saturday', body: 'The overhead tanks will be cleaned between 10 AM and 2 PM. Please store water in advance.', pinned: true },
    { who: pick(residents, 0), cat: 'buy_sell', title: 'Wooden study table, good condition', body: '4 feet, two drawers. Pick up from the flat.', price: 2500, likes: 3 },
    { who: pick(residents, 1), cat: 'lost_found', title: 'Found: a bunch of keys near the lift', body: 'Three keys with a blue tag. Collect from the security desk.', resolved: false },
    { who: pick(residents, 2), cat: 'recommendation', title: 'Looking for a good maths tutor for class 8', body: 'Anyone have a tutor they trust? Evening slots preferred.' },
    { who: pick(residents, 3), cat: 'event', title: 'Sunday morning cricket, all ages welcome', body: 'We play at 7 AM on the ground behind Block B.' },
    { who: pick(residents, 0), cat: 'help', title: 'Need a ladder for an hour', body: 'Anyone have a 6 foot ladder I can borrow this evening?', resolved: true }
  ];
  posts.forEach((p) => {
    out.posts.push(
      new Post({
        _id: oid(),
        societyId: society._id,
        authorId: p.who._id,
        category: p.cat,
        title: p.title,
        body: p.body,
        price: p.price,
        isPinned: !!p.pinned,
        isResolved: !!p.resolved,
        likes: residents.slice(0, p.likes || 1).map((r) => r._id),
        comments: [{ userId: pick(residents, 4)._id, text: 'Thanks for sharing.' }]
      })
    );
  });

  // ---- Emergency contacts
  [
    ['City Police', 'police', '100', '24 hours'],
    ['Fire Brigade', 'fire', '101', ''],
    ['Ambulance', 'ambulance', '108', ''],
    ['Apollo Hospital', 'hospital', '08012345678', 'Casualty open 24 hours'],
    ['Society Security Desk', 'security', society.contactNumber || '9876543210', 'Main gate'],
    ['Society Office', 'management', society.contactNumber || '9876543210', '9 AM to 6 PM']
  ].forEach(([name, kind, phone, note], i) => out.contacts.push(new EmergencyContact({ _id: oid(), societyId: society._id, name, kind, phone, note, sortOrder: i })));

  // ---- Daily help with a few weeks of attendance
  const helpers = [
    { name: 'Lakshmi Devi', kind: 'maid', code: '482913', who: [0, 1] },
    { name: 'Raju', kind: 'driver', code: '730264', who: [2] },
    { name: 'Savitha', kind: 'cook', code: '159308', who: [0] }
  ];
  helpers.forEach((h, i) => {
    const doc = new DailyHelp({
      _id: oid(),
      societyId: society._id,
      name: h.name,
      kind: h.kind,
      phone: `9000000${i}0${i}`,
      code: h.code,
      residents: h.who.map((w) => ({ userId: pick(residents, w)._id, flat: `${pick(residents, w).block || ''}-${pick(residents, w).flatNo}` })),
      addedBy: pick(residents, h.who[0])._id
    });
    out.helpers.push(doc);
    for (let d = 1; d <= 18; d++) {
      if (d % 7 === 0) continue; // a weekly day off
      const date = addDays(today, -d);
      out.attendance.push(
        new HelpAttendance({ _id: oid(), societyId: society._id, helpId: doc._id, date, checkIn: at(date, `0${7 + (i % 2)}:15`, tz), checkOut: at(date, i === 1 ? '18:30' : '09:30', tz) })
      );
    }
  });

  // ---- Expenses for this and last month
  const thisMonth = today.slice(0, 7);
  [
    ['Security staff salaries', 'security', 85000, 'Sentinel Services'],
    ['Housekeeping contract', 'housekeeping', 42000, 'Clean Nest'],
    ['Lift annual maintenance', 'lift', 18500, 'OTIS'],
    ['Common area electricity', 'electricity', 31200, 'BESCOM'],
    ['Garden upkeep', 'garden', 9000, 'Green Thumb'],
    ['Plumbing repairs, Block A', 'repairs', 6400, 'Ravi Kumar']
  ].forEach(([title, category, amount, vendor], i) => {
    out.expenses.push(new Expense({ _id: oid(), societyId: society._id, title, category, amount, vendor, date: `${thisMonth}-${String(1 + i * 2).padStart(2, '0')}`, createdBy: admin._id }));
  });

  // ---- RSVPs for event notices
  out.rsvps = residents.slice(0, 5).map((r, i) => ({ userId: r._id, status: i === 4 ? 'maybe' : 'going', guests: i % 3 }));
  return out;
};

module.exports = { VENDORS, vendorUserData, buildCommunitySeed };
