const mongoose = require('mongoose');

// Steps a person has walked on one day (society-local date). The walking challenge adds these up for the leaderboard.
const schema = new mongoose.Schema(
  {
    societyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Society', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    steps: { type: Number, default: 0, min: 0 },
    // Where the count came from: 'web' (counted by the app on the phone) or 'android' (the companion app, later).
    source: { type: String, enum: ['web', 'android'], default: 'web' }
  },
  { timestamps: true }
);

schema.index({ userId: 1, date: 1 }, { unique: true });
schema.index({ societyId: 1, date: 1 });

module.exports = mongoose.model('StepDay', schema);
