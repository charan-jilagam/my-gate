const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a name'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
  },
  password: {
    type: String,
    required: function() {
      return !this.googleId; // Password not required if OAuth
    },
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  phone: {
    type: String,
    required: [true, 'Please provide a phone number'],
    match: [/^[0-9]{10}$/, 'Please provide a valid 10-digit phone number']
  },
  role: {
    type: String,
    enum: ['super_admin', 'society_admin', 'resident', 'security', 'guard_admin', 'staff', 'vendor'],
    default: 'resident',
    required: true
  },
  societyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Society',
    required: function() {
      return this.role !== 'super_admin';
    }
  },
  flatNo: {
    type: String,
    required: function() {
      return this.role === 'resident';
    },
    trim: true
  },
  block: {
    type: String,
    trim: true
  },
  profilePic: {
    type: String,
    default: ''
  },
  googleId: {
    type: String,
    sparse: true
  },
  isApproved: {
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
  isActive: {
    type: Boolean,
    default: true
  },
  rejectedAt: {
    type: Date
  },
  rejectedReason: {
    type: String,
    trim: true
  },
  // People the user wants reached in an emergency. They add and remove these themselves in Profile.
  emergencyContacts: {
    type: [{
      name: { type: String, required: true, trim: true, maxlength: 60 },
      phone: { type: String, required: true, trim: true, maxlength: 20 },
      relation: { type: String, trim: true, maxlength: 30, default: '' },
      // Send this person a text message when the user presses SOS.
      notify: { type: Boolean, default: true }
    }],
    default: [],
    validate: { validator: (v) => v.length <= 5, message: 'You can add up to 5 emergency contacts' }
  },
  notificationPrefs: {
    push: { type: Boolean, default: true },
    sms: { type: Boolean, default: true },
    email: { type: Boolean, default: true }
  },
  pushSubscriptions: {
    type: [{
      endpoint: { type: String, required: true },
      keys: { p256dh: String, auth: String },
      addedAt: { type: Date, default: Date.now }
    }],
    select: false
  },
  // Proof of ownership. No default on purpose: accounts created before this existed have neither flag
  // and keep working, while every new account is saved with false and has to enter a code.
  emailVerified: Boolean,
  phoneVerified: Boolean,
  verifyOtp: { type: mongoose.Schema.Types.Mixed, select: false },
  loginAttempts: { type: Number, default: 0 },
  lockUntil: Date,
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  lastLogin: Date,

  // Family accounts. A family member is a resident login that belongs to the home's head: it points at the head's account,
  // shares the head's flat, and has its own photo and permanent entry pass. The head has no householdHeadId.
  householdHeadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  relation: {
    type: String,
    trim: true,
    maxlength: 30,
    default: ''
  },
  // Walking challenge: whether this person's name is shown on the society leaderboard.
  stepsOnLeaderboard: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ societyId: 1 });
userSchema.index({ role: 1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate JWT token
userSchema.methods.generateToken = function() {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    { id: this._id, role: this.role, societyId: this.societyId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

module.exports = mongoose.model('User', userSchema);
