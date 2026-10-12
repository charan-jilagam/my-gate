const mongoose = require('mongoose');

const deliverySchema = new mongoose.Schema({
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
  deliveryPersonName: {
    type: String,
    required: [true, 'Please provide delivery person name'],
    trim: true
  },
  deliveryPersonPhone: {
    type: String,
    required: [true, 'Please provide delivery person phone'],
    match: [/^[0-9]{10}$/, 'Please provide a valid phone number']
  },
  company: {
    type: String,
    trim: true
  },
  trackingNumber: {
    type: String,
    trim: true
  },
  items: [{
    description: { type: String, required: true },
    quantity: { type: Number, default: 1 },
    value: Number
  }],
  flatNo: {
    type: String,
    required: true
  },
  block: {
    type: String
  },
  approved: {
    type: Boolean,
    default: false
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: {
    type: Date
  },
  rejected: {
    type: Boolean,
    default: false
  },
  rejectedReason: {
    type: String
  },
  qrCode: {
    type: String,
    unique: true,
    sparse: true
  },
  entryTime: {
    type: Date
  },
  exitTime: {
    type: Date
  },
  receivedAt: {
    type: Date
  },
  receivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  entryPhoto: {
    type: String
  },
  exitPhoto: {
    type: String
  },
  loggedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'in_transit', 'delivered', 'returned'],
    default: 'pending'
  },
  expectedArrival: {
    type: Date
  },
  notes: {
    type: String
  },
  otp: {
    type: String,
    length: 6,
    select: false // never sent to guards or admins
  },
  otpExpires: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes
deliverySchema.index({ residentId: 1 });
deliverySchema.index({ societyId: 1 });
deliverySchema.index({ status: 1 });
deliverySchema.index({ createdAt: -1 });
deliverySchema.index({ qrCode: 1 });
deliverySchema.index({ trackingNumber: 1 });

module.exports = mongoose.model('Delivery', deliverySchema);
