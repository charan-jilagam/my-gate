// Shapes service data for the API: who may see what, and which buttons each person should get.
// Pure functions, so the privacy and permission rules can be tested without a database.

const { labelOf } = require('./serviceCatalog');

const asObject = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : { ...doc });
const idOf = (value) => String((value && value._id) || value || '');
const isPopulated = (value) => value && typeof value === 'object' && !(value._bsontype === 'ObjectId' || value._bsontype === 'ObjectID') && 'name' in value;

const firstName = (name = '') => String(name).trim().split(/\s+/)[0] || '';

const flatLabel = (r) => `${r.block ? `${r.block}-` : ''}${r.flatNo || ''}`;

const WITH_CONTACT = ['confirmed', 'on_the_way', 'in_progress', 'completed'];

// What the viewer can do with this request right now.
const requestActions = ({ viewerRole, status, paymentStatus, rated, finalAmount }) => {
  const a = {};
  if (viewerRole === 'resident') {
    a.cancel = ['requested', 'confirmed', 'on_the_way'].includes(status);
    a.reschedule = ['requested', 'confirmed'].includes(status);
    a.review = status === 'completed' && !rated;
    a.payOnline = status === 'completed' && paymentStatus !== 'paid' && Number(finalAmount) >= 1;
  } else if (viewerRole === 'provider') {
    a.accept = status === 'requested';
    a.decline = status === 'requested';
    a.onTheWay = status === 'confirmed';
    a.start = ['confirmed', 'on_the_way'].includes(status);
    a.complete = status === 'in_progress';
    a.cancel = ['confirmed', 'on_the_way'].includes(status);
    a.markPaid = status === 'completed' && paymentStatus !== 'paid';
  } else if (viewerRole === 'admin') {
    a.cancel = ['requested', 'confirmed', 'on_the_way'].includes(status);
  }
  return a;
};

/**
 * @param doc     a ServiceRequest (document or plain object), with residentId and providerUserId optionally populated
 * @param viewer  { id, role } of whoever is asking
 */
const presentRequest = (doc, viewer) => {
  const r = asObject(doc);
  const isResident = idOf(r.residentId) === String(viewer.id);
  const isProvider = idOf(r.providerUserId) === String(viewer.id);
  const isAdmin = ['society_admin', 'super_admin'].includes(viewer.role);
  const viewerRole = isResident ? 'resident' : isProvider ? 'provider' : isAdmin ? 'admin' : 'none';
  const contactVisible = isAdmin || WITH_CONTACT.includes(r.status);

  const resident = isPopulated(r.residentId) ? r.residentId : null;
  const provider = isPopulated(r.providerUserId) ? r.providerUserId : null;

  const out = {
    _id: r._id,
    status: r.status,
    category: r.category,
    categoryLabel: labelOf(r.category),
    title: r.title,
    description: r.description,
    images: r.images || [],
    urgency: r.urgency,
    flat: flatLabel(r),
    date: r.date,
    startTime: r.startTime,
    endTime: r.endTime,
    startAt: r.startAt,
    endAt: r.endAt,
    resident: {
      id: idOf(r.residentId),
      name: resident ? resident.name : undefined,
      photo: resident ? resident.profilePic : undefined,
      // A vendor sees the resident's number only once the job is confirmed.
      phone: resident && (isResident || contactVisible) ? resident.phone : undefined
    },
    provider: {
      id: idOf(r.providerUserId),
      profileId: idOf(r.providerId),
      name: provider ? provider.name : undefined,
      photo: provider ? provider.profilePic : undefined,
      phone: provider && (isProvider || contactVisible) ? provider.phone : undefined
    },
    visitCharge: r.visitCharge,
    finalAmount: r.finalAmount,
    workSummary: r.workSummary,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    paymentStatus: r.paymentStatus,
    paymentMethod: r.paymentMethod,
    paidAt: r.paidAt,
    declineReason: r.declineReason,
    cancelledBy: r.cancelledBy,
    cancelReason: r.cancelReason,
    cancelledAt: r.cancelledAt,
    rating: r.rating,
    review: r.review,
    reviewedAt: r.reviewedAt,
    statusHistory: r.statusHistory || [],
    viewerRole,
    actions: requestActions({ viewerRole, status: r.status, paymentStatus: r.paymentStatus, rated: !!r.rating, finalAmount: r.finalAmount }),
    createdAt: r.createdAt
  };

  // Only the resident ever sees the start code, and only until the work begins.
  if (isResident && ['confirmed', 'on_the_way'].includes(r.status) && r.startOtp) out.startOtp = r.startOtp;
  if (isAdmin) out.otpAttempts = r.otpAttempts;
  return out;
};

// A vendor as residents see it. Never includes contact details: bookings go through the app.
const presentProvider = (p, extra = {}) => {
  const user = isPopulated(p.userId) ? p.userId : {};
  return {
    _id: p._id,
    userId: idOf(p.userId),
    name: user.name,
    photo: user.profilePic,
    categories: p.categories,
    bio: p.bio,
    experienceYears: p.experienceYears,
    visitCharge: p.visitCharge,
    priceNote: p.priceNote,
    slotMinutes: p.slotMinutes,
    maxAdvanceDays: p.maxAdvanceDays,
    acceptingJobs: p.acceptingJobs,
    autoAccept: p.autoAccept,
    isVerified: !!p.isVerified,
    rating: { avg: p.ratingAvg || 0, count: p.ratingCount || 0 },
    jobsCompleted: p.jobsCompleted || 0,
    ...extra
  };
};

// A review as other residents see it: first name and flat only.
const presentReview = (r) => ({
  rating: r.rating,
  review: r.review,
  reviewedAt: r.reviewedAt,
  category: r.category,
  categoryLabel: labelOf(r.category),
  by: isPopulated(r.residentId) ? `${firstName(r.residentId.name)}${r.residentId.flatNo ? `, ${r.residentId.block ? `${r.residentId.block}-` : ''}${r.residentId.flatNo}` : ''}` : 'Resident'
});

// "2026-10-20" -> "Tue, 20 Oct". The date is a plain calendar day, so no time zone is involved.
const humanDate = (date) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

// "14:30" -> "2:30 PM"
const humanTime = (hm) => {
  const [h, m] = hm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

module.exports = { presentRequest, presentProvider, presentReview, requestActions, firstName, flatLabel, humanDate, humanTime };
