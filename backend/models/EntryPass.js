const mongoose = require('mongoose');

// A permanent entry pass for one person (family member, head of the house, guard, staff, admin ...).
// The QR holds only the secret code; whoever scans it sees the person's details from the live account, so the pass
// never goes out of date. Regenerating swaps the code and the old QR stops working straight away.
const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    societyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Society', required: true },
    code: { type: String, required: true, unique: true, match: /^[a-f0-9]{16}$/ },
    version: { type: Number, default: 1 },
    regeneratedAt: { type: Date },
    regeneratedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

schema.index({ societyId: 1 });

module.exports = mongoose.model('EntryPass', schema);
