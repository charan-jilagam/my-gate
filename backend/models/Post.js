const mongoose = require('mongoose');

const CATEGORIES = ['discussion', 'help', 'buy_sell', 'lost_found', 'recommendation', 'event'];

const postSchema = new mongoose.Schema(
  {
    societyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Society', required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String, enum: CATEGORIES, default: 'discussion' },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, trim: true, maxlength: 2000, default: '' },
    images: { type: [{ url: String, name: String, _id: false }], default: [], validate: [(v) => v.length <= 4, 'At most 4 photos'] },
    price: { type: Number, min: 0, max: 10000000 }, // for buy_sell
    isPinned: { type: Boolean, default: false },
    isResolved: { type: Boolean, default: false }, // sold, found, answered
    isHidden: { type: Boolean, default: false }, // removed from the feed after reports or by an admin
    likes: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },
    comments: {
      type: [
        new mongoose.Schema(
          {
            userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
            text: { type: String, required: true, trim: true, maxlength: 500 }
          },
          { timestamps: { createdAt: true, updatedAt: false } }
        )
      ],
      default: [],
      validate: [(v) => v.length <= 300, 'This discussion is full']
    },
    reports: {
      type: [new mongoose.Schema({ userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, reason: { type: String, maxlength: 200 } }, { _id: false })],
      default: []
    }
  },
  { timestamps: true }
);

postSchema.index({ societyId: 1, isHidden: 1, isPinned: -1, createdAt: -1 });
postSchema.index({ societyId: 1, category: 1 });

module.exports = mongoose.model('Post', postSchema);
module.exports.CATEGORIES = CATEGORIES;
