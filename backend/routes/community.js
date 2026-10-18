const express = require('express');
const router = express.Router();
const { body, query } = require('express-validator');
const Post = require('../models/Post');
const User = require('../models/User');
const { CATEGORIES } = Post;
const { protect, authorize, scopeToSociety } = require('../middleware/auth');
const { safeNotify, safeNotifyMany } = require('../utils/safeNotify');
const { fail, invalid, serverError, isAdminRole, flatLabel, paging, isSafeUrl } = require('../utils/routeKit');

router.param('id', scopeToSociety(Post));

const MEMBERS = ['resident', 'society_admin', 'super_admin'];
const REPORTS_TO_HIDE = 3;

const who = (u) => (u && u._id ? { id: String(u._id), name: u.name, flat: flatLabel(u), isAdmin: isAdminRole(u) } : { id: null, name: 'Former resident', flat: '', isAdmin: false });

// The shape the app receives. `me` decides what is personal (liked, mine).
const present = (post, me, { full = false } = {}) => {
  const mine = String(post.authorId && post.authorId._id ? post.authorId._id : post.authorId) === String(me.id);
  const out = {
    _id: post._id,
    category: post.category,
    title: post.title,
    body: post.body,
    images: post.images || [],
    price: post.price,
    isPinned: post.isPinned,
    isResolved: post.isResolved,
    isHidden: post.isHidden,
    author: who(post.authorId),
    likeCount: post.likes.length,
    liked: post.likes.some((l) => String(l) === String(me.id)),
    commentCount: post.comments.length,
    mine,
    canManage: mine || isAdminRole(me),
    createdAt: post.createdAt
  };
  if (isAdminRole(me)) out.reportCount = post.reports.length;
  // The office can see exactly who liked and who reported a post. Other residents only see counts.
  if (full && isAdminRole(me)) {
    out.likers = post.likes.map((u) => who(u && u._id ? u : null));
    out.reports = post.reports.map((r) => ({ by: who(r.userId && r.userId._id ? r.userId : null), reason: r.reason || '' }));
  }
  if (full) {
    out.comments = post.comments.map((c) => ({
      _id: c._id,
      text: c.text,
      createdAt: c.createdAt,
      author: who(c.userId),
      canDelete: String(c.userId && c.userId._id ? c.userId._id : c.userId) === String(me.id) || isAdminRole(me)
    }));
  }
  return out;
};

const loadFull = (id) => Post.findById(id).populate('authorId', 'name flatNo block role').populate('comments.userId', 'name flatNo block role').populate('likes', 'name flatNo block role').populate('reports.userId', 'name flatNo block role');
const idOf = (ref) => String(ref && ref._id ? ref._id : ref);
const canManage = (post, user) => idOf(post.authorId) === String(user.id) || isAdminRole(user);

// @route   GET /api/community/posts?category=&q=&scope=mine|reported
router.get(
  '/posts',
  protect,
  authorize(...MEMBERS),
  [query('category').optional().isIn(CATEGORIES).withMessage('Unknown category'), query('q').optional().isString().isLength({ max: 60 })],
  async (req, res) => {
    try {
      if (invalid(req, res)) return undefined;
      const filter = { societyId: req.user.societyId };
      if (req.user.role === 'super_admin' && req.query.societyId) filter.societyId = req.query.societyId;
      if (!filter.societyId) return res.json({ success: true, count: 0, posts: [] }); // a super admin has no society of their own
      if (req.query.category) filter.category = req.query.category;
      if (req.query.scope === 'mine') filter.authorId = req.user.id;
      if (req.query.scope === 'reported' && isAdminRole(req.user)) filter['reports.0'] = { $exists: true };
      else if (!isAdminRole(req.user)) filter.isHidden = false;
      else if (req.query.scope !== 'reported') filter.isHidden = false;
      if (req.query.q) {
        const safe = String(req.query.q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (safe) filter.$or = [{ title: new RegExp(safe, 'i') }, { body: new RegExp(safe, 'i') }];
      }

      const posts = await Post.find(filter)
        .populate('authorId', 'name flatNo block role')
        .sort({ isPinned: -1, createdAt: -1 })
        .limit(paging(req).limit)
        .skip(paging(req).skip);
      res.json({ success: true, count: posts.length, posts: posts.map((p) => present(p, req.user)) });
    } catch (error) {
      serverError(res, error, 'List posts');
    }
  }
);

// @route   POST /api/community/posts
router.post(
  '/posts',
  protect,
  authorize(...MEMBERS),
  [
    body('title').trim().isLength({ min: 3, max: 120 }).withMessage('Give your post a title (3 to 120 characters)'),
    body('body').optional().isString().isLength({ max: 2000 }).withMessage('Keep the text under 2000 characters'),
    body('category').optional().isIn(CATEGORIES).withMessage('Unknown category'),
    body('price').optional({ nullable: true }).isFloat({ min: 0, max: 10000000 }).withMessage('Enter a valid price'),
    body('images').optional().isArray({ max: 4 }).withMessage('Add at most 4 photos'),
    body('images.*.url').optional().custom(isSafeUrl).withMessage('A photo link is not valid')
  ],
  async (req, res) => {
    try {
      if (invalid(req, res)) return undefined;
      if (!req.user.societyId) return fail(res, 400, 'Choose a society first.');

      // Light spam guard: a few posts per hour.
      const recent = await Post.countDocuments({ authorId: req.user.id, createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) } });
      if (recent >= 10) return fail(res, 429, 'You have posted a lot in the last hour. Please try again later.');

      const { title, body: text, category = 'discussion', price, images } = req.body;
      const post = await Post.create({
        societyId: req.user.societyId,
        authorId: req.user.id,
        category,
        title,
        body: text || '',
        price: category === 'buy_sell' && price !== undefined && price !== null && price !== '' ? Number(price) : undefined,
        images: (images || []).filter((i) => i && typeof i.url === 'string').map((i) => ({ url: i.url, name: i.name }))
      });
      post.authorId = req.user;
      res.status(201).json({ success: true, post: present(post, req.user), message: 'Posted' });
    } catch (error) {
      if (error.name === 'ValidationError') return fail(res, 400, Object.values(error.errors)[0].message);
      return serverError(res, error, 'Create post');
    }
  }
);

// @route   GET /api/community/posts/:id
router.get('/posts/:id', protect, authorize(...MEMBERS), async (req, res) => {
  try {
    const post = await loadFull(req.params.id);
    if (!post || (post.isHidden && !isAdminRole(req.user))) return fail(res, 404, 'This post is no longer available.');
    res.json({ success: true, post: present(post, req.user, { full: true }) });
  } catch (error) {
    serverError(res, error, 'Get post');
  }
});

// @route   POST /api/community/posts/:id/like  (toggles)
router.post('/posts/:id/like', protect, authorize(...MEMBERS), async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post || post.isHidden) return fail(res, 404, 'This post is no longer available.');
    const has = post.likes.some((l) => String(l) === String(req.user.id));
    // $addToSet and $pull are idempotent, so two quick taps cannot lose or duplicate a like.
    await Post.updateOne({ _id: post._id }, has ? { $pull: { likes: req.user.id } } : { $addToSet: { likes: req.user.id } });
    const likeCount = Math.max(0, post.likes.length + (has ? -1 : 1));
    res.json({ success: true, liked: !has, likeCount });
  } catch (error) {
    serverError(res, error, 'Like post');
  }
});

// @route   POST /api/community/posts/:id/comments
router.post(
  '/posts/:id/comments',
  protect,
  authorize(...MEMBERS),
  [body('text').trim().isLength({ min: 1, max: 500 }).withMessage('Write a comment (up to 500 characters)')],
  async (req, res) => {
    try {
      if (invalid(req, res)) return undefined;
      const post = await Post.findById(req.params.id);
      if (!post || post.isHidden) return fail(res, 404, 'This post is no longer available.');
      post.comments.push({ userId: req.user.id, text: req.body.text });
      await post.save();

      // Tell the author and anyone else already in the conversation, except the commenter.
      const others = [post.authorId, ...post.comments.map((c) => c.userId)].map(idOf).filter((id) => id !== String(req.user.id));
      await safeNotifyMany(req.app.get('io'), others, {
        societyId: post.societyId,
        type: 'community',
        title: 'New reply',
        message: `${req.user.name} commented on "${post.title.slice(0, 60)}"`,
        relatedId: post._id,
        relatedModel: 'Post',
        actionUrl: `/community/${post._id}`,
        priority: 'low'
      });
      res.status(201).json({ success: true, commentCount: post.comments.length, message: 'Comment added' });
    } catch (error) {
      if (error.name === 'ValidationError') return fail(res, 400, Object.values(error.errors)[0].message);
      return serverError(res, error, 'Add comment');
    }
  }
);

// @route   DELETE /api/community/posts/:id/comments/:commentId
router.delete('/posts/:id/comments/:commentId', protect, authorize(...MEMBERS), async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return fail(res, 404, 'Post not found');
    const comment = post.comments.id(req.params.commentId);
    if (!comment) return fail(res, 404, 'Comment not found');
    if (String(comment.userId) !== String(req.user.id) && !isAdminRole(req.user)) return fail(res, 403, 'You can only delete your own comments.');
    comment.deleteOne();
    await post.save();
    res.json({ success: true, message: 'Comment deleted' });
  } catch (error) {
    serverError(res, error, 'Delete comment');
  }
});

// @route   PUT /api/community/posts/:id/resolve  (toggles: sold, found, answered)
router.put('/posts/:id/resolve', protect, authorize(...MEMBERS), async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return fail(res, 404, 'Post not found');
    if (!canManage(post, req.user)) return fail(res, 403, 'Only the author can do this.');
    post.isResolved = !post.isResolved;
    await post.save();
    res.json({ success: true, isResolved: post.isResolved });
  } catch (error) {
    serverError(res, error, 'Resolve post');
  }
});

// @route   PUT /api/community/posts/:id/pin  (admins; toggles)
router.put('/posts/:id/pin', protect, authorize('society_admin', 'super_admin'), async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return fail(res, 404, 'Post not found');
    post.isPinned = !post.isPinned;
    await post.save();
    res.json({ success: true, isPinned: post.isPinned });
  } catch (error) {
    serverError(res, error, 'Pin post');
  }
});

// @route   PUT /api/community/posts/:id/visibility  (admins; hide or restore)
router.put('/posts/:id/visibility', protect, authorize('society_admin', 'super_admin'), [body('isHidden').isBoolean()], async (req, res) => {
  try {
    if (invalid(req, res)) return undefined;
    const post = await Post.findById(req.params.id);
    if (!post) return fail(res, 404, 'Post not found');
    post.isHidden = req.body.isHidden === true || req.body.isHidden === 'true';
    if (!post.isHidden) post.reports = []; // restoring clears the reports
    await post.save();
    res.json({ success: true, isHidden: post.isHidden, message: post.isHidden ? 'Post hidden' : 'Post restored' });
  } catch (error) {
    serverError(res, error, 'Post visibility');
  }
});

// @route   POST /api/community/posts/:id/report
router.post('/posts/:id/report', protect, authorize(...MEMBERS), [body('reason').optional().isString().isLength({ max: 200 })], async (req, res) => {
  try {
    if (invalid(req, res)) return undefined;
    const post = await Post.findById(req.params.id);
    if (!post || post.isHidden) return fail(res, 404, 'This post is no longer available.');
    if (idOf(post.authorId) === String(req.user.id)) return fail(res, 400, 'You cannot report your own post.');
    if (post.reports.some((r) => String(r.userId) === String(req.user.id))) return res.json({ success: true, message: 'You already reported this post.' });

    // The filter makes the push conditional, so a double tap counts once.
    const pushed = await Post.updateOne({ _id: post._id, 'reports.userId': { $ne: req.user.id } }, { $push: { reports: { userId: req.user.id, reason: (req.body.reason || '').slice(0, 200) } } });
    if (pushed.modifiedCount === 0) return res.json({ success: true, message: 'You already reported this post.' });
    const total = post.reports.length + 1;
    const hidden = total >= REPORTS_TO_HIDE;
    if (hidden) await Post.updateOne({ _id: post._id }, { $set: { isHidden: true } });

    if (total === 1 || hidden) {
      const admins = await User.find({ societyId: post.societyId, role: 'society_admin' }).select('_id');
      await safeNotifyMany(req.app.get('io'), admins.map((a) => a._id), {
        societyId: post.societyId,
        type: 'community',
        title: hidden ? 'Post hidden after reports' : 'A post was reported',
        message: `"${post.title.slice(0, 60)}" needs a look.`,
        relatedId: post._id,
        relatedModel: 'Post',
        actionUrl: `/community/${post._id}`,
        priority: 'medium'
      });
    }
    res.json({ success: true, message: 'Thanks. The society office will look at it.' });
  } catch (error) {
    serverError(res, error, 'Report post');
  }
});

// @route   DELETE /api/community/posts/:id
router.delete('/posts/:id', protect, authorize(...MEMBERS), async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return fail(res, 404, 'Post not found');
    if (!canManage(post, req.user)) return fail(res, 403, 'Only the author or the society office can delete this.');
    await Post.deleteOne({ _id: post._id });
    res.json({ success: true, message: 'Post deleted' });
  } catch (error) {
    serverError(res, error, 'Delete post');
  }
});

module.exports = router;
