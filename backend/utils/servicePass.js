// Gate passes for home-service visits. When a booking is confirmed the vendor is added to the society's
// expected-visitor list, so the guard can let them in without a phone call to the resident.
//
// These helpers never throw: a missing gate pass must not stop a booking from going through.

const crypto = require('crypto');
const Visitor = require('../models/Visitor');
const { labelOf } = require('./serviceCatalog');

const createServicePass = async ({ request, vendor, resident }) => {
  try {
    const qrData = {
      visitorId: crypto.randomBytes(16).toString('hex'),
      residentId: String(resident._id || resident.id),
      societyId: String(request.societyId),
      timestamp: Date.now()
    };
    const visitor = await Visitor.create({
      residentId: resident._id || resident.id,
      societyId: request.societyId,
      name: vendor.name,
      phone: vendor.phone,
      purpose: 'service',
      purposeDescription: `${labelOf(request.category)}: ${request.title}`,
      flatNo: request.flatNo,
      block: request.block,
      numberOfVisitors: 1,
      qrCode: JSON.stringify(qrData),
      expectedArrival: request.startAt,
      notes: `Home service booking ${request._id}`,
      approved: true,
      approvedBy: resident._id || resident.id,
      approvedAt: new Date(),
      status: 'approved'
    });
    return visitor._id;
  } catch (error) {
    console.error('Could not create service gate pass:', error.message);
    return null;
  }
};

// Withdraws the pass, unless the vendor is already inside.
const withdrawServicePass = async (visitorId, reason = 'Service booking cancelled') => {
  if (!visitorId) return;
  try {
    const visitor = await Visitor.findById(visitorId);
    if (!visitor || visitor.status !== 'approved') return;
    visitor.status = 'rejected';
    visitor.approved = false;
    visitor.rejected = true;
    visitor.rejectedReason = reason;
    await visitor.save();
  } catch (error) {
    console.error('Could not withdraw service gate pass:', error.message);
  }
};

const moveServicePass = async (visitorId, expectedArrival) => {
  if (!visitorId) return;
  try {
    await Visitor.updateOne({ _id: visitorId, status: 'approved' }, { $set: { expectedArrival } });
  } catch (error) {
    console.error('Could not update service gate pass:', error.message);
  }
};

module.exports = { createServicePass, withdrawServicePass, moveServicePass };
