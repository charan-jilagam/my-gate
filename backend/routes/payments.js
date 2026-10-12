const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Payment = require('../models/Payment');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { protect, authorize } = require('../middleware/auth');
const { notifyUser } = require('../utils/notifyUser');

// Initialize Razorpay only if credentials are provided
let razorpay = null;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
} else {
  console.warn('⚠️  Razorpay credentials not configured. Payment features will be disabled.');
}

// @route   GET /api/payments/config
// @desc    Whether online payments are available, plus the public Razorpay key for checkout
// @access  Private
router.get('/config', protect, (req, res) => {
  res.json({
    success: true,
    enabled: !!razorpay,
    keyId: razorpay ? process.env.RAZORPAY_KEY_ID : null
  });
});

// @route   POST /api/payments/create-order
// @desc    Create Razorpay order
// @access  Private (Residents)
router.post('/create-order', protect, authorize('resident'), [
  body('amount').isFloat({ min: 1 }).withMessage('Amount must be at least 1'),
  body('type').isIn(['maintenance', 'fine', 'amenity_booking', 'other']).withMessage('Invalid payment type'),
  body('month').optional().matches(/^\d{4}-\d{2}$/).withMessage('Month must be in YYYY-MM format'),
  body('description').optional().trim()
], async (req, res) => {
  try {
    // Check if Razorpay is configured
    if (!razorpay) {
      return res.status(503).json({
        success: false,
        message: 'Payment gateway is not configured. Please contact administrator.'
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { amount, type, month, year, description, breakdown, dueDate } = req.body;

    // Create payment record
    const payment = await Payment.create({
      residentId: req.user.id,
      societyId: req.user.societyId,
      amount,
      type,
      month,
      year,
      description,
      breakdown,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      flatNo: req.user.flatNo,
      block: req.user.block,
      status: 'pending'
    });

    // Create Razorpay order
    const options = {
      amount: amount * 100, // Convert to paise
      currency: 'INR',
      receipt: `receipt_${payment._id}`,
      notes: {
        paymentId: payment._id.toString(),
        residentId: req.user.id.toString(),
        type
      }
    };

    const order = await razorpay.orders.create(options);

    // Update payment with order ID
    payment.razorpayOrderId = order.id;
    await payment.save();

    res.json({
      success: true,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt
      },
      paymentId: payment._id,
      keyId: process.env.RAZORPAY_KEY_ID,
      message: 'Order created successfully'
    });
  } catch (error) {
    console.error('Payment order creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   POST /api/payments/verify
// @desc    Verify Razorpay payment
// @access  Private (Residents)
router.post('/verify', protect, authorize('resident'), [
  body('razorpay_order_id').notEmpty().withMessage('Order ID is required'),
  body('razorpay_payment_id').notEmpty().withMessage('Payment ID is required'),
  body('razorpay_signature').notEmpty().withMessage('Signature is required'),
  body('paymentId').notEmpty().withMessage('Payment ID is required')
], async (req, res) => {
  try {
    // Check if Razorpay is configured
    if (!razorpay) {
      return res.status(503).json({
        success: false,
        message: 'Payment gateway is not configured. Please contact administrator.'
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      paymentId
    } = req.body;

    const payment = await Payment.findById(paymentId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    if (payment.residentId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    // Verify signature
    const generated_signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed'
      });
    }

    // Update payment
    payment.razorpayPaymentId = razorpay_payment_id;
    payment.razorpaySignature = razorpay_signature;
    payment.status = 'completed';
    payment.paidAt = new Date();
    payment.transactionId = razorpay_payment_id;

    // Generate receipt URL (in production, generate PDF)
    payment.receiptUrl = `${process.env.FRONTEND_URL}/receipts/${payment._id}`;

    await payment.save();

    // Notify admins
    const io = req.app.get('io');
    if (io) {
      const User = require('../models/User');
      const admins = await User.find({
        societyId: req.user.societyId,
        role: { $in: ['society_admin', 'super_admin'] }
      });

      for (const admin of admins) {
        await notifyUser(io, admin._id, {
          societyId: req.user.societyId,
          type: 'payment_received',
          title: 'Payment Received',
          message: `${req.user.name} (${req.user.flatNo}) made a payment of ₹${payment.amount}`,
          relatedId: payment._id,
          relatedModel: 'Payment',
          actionUrl: `/payments/${payment._id}`
        });
      }

      await notifyUser(io, req.user.id, {
        societyId: req.user.societyId,
        type: 'payment_received',
        title: 'Payment Successful',
        message: `Your payment of ₹${payment.amount} has been received`,
        relatedId: payment._id,
        relatedModel: 'Payment',
        actionUrl: `/payments/${payment._id}`
      });
    }

    res.json({
      success: true,
      payment,
      message: 'Payment verified successfully'
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/payments
// @desc    Get payments
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    let query = {};

    if (req.user.role === 'resident') {
      query.residentId = req.user.id;
    } else if (req.user.role === 'super_admin') {
      // Super admin sees all payments
    } else if (req.user.role === 'society_admin') {
      query.societyId = req.user.societyId;
    }

    if (req.query.status) {
      query.status = req.query.status;
    }

    if (req.query.type) {
      query.type = req.query.type;
    }

    if (req.query.month) {
      query.month = req.query.month;
    }

    const payments = await Payment.find(query)
      .populate('residentId', 'name flatNo')
      .sort({ createdAt: -1 })
      .limit(parseInt(req.query.limit) || 50)
      .skip(parseInt(req.query.skip) || 0);

    res.json({
      success: true,
      count: payments.length,
      payments
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/payments/:id
// @desc    Get single payment
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('residentId', 'name email phone flatNo');

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    if (req.user.role === 'resident' && payment.residentId._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this payment'
      });
    }

    res.json({
      success: true,
      payment
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/payments/history/summary
// @desc    Get payment summary
// @access  Private (Residents)
router.get('/history/summary', protect, authorize('resident'), async (req, res) => {
  try {
    const payments = await Payment.find({ residentId: req.user.id });

    const summary = {
      totalPaid: payments
        .filter(p => p.status === 'completed')
        .reduce((sum, p) => sum + p.amount, 0),
      totalPending: payments
        .filter(p => p.status === 'pending')
        .reduce((sum, p) => sum + p.amount, 0),
      totalPayments: payments.length,
      completedPayments: payments.filter(p => p.status === 'completed').length,
      pendingPayments: payments.filter(p => p.status === 'pending').length
    };

    res.json({
      success: true,
      summary
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

module.exports = router;
