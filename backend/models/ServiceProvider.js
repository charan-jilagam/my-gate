const mongoose = require('mongoose');
const { CATEGORY_KEYS } = require('../utils/serviceCatalog');
const { TIME_RE, DATE_RE } = require('../utils/timezone');
const { SLOT_LENGTHS, defaultWeek, validateAvailability } = require('../utils/slots');

// The working profile of a vendor: what they do, what they charge and when they can be booked.
// One per vendor account. The vendor edits it; society admins can verify or suspend it.

const daySchema = new mongoose.Schema(
  {
    day: { type: Number, min: 0, max: 6, required: true }, // 0 = Sunday
    enabled: { type: Boolean, default: true },
    start: { type: String, match: TIME_RE, default: '09:00' },
    end: { type: String, match: TIME_RE, default: '18:00' }
  },
  { _id: false }
);

const serviceProviderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    societyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Society', required: true },

    categories: {
      type: [{ type: String, enum: CATEGORY_KEYS }],
      validate: [(v) => v.length >= 1 && v.length <= 5, 'Choose between one and five services']
    },
    bio: { type: String, trim: true, maxlength: 500, default: '' },
    experienceYears: { type: Number, min: 0, max: 60, default: 0 },
    visitCharge: { type: Number, min: 0, max: 100000, default: 0 }, // fixed fee to come and look, in rupees
    priceNote: { type: String, trim: true, maxlength: 160, default: '' }, // e.g. "Parts and materials extra"

    // Availability
    slotMinutes: { type: Number, enum: SLOT_LENGTHS, default: 60 },
    weeklySchedule: { type: [daySchema], default: defaultWeek },
    breakTime: {
      enabled: { type: Boolean, default: false },
      start: { type: String, match: TIME_RE, default: '13:00' },
      end: { type: String, match: TIME_RE, default: '14:00' }
    },
    timeOff: {
      type: [
        new mongoose.Schema(
          { date: { type: String, match: DATE_RE, required: true }, reason: { type: String, trim: true, maxlength: 80 } },
          { _id: false }
        )
      ],
      default: []
    },
    minNoticeMinutes: { type: Number, min: 0, max: 1440, default: 60 },
    maxAdvanceDays: { type: Number, min: 1, max: 60, default: 14 },
    acceptingJobs: { type: Boolean, default: true }, // the vendor's own pause switch
    autoAccept: { type: Boolean, default: false }, // confirm bookings without waiting for the vendor

    // Set by society admins
    isVerified: { type: Boolean, default: false }, // identity and background checked
    isActive: { type: Boolean, default: true }, // false hides the vendor from residents

    // Maintained by the service request routes
    ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
    jobsCompleted: { type: Number, default: 0, min: 0 }
  },
  { timestamps: true }
);

serviceProviderSchema.index({ societyId: 1, isActive: 1 });
serviceProviderSchema.index({ categories: 1 });

serviceProviderSchema.pre('validate', function checkAvailability(next) {
  const problems = validateAvailability({
    weeklySchedule: this.weeklySchedule.map((d) => d.toObject()),
    breakTime: this.breakTime && this.breakTime.toObject ? this.breakTime.toObject() : this.breakTime,
    slotMinutes: this.slotMinutes,
    timeOff: this.timeOff.map((t) => t.toObject())
  });
  if (problems.length) this.invalidate('weeklySchedule', problems[0]);
  next();
});

module.exports = mongoose.model('ServiceProvider', serviceProviderSchema);
