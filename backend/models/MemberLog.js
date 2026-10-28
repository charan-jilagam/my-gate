const mongoose = require('mongoose');

// One gate event for a person with a permanent pass: they came in or went out.
// Name, role and flat are copied in so the history still reads correctly after an account changes.
const schema = new mongoose.Schema(
  {
    societyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Society', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    householdHeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // set for people who live in a flat
    name: { type: String, required: true },
    role: { type: String, required: true },
    relation: { type: String, default: '' },
    flatNo: { type: String, default: '' },
    block: { type: String, default: '' },
    action: { type: String, enum: ['in', 'out'], required: true },
    at: { type: Date, default: Date.now },
    scannedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: false }
);

schema.index({ userId: 1, at: -1 });
schema.index({ societyId: 1, at: -1 });
schema.index({ societyId: 1, flatNo: 1, block: 1, at: -1 });

module.exports = mongoose.model('MemberLog', schema);
