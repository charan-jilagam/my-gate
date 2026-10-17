const mongoose = require('mongoose');

const CATEGORIES = ['water_tank', 'lift', 'generator', 'fire_safety', 'pest_control', 'electrical', 'plumbing', 'cleaning', 'garden', 'other'];

const logSchema = new mongoose.Schema(
  {
    doneOn: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    byName: { type: String, maxlength: 80 },
    note: { type: String, trim: true, maxlength: 300, default: '' },
    cost: { type: Number, min: 0, max: 100000000 }
  },
  { _id: true }
);

// A recurring upkeep job: "clean the water tanks every 90 days", "service the lift every 30 days".
const schema = new mongoose.Schema(
  {
    societyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Society', required: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    category: { type: String, enum: CATEGORIES, default: 'other' },
    location: { type: String, trim: true, maxlength: 80, default: '' },
    intervalDays: { type: Number, required: true, min: 1, max: 1095 },
    nextDue: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    lastDone: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    contractor: { type: String, trim: true, maxlength: 80, default: '' },
    contractorPhone: { type: String, trim: true, maxlength: 20, default: '' },
    notes: { type: String, trim: true, maxlength: 300, default: '' },
    active: { type: Boolean, default: true },
    history: [logSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
);

schema.index({ societyId: 1, active: 1, nextDue: 1 });

module.exports = mongoose.model('FacilityTask', schema);
module.exports.CATEGORIES = CATEGORIES;
