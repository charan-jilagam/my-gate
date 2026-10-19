const mongoose = require('mongoose');

// One GPS point from a guard's phone. Only recorded while the guard is clocked in to a shift, and deleted automatically
// after RETENTION_DAYS, so the society never keeps a long history of where someone has been.
const RETENTION_DAYS = 14;

const schema = new mongoose.Schema({
  societyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Society', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift', required: true },
  lat: { type: Number, required: true, min: -90, max: 90 },
  lng: { type: Number, required: true, min: -180, max: 180 },
  accuracy: { type: Number, min: 0 },
  at: { type: Date, default: Date.now, expires: RETENTION_DAYS * 24 * 60 * 60 }
});

schema.index({ userId: 1, at: -1 });
schema.index({ shiftId: 1, at: 1 });

module.exports = mongoose.model('GuardLocation', schema);
module.exports.RETENTION_DAYS = RETENTION_DAYS;
