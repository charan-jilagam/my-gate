const mongoose = require('mongoose');

const optionSchema = new mongoose.Schema({ label: { type: String, required: true, trim: true, maxlength: 80 }, detail: { type: String, trim: true, maxlength: 300, default: '' } }, { _id: true });

const schema = new mongoose.Schema(
  {
    societyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Society', required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 1500, default: '' },
    // election: pick a candidate. resolution: a yes/no style decision. Both are a single choice among options.
    kind: { type: String, enum: ['election', 'resolution'], default: 'resolution' },
    options: { type: [optionSchema], validate: [(v) => v.length >= 2 && v.length <= 12, 'Give between 2 and 12 options'] },
    opensAt: { type: Date, required: true },
    closesAt: { type: Date, required: true },
    // One vote per flat keeps a household from outvoting another; one per resident lets every adult vote.
    voting: { type: String, enum: ['per_flat', 'per_resident'], default: 'per_flat' },
    cancelled: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
);

schema.index({ societyId: 1, closesAt: -1 });

// upcoming / open / closed / cancelled, from the clock.
schema.methods.phase = function phase(now = new Date()) {
  if (this.cancelled) return 'cancelled';
  if (now < this.opensAt) return 'upcoming';
  if (now >= this.closesAt) return 'closed';
  return 'open';
};

module.exports = mongoose.model('Election', schema);
