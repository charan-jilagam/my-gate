const mongoose = require('mongoose');
const { CATEGORY_KEYS } = require('../utils/serviceCatalog');
const { TIME_RE, DATE_RE } = require('../utils/timezone');
const { STATUSES, isActive } = require('../utils/serviceFlow');

// One booking of a vendor's time slot by a resident.

const serviceRequestSchema = new mongoose.Schema(
  {
    societyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Society', required: true },
    residentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceProvider', required: true },
    providerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    category: { type: String, enum: CATEGORY_KEYS, required: true },
    title: { type: String, required: [true, 'Tell the vendor what needs doing'], trim: true, minlength: 3, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    images: [{ url: String, name: String }],
    urgency: { type: String, enum: ['normal', 'urgent'], default: 'normal' },

    flatNo: { type: String, required: true },
    block: { type: String },

    // The booked slot: a calendar day and wall-clock times in the society's time zone, plus the real instants.
    date: { type: String, match: DATE_RE, required: true },
    startTime: { type: String, match: TIME_RE, required: true },
    endTime: { type: String, match: TIME_RE, required: true },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },

    status: { type: String, enum: STATUSES, default: 'requested' },
    statusHistory: [
      {
        status: String,
        at: { type: Date, default: Date.now },
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        note: String,
        _id: false
      }
    ],
    // True while the request holds its slot. A unique index on it is what stops two residents booking the same slot.
    slotActive: { type: Boolean, default: true },

    // Resident reads this out when the vendor arrives; the vendor enters it to start work.
    startOtp: { type: String, select: false },
    otpAttempts: { type: Number, default: 0 },

    visitCharge: { type: Number, default: 0 }, // snapshot of the vendor's fee when booked
    finalAmount: { type: Number, min: 0 },
    workSummary: { type: String, trim: true, maxlength: 500 },
    startedAt: Date,
    completedAt: Date,
    paymentStatus: { type: String, enum: ['unpaid', 'paid'], default: 'unpaid' },
    paymentMethod: { type: String, enum: ['cash', 'upi', 'other', 'online'] },
    paidAt: Date,
    razorpayOrderId: { type: String, select: false },
    razorpayPaymentId: { type: String, select: false },

    declineReason: { type: String, trim: true, maxlength: 200 },
    cancelledBy: { type: String, enum: ['resident', 'provider', 'admin'] },
    cancelReason: { type: String, trim: true, maxlength: 200 },
    cancelledAt: Date,

    rating: { type: Number, min: 1, max: 5 },
    review: { type: String, trim: true, maxlength: 500 },
    reviewedAt: Date,

    // The vendor's rating of the resident after the job (1 to 5), so other vendors know what to expect.
    residentRating: { type: Number, min: 1, max: 5 },
    residentReview: { type: String, trim: true, maxlength: 300 },
    residentRatedAt: Date,

    // Gate pass created for the vendor once the booking is confirmed
    visitorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Visitor' }
  },
  { timestamps: true }
);

// One active booking per vendor per start time.
serviceRequestSchema.index({ providerId: 1, startAt: 1 }, { unique: true, partialFilterExpression: { slotActive: true } });
serviceRequestSchema.index({ providerId: 1, date: 1 });
serviceRequestSchema.index({ residentId: 1, startAt: -1 });
serviceRequestSchema.index({ providerUserId: 1, startAt: 1 });
serviceRequestSchema.index({ societyId: 1, createdAt: -1 });

serviceRequestSchema.pre('validate', function holdSlot(next) {
  this.slotActive = isActive(this.status);
  next();
});

module.exports = mongoose.model('ServiceRequest', serviceRequestSchema);
