const mongoose = require('mongoose');
const crypto = require('crypto');

// One row per vote. The voter is stored only as a one-way hash, so the API (and anyone reading results)
// can say *that* a flat voted, never *what* it voted. The unique index is what stops a second vote.
const schema = new mongoose.Schema(
  {
    // A random id and no timestamps, so a ballot cannot be matched to the moment someone voted.
    _id: { type: mongoose.Schema.Types.ObjectId, default: () => new mongoose.Types.ObjectId(crypto.randomBytes(12)) },
    electionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Election', required: true },
    societyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Society', required: true },
    voterKey: { type: String, required: true },
    optionId: { type: mongoose.Schema.Types.ObjectId, required: true }
  },
  { timestamps: false }
);

schema.index({ electionId: 1, voterKey: 1 }, { unique: true });

module.exports = mongoose.model('Ballot', schema);
