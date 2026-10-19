const mongoose = require('mongoose');

const societySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide society name'],
    trim: true
  },
  address: {
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    country: { type: String, default: 'India' }
  },
  admins: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  blocks: [{
    name: { type: String, required: true },
    totalFlats: { type: Number, required: true }
  }],
  totalFlats: {
    type: Number,
    required: true
  },
  contactNumber: {
    type: String,
    required: true
  },
  email: {
    type: String,
    lowercase: true,
    trim: true
  },
  logo: {
    type: String,
    default: ''
  },
  // IANA zone name. Booking slots are worked out in this zone, not the server's.
  timezone: {
    type: String,
    default: 'Asia/Kolkata',
    validate: {
      validator: (v) => require('../utils/timezone').isValidTimeZone(v),
      message: 'Unknown time zone'
    }
  },
  // Where the society is on the map. The admin sets it; guards are measured against it (or against their post).
  location: {
    lat: { type: Number, min: -90, max: 90 },
    lng: { type: Number, min: -180, max: 180 },
    radiusMeters: { type: Number, min: 50, max: 5000, default: 300 },
    label: { type: String, trim: true, maxlength: 120, default: '' },
    // The street address of the apartment, as the admin typed it. Shown to everyone as a reference.
    address: { type: String, trim: true, maxlength: 300, default: '' }
  },
  settings: {
    visitorApprovalRequired: { type: Boolean, default: true },
    deliveryApprovalRequired: { type: Boolean, default: true },
    allowGuestEntry: { type: Boolean, default: false },
    autoApproveResidents: { type: Boolean, default: false }
  },
  amenities: [{
    name: { type: String, required: true },
    description: String,
    capacity: Number,
    bookingRequired: { type: Boolean, default: false },
    hourlyRate: { type: Number, min: 0 },
    isActive: { type: Boolean, default: true }, // false takes it off the booking screen
    openTime: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/, default: '06:00' },
    closeTime: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/, default: '22:00' },
    slotMinutes: { type: Number, enum: [30, 60, 90, 120], default: 60 },
    maxSlotsPerBooking: { type: Number, min: 1, max: 12, default: 3 },
    requiresApproval: { type: Boolean, default: true }, // false confirms bookings instantly
    maxAdvanceDays: { type: Number, min: 1, max: 90, default: 30 }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes
societySchema.index({ name: 1 });
societySchema.index({ 'address.city': 1 });

module.exports = mongoose.model('Society', societySchema);
