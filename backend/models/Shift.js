const mongoose = require('mongoose');

const POSTS = ['main_gate', 'tower_gate', 'patrol', 'control_room', 'housekeeping', 'garden', 'maintenance', 'other'];

// One duty slot for one guard or staff member on one day (society-local date and times).
const schema = new mongoose.Schema(
  {
    societyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Society', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    startTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    endTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    // Real instants, worked out in the society's time zone when the shift is made. A night shift ends the next day.
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    post: { type: String, enum: POSTS, default: 'main_gate' },
    // The guard post (a place the admin set up) this shift covers, when it came from one.
    postId: { type: mongoose.Schema.Types.ObjectId, ref: 'GuardPost' },
    postName: { type: String, trim: true, maxlength: 60 },
    // Made by the auto-allocator rather than typed in by the office.
    autoAllocated: { type: Boolean, default: false },
    note: { type: String, trim: true, maxlength: 200, default: '' },
    clockInAt: Date,
    clockOutAt: Date,
    // Where the guard was when they started and finished, and how far that is from the post (or the society).
    clockInLocation: { lat: Number, lng: Number, accuracy: Number, distanceM: Number, outside: Boolean },
    clockOutLocation: { lat: Number, lng: Number, accuracy: Number, distanceM: Number, outside: Boolean },
    // The newest GPS point while on duty, so the live map does not need to search the whole trail.
    lastLocation: { lat: Number, lng: Number, accuracy: Number, at: Date },
    // Set when the shift moved to another guard through an accepted swap.
    swappedAt: Date,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
);

// The same person cannot be given the same start twice.
schema.index({ userId: 1, date: 1, startTime: 1 }, { unique: true });
schema.index({ societyId: 1, date: 1 });
schema.index({ societyId: 1, startAt: 1, endAt: 1 });

// scheduled / on_duty / completed / missed, from the clock and the punches.
schema.methods.phase = function phase(now = new Date()) {
  if (this.clockOutAt) return 'completed';
  if (this.clockInAt) return 'on_duty';
  return now > this.endAt ? 'missed' : 'scheduled';
};

module.exports = mongoose.model('Shift', schema);
module.exports.POSTS = POSTS;
