const mongoose = require('mongoose');

const KINDS = ['main_gate', 'tower_gate', 'patrol', 'control_room', 'housekeeping', 'garden', 'maintenance', 'other'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// A place in the society where the admin wants guards (for example "Main gate" or "Block B entrance"),
// and how many guards it needs in each part of the day. The auto-allocator fills these.
const schema = new mongoose.Schema(
  {
    societyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Society', required: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    kind: { type: String, enum: KINDS, default: 'main_gate' },
    lat: { type: Number, min: -90, max: 90 },
    lng: { type: Number, min: -180, max: 180 },
    radiusMeters: { type: Number, min: 20, max: 2000, default: 150 },
    // Parts of the day that need cover. An end earlier than the start means the slot runs past midnight.
    slots: {
      type: [
        {
          label: { type: String, trim: true, maxlength: 30, default: '' },
          start: { type: String, required: true, match: TIME },
          end: { type: String, required: true, match: TIME },
          guards: { type: Number, min: 1, max: 20, default: 1 }
        }
      ],
      default: []
    },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

schema.index({ societyId: 1, isActive: 1 });

module.exports = mongoose.model('GuardPost', schema);
module.exports.KINDS = KINDS;
