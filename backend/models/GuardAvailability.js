const mongoose = require('mongoose');

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// When a guard can work. A guard who has not filled this in counts as available at any time,
// so the auto-allocator never leaves someone out just because they have not set it up yet.
const schema = new mongoose.Schema(
  {
    societyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Society', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    // day: 0 = Sunday ... 6 = Saturday. An end earlier than the start means the window runs past midnight.
    weekly: {
      type: [
        {
          day: { type: Number, min: 0, max: 6, required: true },
          available: { type: Boolean, default: true },
          start: { type: String, match: TIME, default: '00:00' },
          end: { type: String, match: TIME, default: '23:59' }
        }
      ],
      default: []
    },
    // Whole days the guard cannot work (leave, exams, travel): YYYY-MM-DD.
    offDates: { type: [{ type: String, match: /^\d{4}-\d{2}-\d{2}$/ }], default: [] },
    note: { type: String, trim: true, maxlength: 200, default: '' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('GuardAvailability', schema);
