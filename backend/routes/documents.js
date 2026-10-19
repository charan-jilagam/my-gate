const express = require('express');
const router = express.Router();
const { body, query } = require('express-validator');
const SocietyDocument = require('../models/SocietyDocument');
const User = require('../models/User');
const { protect, authorize, scopeToSociety } = require('../middleware/auth');
const { safeNotifyMany } = require('../utils/safeNotify');
const { fail, invalid, serverError, isAdminRole, societyFor, isSafeUrl, paging } = require('../utils/routeKit');

router.param('id', scopeToSociety(SocietyDocument));

const ADMINS = ['society_admin', 'super_admin'];
const READERS = ['resident', 'security', 'guard_admin', 'staff', ...ADMINS];

const present = (d) => ({
  _id: d._id,
  title: d.title,
  category: d.category,
  description: d.description,
  url: d.url,
  fileName: d.fileName,
  visibility: d.visibility,
  createdAt: d.createdAt
});

const rules = [
  body('title').trim().isLength({ min: 2, max: 120 }).withMessage('Give the document a title'),
  body('category').optional().isIn(SocietyDocument.CATEGORIES).withMessage('Unknown category'),
  body('description').optional().isString().isLength({ max: 400 }).withMessage('Keep the description under 400 characters'),
  body('url').custom(isSafeUrl).withMessage('Upload a PDF or paste an https link'),
  body('fileName').optional().isString().isLength({ max: 120 }),
  body('visibility').optional().isIn(['all', 'admins']).withMessage('Visibility must be all or admins')
];

// @route   GET /api/documents?category=&q=
// @desc    The society's library. Everyone sees "all" documents; the office also sees office-only ones.
router.get('/', protect, authorize(...READERS), [query('category').optional().isIn(SocietyDocument.CATEGORIES), query('q').optional().isString().isLength({ max: 60 })], async (req, res) => {
  try {
    if (invalid(req, res)) return undefined;
    const societyId = societyFor(req);
    if (!societyId) return res.json({ success: true, documents: [] });
    const filter = { societyId };
    if (!isAdminRole(req.user)) filter.visibility = 'all';
    if (req.query.category) filter.category = req.query.category;
    if (req.query.q) filter.title = { $regex: String(req.query.q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    const { limit, skip } = paging(req, { max: 100, fallback: 100 });
    const docs = await SocietyDocument.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
    res.json({ success: true, documents: docs.map(present) });
    return undefined;
  } catch (error) {
    return serverError(res, error, 'List documents');
  }
});

// @route   POST /api/documents
router.post('/', protect, authorize(...ADMINS), [...rules, body('notify').optional().isBoolean()], async (req, res) => {
  try {
    if (invalid(req, res)) return undefined;
    const societyId = societyFor(req);
    if (!societyId) return fail(res, 400, 'Choose a society first.');
    const { title, category, description, url, fileName, visibility, notify } = req.body;
    const doc = await SocietyDocument.create({ societyId, title, category, description, url, fileName, visibility: visibility || 'all', uploadedBy: req.user.id });

    if (notify && doc.visibility === 'all') {
      try {
        const people = await User.find({ societyId, role: 'resident', isApproved: true, isActive: true }).select('_id').lean();
        await safeNotifyMany(req.app.get('io'), people.map((p) => p._id), {
          societyId,
          type: 'document',
          title: 'New document',
          message: `${doc.title} was added to the society library.`,
          relatedId: doc._id,
          relatedModel: 'SocietyDocument',
          actionUrl: '/documents'
        });
      } catch (e) {
        console.error('Document notice failed:', e.message); // the document is saved; telling people is best effort
      }
    }
    res.status(201).json({ success: true, document: present(doc), message: 'Document added' });
    return undefined;
  } catch (error) {
    if (error.name === 'ValidationError') return fail(res, 400, Object.values(error.errors)[0].message);
    return serverError(res, error, 'Create document');
  }
});

// @route   PUT /api/documents/:id
router.put('/:id', protect, authorize(...ADMINS), rules, async (req, res) => {
  try {
    if (invalid(req, res)) return undefined;
    const doc = await SocietyDocument.findById(req.params.id);
    if (!doc) return fail(res, 404, 'Document not found');
    ['title', 'category', 'description', 'url', 'fileName', 'visibility'].forEach((k) => {
      if (req.body[k] !== undefined) doc[k] = req.body[k];
    });
    await doc.save();
    res.json({ success: true, document: present(doc), message: 'Document saved' });
    return undefined;
  } catch (error) {
    if (error.name === 'ValidationError') return fail(res, 400, Object.values(error.errors)[0].message);
    return serverError(res, error, 'Update document');
  }
});

// @route   DELETE /api/documents/:id
router.delete('/:id', protect, authorize(...ADMINS), async (req, res) => {
  try {
    const doc = await SocietyDocument.findById(req.params.id).select('_id');
    if (!doc) return fail(res, 404, 'Document not found');
    await SocietyDocument.deleteOne({ _id: doc._id });
    res.json({ success: true, message: 'Document removed' });
    return undefined;
  } catch (error) {
    return serverError(res, error, 'Delete document');
  }
});

module.exports = router;
