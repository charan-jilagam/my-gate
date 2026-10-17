const mongoose = require('mongoose');

const TYPES = ['medical', 'fire', 'security', 'other'];

const schema = new mongoose.Schema(
  {
    societyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Society', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: TYPES, default: 'other' },
    note: { type: String, trim: true, maxlength: 300, default: '' },
    flatNo: String,
    block: String,
    status: { type: String, enum: ['active', 'acknowledged', 'resolved'], default: 'active' },
    acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    acknowledgedAt: Date,
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: Date,
    resolutionNote: { type: String, maxlength: 300 },
    notifiedCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

schema.index({ societyId: 1, status: 1, createdAt: -1 });
schema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('EmergencyAlert', schema);
module.exports.TYPES = TYPES;
