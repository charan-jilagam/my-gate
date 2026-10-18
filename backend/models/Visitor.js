const mongoose = require('mongoose');

const visitorSchema = new mongoose.Schema({
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
  name: {
    type: String,
    required: [true, 'Please provide visitor name'],
    trim: true
  },
  phone: {
    type: String,
    required: [true, 'Please provide visitor phone'],
    match: [/^[0-9]{10}$/, 'Please provide a valid phone number']
  },
  email: {
    type: String,
    lowercase: true,
    trim: true
  },
  purpose: {
    type: String,
    required: [true, 'Please provide visit purpose'],
    enum: ['personal', 'business', 'delivery', 'service', 'other'],
    default: 'personal'
  },
  purposeDescription: {
    type: String,
    trim: true
  },
  flatNo: {
    type: String,
    required: true
  },
  block: {
    type: String
  },
  numberOfVisitors: {
    type: Number,
    default: 1,
    min: 1
  },
  vehicleNumber: {
    type: String,
    trim: true
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
    enum: ['pending', 'approved', 'rejected', 'checked_in', 'checked_out'],
    default: 'pending'
  },
  expectedArrival: {
    type: Date
  },
  // Asked at the gate when the visitor goes in; the guard and the resident can see when they should be out.
  expectedExit: {
    type: Date
  },
  notes: {
    type: String
  },
  // invited: the resident invited them and they show a QR or code. walk_in: the guard logged them at the gate.
  source: {
    type: String,
    enum: ['invited', 'walk_in'],
    default: 'invited'
  },
  checkInMethod: { type: String, enum: ['code', 'manual'] },
  checkOutMethod: { type: String, enum: ['code', 'manual'] }
}, {
  timestamps: true
});

// Indexes
visitorSchema.index({ residentId: 1 });
visitorSchema.index({ societyId: 1 });
visitorSchema.index({ status: 1 });
visitorSchema.index({ createdAt: -1 });
visitorSchema.index({ qrCode: 1 });

module.exports = mongoose.model('Visitor', visitorSchema);
