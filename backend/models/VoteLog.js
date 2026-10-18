const mongoose = require('mongoose');

// Who has voted in an election, kept apart from the ballots. It says *that* a person or flat took part,
// never which option they picked, and it has no link back to a ballot row, so the office can chase turnout
// while the choice stays secret.
const schema = new mongoose.Schema(
  {
    electionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Election', required: true },
    societyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Society', required: true },
    voterKey: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, trim: true },
    flat: { type: String, trim: true },
    votedAt: { type: Date, default: Date.now }
  },
  { timestamps: false }
);

schema.index({ electionId: 1, voterKey: 1 }, { unique: true });

module.exports = mongoose.model('VoteLog', schema);
