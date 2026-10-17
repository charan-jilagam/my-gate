const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  residentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  societyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Society',
    required: true
  },
  amenity: {
    type: String,
    required: [true, 'Please provide amenity name']
  },
  amenityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Society.amenities'
  },
  dateStr: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ }, // the society-local day, e.g. 2026-10-20
  slotDate: {
    type: Date,
    required: [true, 'Please provide booking date']
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    required: true
  },
  numberOfGuests: {
    type: Number,
    default: 0,
    min: 0
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'cancelled', 'completed'],
    default: 'pending'
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: {
    type: Date
  },
  rejectedReason: {
    type: String
  },
  amount: {
    type: Number,
    default: 0
  },
  paymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment'
  },
  notes: {
    type: String
  },
  flatNo: {
    type: String,
    required: true
  },
  block: {
    type: String
  },
  cancellationReason: {
    type: String
  },
  cancelledAt: {
    type: Date
  },
  // One key per slot while the booking is pending or approved, e.g. "<society>|Clubhouse|2026-10-20|18:00".
  // A unique index on these keys is what stops two people holding the same slot.
  slotKeys: {
    type: [String],
    default: []
  }
}, {
  timestamps: true
});

// Indexes
bookingSchema.index({ residentId: 1 });
bookingSchema.index({ societyId: 1 });
bookingSchema.index({ amenity: 1 });
bookingSchema.index({ slotDate: 1 });
bookingSchema.index({ status: 1 });
bookingSchema.index({ startTime: 1, endTime: 1 });

// Prevent double booking
bookingSchema.index({ amenity: 1, startTime: 1, endTime: 1 });

bookingSchema.index({ slotKeys: 1 }, { unique: true, partialFilterExpression: { 'slotKeys.0': { $exists: true } } });

// A booking that is no longer pending or approved gives its slots back.
bookingSchema.pre('validate', function releaseSlots(next) {
  if (!['pending', 'approved'].includes(this.status)) this.slotKeys = [];
  next();
});

module.exports = mongoose.model('Booking', bookingSchema);
