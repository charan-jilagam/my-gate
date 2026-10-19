const mongoose = require('mongoose');

const STATUSES = ['pending', 'accepted', 'declined', 'cancelled', 'expired'];

// "I will take your shift if you take mine." Nothing changes on the roster until the other guard accepts.
const schema = new mongoose.Schema(
  {
    societyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Society', required: true },
    requesterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // The requester's shift, which the target would take over...
    requesterShiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift', required: true },
    // ...in exchange for the target's shift, which the requester would take over.
    targetShiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift', required: true },
    reason: { type: String, trim: true, maxlength: 200, default: '' },
    status: { type: String, enum: STATUSES, default: 'pending' },
    decidedAt: Date,
    declineNote: { type: String, trim: true, maxlength: 200, default: '' }
  },
  { timestamps: true }
);

schema.index({ societyId: 1, status: 1, createdAt: -1 });
schema.index({ requesterId: 1, status: 1 });
schema.index({ targetId: 1, status: 1 });
schema.index({ requesterShiftId: 1, status: 1 });
schema.index({ targetShiftId: 1, status: 1 });

module.exports = mongoose.model('SwapRequest', schema);
module.exports.STATUSES = STATUSES;
