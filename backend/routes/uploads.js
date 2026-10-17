const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const MAX_BYTES = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 }
});

// Work out the real image type from the first bytes, not from what the client claims.
const sniff = (buf) => {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' };
  if (buf.slice(0, 4).toString('ascii') === 'GIF8') return { ext: 'gif', mime: 'image/gif' };
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  return null;
};

const cloudinaryReady = () => !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

const toCloudinary = (buffer, folder) =>
  new Promise((resolve, reject) => {
    const cloudinary = require('cloudinary').v2;
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true
    });
    cloudinary.uploader
      .upload_stream({ folder, resource_type: 'image' }, (err, result) => (err ? reject(err) : resolve(result)))
      .end(buffer);
  });

// @route   POST /api/uploads
// @desc    Upload one image (field name "file"). Returns its URL.
// @access  Private
router.post('/', protect, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'That image is larger than 5 MB.' : 'The upload failed. Try again.';
      return res.status(400).json({ success: false, message });
    }
    try {
      if (!req.file) return res.status(400).json({ success: false, message: 'Choose an image to upload.' });
      const type = sniff(req.file.buffer);
      if (!type) return res.status(400).json({ success: false, message: 'Only JPG, PNG, GIF or WebP images are allowed.' });

      const name = String(req.file.originalname || 'image').replace(/[^\w.\- ]/g, '').slice(0, 80) || 'image';

      if (cloudinaryReady()) {
        const result = await toCloudinary(req.file.buffer, `mygate/${req.user.societyId || 'platform'}`);
        return res.status(201).json({ success: true, url: result.secure_url, name });
      }

      // No Cloudinary keys: keep files on this server's disk. Fine for development;
      // many hosts wipe the disk on redeploy, so configure Cloudinary for production.
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      const file = `${crypto.randomBytes(16).toString('hex')}.${type.ext}`;
      fs.writeFileSync(path.join(UPLOAD_DIR, file), req.file.buffer);
      res.status(201).json({ success: true, url: `/uploads/${file}`, name });
    } catch (e) {
      console.error('Upload error:', e.message);
      res.status(500).json({ success: false, message: 'Could not save the image.' });
    }
  });
});

// @route   POST /api/uploads/document
// @desc    Upload one PDF (field name "file") to the society's document library. Office only.
// @access  Private (admins)
const MAX_DOC_BYTES = 10 * 1024 * 1024;
const uploadDoc = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_DOC_BYTES, files: 1 } });

const toCloudinaryRaw = (buffer, folder, publicId) =>
  new Promise((resolve, reject) => {
    const cloudinary = require('cloudinary').v2;
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true
    });
    cloudinary.uploader.upload_stream({ folder, resource_type: 'raw', public_id: publicId }, (err, result) => (err ? reject(err) : resolve(result))).end(buffer);
  });

router.post('/document', protect, authorize('society_admin', 'super_admin'), (req, res) => {
  uploadDoc.single('file')(req, res, async (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'That file is larger than 10 MB.' : 'The upload failed. Try again.';
      return res.status(400).json({ success: false, message });
    }
    try {
      if (!req.file) return res.status(400).json({ success: false, message: 'Choose a PDF to upload.' });
      // Real PDFs start with "%PDF-". The name and the type the browser reports are not trusted.
      if (req.file.buffer.length < 8 || req.file.buffer.slice(0, 5).toString('ascii') !== '%PDF-') {
        return res.status(400).json({ success: false, message: 'Only PDF files can be added to the library.' });
      }
      const name = String(req.file.originalname || 'document.pdf').replace(/[^\w.\- ]/g, '').slice(0, 100) || 'document.pdf';
      const id = crypto.randomBytes(16).toString('hex');

      if (cloudinaryReady()) {
        const result = await toCloudinaryRaw(req.file.buffer, `mygate/${req.user.societyId || 'platform'}/documents`, `${id}.pdf`);
        return res.status(201).json({ success: true, url: result.secure_url, name });
      }
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      fs.writeFileSync(path.join(UPLOAD_DIR, `${id}.pdf`), req.file.buffer);
      res.status(201).json({ success: true, url: `/uploads/${id}.pdf`, name });
    } catch (e) {
      console.error('Document upload error:', e.message);
      res.status(500).json({ success: false, message: 'Could not save the document.' });
    }
  });
});

module.exports = router;
