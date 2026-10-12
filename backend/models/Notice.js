const mongoose = require('mongoose');

const noticeSchema = new mongoose.Schema({
  societyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Society',
    required: true
  },
  title: {
    type: String,
    required: [true, 'Please provide notice title'],
    trim: true
  },
  content: {
    type: String,
    required: [true, 'Please provide notice content']
  },
  type: {
    type: String,
    enum: ['notice', 'announcement', 'poll', 'event', 'maintenance'],
    default: 'notice'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  category: {
    type: String,
    enum: ['general', 'maintenance', 'security', 'amenities', 'billing', 'other'],
    default: 'general'
  },
  attachments: [{
    url: String,
    name: String,
    type: String
  }],
  targetAudience: {
    type: String,
    enum: ['all', 'residents', 'owners', 'tenants', 'specific_blocks', 'specific_flats'],
    default: 'all'
  },
  targetBlocks: [{
    type: String
  }],
  targetFlats: [{
    type: String
  }],
  pollOptions: [{
    option: { type: String, required: true },
    votes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  }],
  pollEndDate: {
    type: Date
  },
  eventDate: {
    type: Date
  },
  eventLocation: {
    type: String
  },
  isPublished: {
    type: Boolean,
    default: false
  },
  publishedAt: {
    type: Date
  },
  views: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    viewedAt: { type: Date, default: Date.now }
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  expiresAt: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
noticeSchema.index({ societyId: 1 });
noticeSchema.index({ type: 1 });
noticeSchema.index({ isPublished: 1 });
noticeSchema.index({ createdAt: -1 });
noticeSchema.index({ expiresAt: 1 });

module.exports = mongoose.model('Notice', noticeSchema);
