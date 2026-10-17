const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  societyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Society'
  },
  type: {
    type: String,
    enum: [
      'visitor_approval',
      'delivery_approval',
      'visitor_entry',
      'delivery_entry',
      'vehicle_entry',
      'vehicle_exit',
      'payment_due',
      'payment_received',
      'complaint_update',
      'complaint_assigned',
      'notice_published',
      'booking_request',
      'booking_approved',
      'booking_rejected',
      'service_request',
      'service_update',
      'service_review',
      'sos_alert',
      'daily_help',
      'community',
      'general'
    ],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  relatedId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'relatedModel'
  },
  relatedModel: {
    type: String,
    enum: ['Visitor', 'Delivery', 'Vehicle', 'Payment', 'Complaint', 'Notice', 'Booking', 'ServiceRequest', 'EmergencyAlert', 'DailyHelp', 'Post']
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  },
  actionUrl: {
    type: String // Deep link to relevant page
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  }
}, {
  timestamps: true
});

// Indexes
notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ societyId: 1 });
notificationSchema.index({ type: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
