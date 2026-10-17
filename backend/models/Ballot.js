const mongoose = require('mongoose');

// One row per vote. The voter is stored only as a one-way hash, so the API (and anyone reading results)
// can say *that* a flat voted, never *what* it voted. The unique index is what stops a second vote.
const schema = new mongoose.Schema(
  {
    electionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Election', required: true },
    societyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Society', required: true },
    voterKey: { type: String, required: true },
    optionId: { type: mongoose.Schema.Types.ObjectId, required: true }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

schema.index({ electionId: 1, voterKey: 1 }, { unique: true });

module.exports = mongoose.model('Ballot', schema);
