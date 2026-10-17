const mongoose = require('mongoose');

const KINDS = ['maid', 'cook', 'driver', 'nanny', 'gardener', 'cleaner', 'tutor', 'other'];

const schema = new mongoose.Schema(
  {
    societyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Society', required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, trim: true, maxlength: 20, default: '' },
    kind: { type: String, enum: KINDS, default: 'maid' },
    photo: String,
    // The code the helper shows the guard at the gate. Unique within a society.
    code: { type: String, required: true, match: /^\d{6}$/ },
    // The flats they work in. One helper can work for several households.
    residents: {
      type: [new mongoose.Schema({ userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, flat: String }, { _id: false })],
      default: []
    },
    isActive: { type: Boolean, default: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

schema.index({ societyId: 1, code: 1 }, { unique: true });
schema.index({ 'residents.userId': 1 });

module.exports = mongoose.model('DailyHelp', schema);
module.exports.KINDS = KINDS;
