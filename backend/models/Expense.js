const mongoose = require('mongoose');

const CATEGORIES = ['security', 'housekeeping', 'electricity', 'water', 'repairs', 'lift', 'garden', 'salaries', 'events', 'insurance', 'other'];

const schema = new mongoose.Schema(
  {
    societyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Society', required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, enum: CATEGORIES, default: 'other' },
    amount: { type: Number, required: true, min: 1, max: 100000000 },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    vendor: { type: String, trim: true, maxlength: 80, default: '' },
    note: { type: String, trim: true, maxlength: 300, default: '' },
    receipt: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
);

schema.index({ societyId: 1, date: -1 });

module.exports = mongoose.model('Expense', schema);
module.exports.CATEGORIES = CATEGORIES;
