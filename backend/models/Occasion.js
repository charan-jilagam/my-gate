const mongoose = require('mongoose');

const KINDS = ['festival', 'celebration', 'cultural', 'sports', 'community', 'meeting', 'achievement', 'other'];

// A festival, celebration, match or get-together the society wants to remember: details plus photos.
const schema = new mongoose.Schema(
  {
    societyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Society', required: true },
    title: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    kind: { type: String, enum: KINDS, default: 'celebration' },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    // Society-local calendar days (YYYY-MM-DD), so a date never shifts with the viewer's time zone.
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    endDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    venue: { type: String, trim: true, maxlength: 120, default: '' },
    hostedBy: { type: String, trim: true, maxlength: 120, default: '' },
    attendees: { type: Number, min: 0, max: 100000 },
    // Short lines worth remembering: "Rangoli contest won by Block B", "120 kids in the fancy dress".
    highlights: { type: [{ type: String, trim: true, maxlength: 140 }], default: [] },
    // The first photo is the cover.
    photos: {
      type: [new mongoose.Schema({ url: { type: String, required: true, maxlength: 500 }, caption: { type: String, trim: true, maxlength: 140, default: '' } }, { _id: false })],
      default: []
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
);

schema.index({ societyId: 1, date: -1 });

module.exports = mongoose.model('Occasion', schema);
module.exports.KINDS = KINDS;
