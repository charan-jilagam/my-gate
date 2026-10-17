const mongoose = require('mongoose');

const CATEGORIES = ['bylaws', 'minutes', 'circular', 'financial', 'forms', 'insurance', 'other'];

const schema = new mongoose.Schema(
  {
    societyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Society', required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, enum: CATEGORIES, default: 'other' },
    description: { type: String, trim: true, maxlength: 400, default: '' },
    url: { type: String, required: true, maxlength: 500 }, // an uploaded PDF (/uploads/...) or an https link
    fileName: { type: String, trim: true, maxlength: 120, default: '' },
    // Who can open it: everyone in the society, or only the office.
    visibility: { type: String, enum: ['all', 'admins'], default: 'all' },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
);

schema.index({ societyId: 1, category: 1, createdAt: -1 });

module.exports = mongoose.model('SocietyDocument', schema);
module.exports.CATEGORIES = CATEGORIES;
