const mongoose = require('mongoose');

const KINDS = ['police', 'fire', 'ambulance', 'hospital', 'security', 'management', 'utility', 'other'];

const schema = new mongoose.Schema(
  {
    societyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Society', required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    kind: { type: String, enum: KINDS, default: 'other' },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    note: { type: String, trim: true, maxlength: 120, default: '' },
    sortOrder: { type: Number, default: 0 }
  },
  { timestamps: true }
);

schema.index({ societyId: 1, sortOrder: 1 });

module.exports = mongoose.model('EmergencyContact', schema);
module.exports.KINDS = KINDS;
