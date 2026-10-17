const mongoose = require('mongoose');
const User = require('../models/User');
const Society = require('../models/Society');
const Visitor = require('../models/Visitor');
const Delivery = require('../models/Delivery');
const Vehicle = require('../models/Vehicle');
const Notice = require('../models/Notice');
const Complaint = require('../models/Complaint');
const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const Notification = require('../models/Notification');
const ServiceProvider = require('../models/ServiceProvider');
const ServiceRequest = require('../models/ServiceRequest');
const Post = require('../models/Post');
const EmergencyAlert = require('../models/EmergencyAlert');
const EmergencyContact = require('../models/EmergencyContact');
const DailyHelp = require('../models/DailyHelp');
const HelpAttendance = require('../models/HelpAttendance');
const Expense = require('../models/Expense');
const { VENDORS, vendorUserData, buildCommunitySeed } = require('./seedCommunity');
require('dotenv').config();

// Dummy data generators
const randomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomDate = (start, end) => new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
const randomPhone = () => Math.floor(1000000000 + Math.random() * 9000000000).toString();

const seedData = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mygate');
    console.log('✅ MongoDB connected');

    // Clear existing data (optional - comment out if you want to keep existing data)
    console.log('🗑️  Clearing existing data...');
    await User.deleteMany({});
    await Society.deleteMany({});
    await Visitor.deleteMany({});
    await Delivery.deleteMany({});
    await Vehicle.deleteMany({});
    await Notice.deleteMany({});
    await Complaint.deleteMany({});
    await Payment.deleteMany({});
    await Booking.deleteMany({});
    await Notification.deleteMany({});
    for (const Model of [ServiceProvider, ServiceRequest, Post, EmergencyAlert, EmergencyContact, DailyHelp, HelpAttendance, Expense]) {
      await Model.deleteMany({});
    }

    // 1. Create Super Admin first (needed for society.createdBy)
    console.log('👥 Creating super admin...');
    const superAdmin = await User.create({
      name: 'Super Admin',
      email: 'superadmin@mygate.com',
      password: 'admin123',
      phone: '9999999999',
      role: 'super_admin',
      isApproved: true,
      isActive: true
    });
    console.log('✅ Super admin created');

    // 2. Create Societies (with createdBy reference)
    console.log('📦 Creating societies...');
    const societies = await Society.insertMany([
      {
        name: 'Green Valley Apartments',
        address: {
          street: '123 Main Street',
          city: 'Bangalore',
          state: 'Karnataka',
          pincode: '560001',
          country: 'India'
        },
        blocks: [
          { name: 'A Block', totalFlats: 50 },
          { name: 'B Block', totalFlats: 50 },
          { name: 'C Block', totalFlats: 40 }
        ],
        totalFlats: 140,
        contactNumber: '9876543210',
        email: 'admin@greenvalley.com',
        amenities: [
          { name: 'Swimming Pool', capacity: 20, bookingRequired: true, hourlyRate: 500 },
          { name: 'Gym', capacity: 15, bookingRequired: false },
          { name: 'Clubhouse', capacity: 100, bookingRequired: true, hourlyRate: 2000 },
          { name: 'Tennis Court', capacity: 4, bookingRequired: true, hourlyRate: 300 }
        ],
        settings: {
          visitorApprovalRequired: true,
          deliveryApprovalRequired: true,
          allowGuestEntry: false,
          autoApproveResidents: false
        },
        isActive: true,
        createdBy: superAdmin._id
      },
      {
        name: 'Sunset Heights',
        address: {
          street: '456 Park Avenue',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          country: 'India'
        },
        blocks: [
          { name: 'Tower 1', totalFlats: 60 },
          { name: 'Tower 2', totalFlats: 60 }
        ],
        totalFlats: 120,
        contactNumber: '9876543211',
        email: 'admin@sunsetheights.com',
        amenities: [
          { name: 'Swimming Pool', capacity: 25, bookingRequired: true, hourlyRate: 600 },
          { name: 'Gym', capacity: 20, bookingRequired: false },
          { name: 'Party Hall', capacity: 150, bookingRequired: true, hourlyRate: 3000 }
        ],
        settings: {
          visitorApprovalRequired: true,
          deliveryApprovalRequired: true,
          allowGuestEntry: false,
          autoApproveResidents: false
        },
        isActive: true,
        createdBy: superAdmin._id
      }
    ]);

    console.log(`✅ Created ${societies.length} societies`);

    // 3. Create Users (Society Admins, Residents, Security, Staff)
    console.log('👥 Creating users...');

    // Society Admins
    const societyAdmins = [];
    for (let i = 0; i < societies.length; i++) {
      const admin = await User.create({
        name: `Society Admin ${i + 1}`,
        email: `admin${i + 1}@society.com`,
        password: 'admin123',
        phone: randomPhone(),
        role: 'society_admin',
        societyId: societies[i]._id,
        isApproved: true,
        isActive: true
      });
      societyAdmins.push(admin);
      
      // Update society with admin
      societies[i].admins.push(admin._id);
      await societies[i].save();
    }

    // Residents
    const residents = [];
    const blocks = ['A Block', 'B Block', 'C Block', 'Tower 1', 'Tower 2'];
    const flatNumbers = ['101', '102', '201', '202', '301', '302', '401', '402', '501', '502'];

    for (let i = 0; i < 20; i++) {
      const society = randomItem(societies);
      const block = randomItem(society.blocks);
      const flatNo = randomItem(flatNumbers);
      
      const resident = await User.create({
        name: `Resident ${i + 1}`,
        email: `resident${i + 1}@example.com`,
        password: 'resident123',
        phone: randomPhone(),
        role: 'resident',
        societyId: society._id,
        flatNo: flatNo,
        block: block.name,
        isApproved: Math.random() > 0.3, // 70% approved
        isActive: true
      });
      residents.push(resident);
    }

    // Security Guards
    const securityGuards = [];
    for (let i = 0; i < 4; i++) {
      const guard = await User.create({
        name: `Security Guard ${i + 1}`,
        email: `security${i + 1}@example.com`,
        password: 'security123',
        phone: randomPhone(),
        role: 'security',
        societyId: randomItem(societies)._id,
        isApproved: true,
        isActive: true
      });
      securityGuards.push(guard);
    }

    // Staff
    const staff = [];
    for (let i = 0; i < 3; i++) {
      const staffMember = await User.create({
        name: `Staff Member ${i + 1}`,
        email: `staff${i + 1}@example.com`,
        password: 'staff123',
        phone: randomPhone(),
        role: 'staff',
        societyId: randomItem(societies)._id,
        isApproved: true,
        isActive: true
      });
      staff.push(staffMember);
    }

    console.log(`✅ Created users: 1 super admin, ${societyAdmins.length} society admins, ${residents.length} residents, ${securityGuards.length} security guards, ${staff.length} staff`);

    // 4. Create Visitors
    console.log('🚶 Creating visitors...');
    const visitorStatuses = ['pending', 'approved', 'rejected', 'checked_in', 'checked_out'];
    const purposes = ['personal', 'business', 'delivery', 'service', 'other'];
    
    const visitors = [];
    for (let i = 0; i < 30; i++) {
      const resident = randomItem(residents);
      const status = randomItem(visitorStatuses);
      const purpose = randomItem(purposes);
      const createdAt = randomDate(new Date(2024, 0, 1), new Date());
      
      const visitor = await Visitor.create({
        residentId: resident._id,
        societyId: resident.societyId,
        name: `Visitor ${i + 1}`,
        phone: randomPhone(),
        email: `visitor${i + 1}@example.com`,
        purpose: purpose,
        purposeDescription: `Visiting ${resident.name}`,
        numberOfVisitors: Math.floor(Math.random() * 3) + 1,
        flatNo: resident.flatNo,
        block: resident.block,
        approved: ['approved', 'checked_in', 'checked_out'].includes(status),
        rejected: status === 'rejected',
        status: status,
        approvedBy: status === 'approved' ? randomItem(societyAdmins)._id : undefined,
        approvedAt: status === 'approved' ? createdAt : undefined,
        entryTime: ['checked_in', 'checked_out'].includes(status) ? randomDate(createdAt, new Date()) : undefined,
        exitTime: status === 'checked_out' ? randomDate(createdAt, new Date()) : undefined,
        loggedBy: ['checked_in', 'checked_out'].includes(status) ? randomItem(securityGuards)._id : undefined,
        expectedArrival: randomDate(createdAt, new Date())
      });
      visitors.push(visitor);
    }
    console.log(`✅ Created ${visitors.length} visitors`);

    // 5. Create Deliveries
    console.log('📦 Creating deliveries...');
    const deliveryStatuses = ['pending', 'approved', 'rejected', 'in_transit', 'delivered'];
    const companies = ['Amazon', 'Flipkart', 'Swiggy', 'Zomato', 'BigBasket', 'Myntra'];
    
    const deliveries = [];
    for (let i = 0; i < 25; i++) {
      const resident = randomItem(residents);
      const status = randomItem(deliveryStatuses);
      const createdAt = randomDate(new Date(2024, 0, 1), new Date());
      
      const delivery = await Delivery.create({
        residentId: resident._id,
        societyId: resident.societyId,
        deliveryPersonName: `Delivery Person ${i + 1}`,
        deliveryPersonPhone: randomPhone(),
        company: randomItem(companies),
        trackingNumber: `TRK${Math.floor(Math.random() * 1000000)}`,
        items: [
          { description: 'Package Item 1', quantity: 1, value: Math.floor(Math.random() * 5000) + 500 },
          { description: 'Package Item 2', quantity: 2, value: Math.floor(Math.random() * 3000) + 300 }
        ],
        flatNo: resident.flatNo,
        block: resident.block,
        approved: ['approved', 'in_transit', 'delivered'].includes(status),
        rejected: status === 'rejected',
        status: status,
        approvedBy: status === 'approved' ? randomItem(societyAdmins)._id : undefined,
        approvedAt: status === 'approved' ? createdAt : undefined,
        entryTime: ['in_transit', 'delivered'].includes(status) ? randomDate(createdAt, new Date()) : undefined,
        receivedAt: status === 'delivered' ? randomDate(createdAt, new Date()) : undefined,
        receivedBy: status === 'delivered' ? resident._id : undefined,
        loggedBy: ['in_transit', 'delivered'].includes(status) ? randomItem(securityGuards)._id : undefined,
        expectedArrival: randomDate(createdAt, new Date()),
        otp: status === 'delivered' ? Math.floor(100000 + Math.random() * 900000).toString() : undefined
      });
      deliveries.push(delivery);
    }
    console.log(`✅ Created ${deliveries.length} deliveries`);

    // 6. Create Vehicles
    console.log('🚗 Creating vehicles...');
    const vehicleTypes = ['car', 'bike', 'scooter', 'bicycle'];
    const brands = ['Maruti', 'Hyundai', 'Honda', 'Toyota', 'Bajaj', 'Hero', 'TVS'];
    const colors = ['White', 'Black', 'Silver', 'Red', 'Blue'];
    
    const vehicles = [];
    for (let i = 0; i < 15; i++) {
      const resident = randomItem(residents);
      const vehicleType = randomItem(vehicleTypes);
      const isInside = Math.random() > 0.5;
      
      const vehicle = await Vehicle.create({
        residentId: resident._id,
        societyId: resident.societyId,
        vehicleNumber: `${Math.floor(Math.random() * 100)}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${Math.floor(Math.random() * 10000)}`,
        vehicleType: vehicleType,
        brand: randomItem(brands),
        model: `${vehicleType} Model ${i + 1}`,
        color: randomItem(colors),
        flatNo: resident.flatNo,
        block: resident.block,
        isRegistered: true,
        isInside: isInside,
        lastEntryTime: isInside ? randomDate(new Date(2024, 0, 1), new Date()) : undefined,
        entryLogs: isInside ? [{
          entryTime: randomDate(new Date(2024, 0, 1), new Date()),
          entryGate: 'Main Gate',
          loggedBy: randomItem(securityGuards)._id,
          purpose: 'Resident entry'
        }] : []
      });
      vehicles.push(vehicle);
    }
    console.log(`✅ Created ${vehicles.length} vehicles`);

    // 7. Create Notices
    console.log('📢 Creating notices...');
    const noticeTypes = ['notice', 'announcement', 'poll', 'event', 'maintenance'];
    const priorities = ['low', 'medium', 'high', 'urgent'];
    const categories = ['general', 'maintenance', 'security', 'amenities', 'billing'];
    
    const notices = [];
    for (let i = 0; i < 20; i++) {
      const society = randomItem(societies);
      const admin = randomItem(societyAdmins.filter(a => a.societyId.toString() === society._id.toString()));
      const type = randomItem(noticeTypes);
      
      const notice = await Notice.create({
        societyId: society._id,
        title: `${type.charAt(0).toUpperCase() + type.slice(1)} ${i + 1}: Important Update`,
        content: `This is a sample ${type} content. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`,
        type: type,
        priority: randomItem(priorities),
        category: randomItem(categories),
        targetAudience: Math.random() > 0.5 ? 'all' : 'residents',
        pollOptions: type === 'poll' ? [
          { option: 'Option A', votes: [] },
          { option: 'Option B', votes: [] },
          { option: 'Option C', votes: [] }
        ] : undefined,
        pollEndDate: type === 'poll' ? randomDate(new Date(), new Date(2024, 11, 31)) : undefined,
        eventDate: type === 'event' ? randomDate(new Date(), new Date(2024, 11, 31)) : undefined,
        eventLocation: type === 'event' ? 'Community Hall' : undefined,
        isPublished: true,
        publishedAt: randomDate(new Date(2024, 0, 1), new Date()),
        createdBy: admin._id,
        isActive: true
      });
      notices.push(notice);
    }
    console.log(`✅ Created ${notices.length} notices`);

    // 8. Create Complaints
    console.log('📝 Creating complaints...');
    const complaintCategories = ['maintenance', 'security', 'cleaning', 'amenities', 'billing', 'noise', 'parking', 'other'];
    const complaintStatuses = ['open', 'in_progress', 'resolved', 'closed'];
    
    const complaints = [];
    for (let i = 0; i < 25; i++) {
      const resident = randomItem(residents);
      const status = randomItem(complaintStatuses);
      const category = randomItem(complaintCategories);
      const createdAt = randomDate(new Date(2024, 0, 1), new Date());
      
      const complaint = await Complaint.create({
        residentId: resident._id,
        societyId: resident.societyId,
        title: `${category.charAt(0).toUpperCase() + category.slice(1)} Issue ${i + 1}`,
        description: `This is a sample complaint about ${category}. Please address this issue as soon as possible.`,
        category: category,
        priority: Math.random() > 0.7 ? 'high' : Math.random() > 0.5 ? 'medium' : 'low',
        status: status,
        assignedTo: ['in_progress', 'resolved'].includes(status) ? randomItem(staff)._id : undefined,
        assignedAt: ['in_progress', 'resolved'].includes(status) ? randomDate(createdAt, new Date()) : undefined,
        resolvedAt: ['resolved', 'closed'].includes(status) ? randomDate(createdAt, new Date()) : undefined,
        resolution: ['resolved', 'closed'].includes(status) ? 'Issue has been resolved successfully.' : undefined,
        flatNo: resident.flatNo,
        block: resident.block,
        isPublic: Math.random() > 0.7,
        updates: ['in_progress', 'resolved'].includes(status) ? [{
          message: 'Complaint is being looked into.',
          updatedBy: randomItem(staff)._id,
          updatedAt: randomDate(createdAt, new Date())
        }] : []
      });
      complaints.push(complaint);
    }
    console.log(`✅ Created ${complaints.length} complaints`);

    // 9. Create Payments
    console.log('💳 Creating payments...');
    const paymentTypes = ['maintenance', 'fine', 'amenity_booking', 'other'];
    const paymentStatuses = ['pending', 'processing', 'completed', 'failed'];
    const months = ['2024-01', '2024-02', '2024-03', '2024-04', '2024-05', '2024-06'];
    
    const payments = [];
    for (let i = 0; i < 40; i++) {
      const resident = randomItem(residents);
      const status = randomItem(paymentStatuses);
      const type = randomItem(paymentTypes);
      const month = randomItem(months);
      
      const payment = await Payment.create({
        residentId: resident._id,
        societyId: resident.societyId,
        amount: Math.floor(Math.random() * 10000) + 2000,
        type: type,
        month: type === 'maintenance' ? month : undefined,
        year: 2024,
        description: `${type.charAt(0).toUpperCase() + type.slice(1)} payment`,
        status: status,
        paymentMethod: status === 'completed' ? randomItem(['online', 'upi', 'card']) : 'online',
        razorpayOrderId: status === 'completed' ? `order_${Math.random().toString(36).substr(2, 9)}` : undefined,
        razorpayPaymentId: status === 'completed' ? `pay_${Math.random().toString(36).substr(2, 9)}` : undefined,
        transactionId: status === 'completed' ? `TXN${Math.floor(Math.random() * 1000000)}` : undefined,
        receiptUrl: status === 'completed' ? `/receipts/${Math.random().toString(36).substr(2, 9)}` : undefined,
        paidAt: status === 'completed' ? randomDate(new Date(2024, 0, 1), new Date()) : undefined,
        dueDate: randomDate(new Date(), new Date(2024, 11, 31)),
        flatNo: resident.flatNo,
        block: resident.block
      });
      payments.push(payment);
    }
    console.log(`✅ Created ${payments.length} payments`);

    // 10. Create Bookings
    console.log('📅 Creating bookings...');
    const bookingStatuses = ['pending', 'approved', 'rejected', 'cancelled', 'completed'];
    
    const bookings = [];
    for (let i = 0; i < 20; i++) {
      const resident = randomItem(residents);
      const society = societies.find(s => s._id.toString() === resident.societyId.toString());
      if (!society || !society.amenities || society.amenities.length === 0) continue;
      
      const amenity = randomItem(society.amenities);
      const status = randomItem(bookingStatuses);
      const slotDate = randomDate(new Date(), new Date(2024, 11, 31));
      const startTime = new Date(slotDate);
      startTime.setHours(Math.floor(Math.random() * 12) + 8, 0, 0, 0);
      const endTime = new Date(startTime);
      endTime.setHours(startTime.getHours() + 2);
      
      const booking = await Booking.create({
        residentId: resident._id,
        societyId: resident.societyId,
        amenity: amenity.name,
        amenityId: amenity._id || null, // Subdocuments may not have _id
        slotDate: slotDate,
        startTime: startTime,
        endTime: endTime,
        numberOfGuests: Math.floor(Math.random() * 5),
        status: status,
        approvedBy: status === 'approved' ? randomItem(societyAdmins.filter(a => a.societyId.toString() === society._id.toString()))?._id : undefined,
        approvedAt: status === 'approved' ? randomDate(slotDate, new Date()) : undefined,
        rejectedReason: status === 'rejected' ? 'Slot not available' : undefined,
        amount: amenity.hourlyRate ? amenity.hourlyRate * 2 : 0,
        flatNo: resident.flatNo,
        block: resident.block
      });
      bookings.push(booking);
    }
    console.log(`✅ Created ${bookings.length} bookings`);

    // 10b. Home services, community, daily help, emergency contacts and accounts
    console.log('🛠️  Creating home services and community data...');
    // Indexes first, so the unique slot and gate-code rules are enforced for the seed too.
    await Promise.all([ServiceRequest.init(), DailyHelp.init(), ServiceProvider.init()]);
    const counts = { vendors: 0, providers: 0, requests: 0, posts: 0, contacts: 0, helpers: 0, attendance: 0, expenses: 0 };
    for (const society of societies) {
      const vendorUsers = [];
      for (let i = 0; i < VENDORS.length; i++) {
        vendorUsers.push(await User.create(vendorUserData(society, i)));
      }
      const here = residents.filter((r) => r.isApproved && String(r.societyId) === String(society._id));
      const admin = societyAdmins.find((a) => String(a.societyId) === String(society._id));
      const built = buildCommunitySeed({ society, vendorUsers, residents: here, admin });
      if (!here.length) continue;
      await ServiceProvider.insertMany(built.providers);
      await ServiceRequest.insertMany(built.requests);
      await Post.insertMany(built.posts);
      await EmergencyContact.insertMany(built.contacts);
      await DailyHelp.insertMany(built.helpers);
      await HelpAttendance.insertMany(built.attendance);
      await Expense.insertMany(built.expenses);
      // Event notices get a few replies
      await Notice.updateMany({ societyId: society._id, type: 'event' }, { $set: { rsvps: built.rsvps } });
      counts.vendors += vendorUsers.length;
      counts.providers += built.providers.length;
      counts.requests += built.requests.length;
      counts.posts += built.posts.length;
      counts.contacts += built.contacts.length;
      counts.helpers += built.helpers.length;
      counts.attendance += built.attendance.length;
      counts.expenses += built.expenses.length;
    }
    console.log(`✅ Created ${counts.vendors} vendors, ${counts.requests} service bookings, ${counts.posts} posts, ${counts.helpers} daily helpers, ${counts.expenses} expenses`);

    // 11. Create Notifications
    console.log('🔔 Creating notifications...');
    const notificationTypes = [
      'visitor_approval', 'delivery_approval', 'visitor_entry', 'delivery_entry',
      'vehicle_entry', 'vehicle_exit', 'payment_due', 'payment_received',
      'complaint_update', 'complaint_assigned', 'notice_published',
      'booking_approved', 'booking_rejected', 'booking_request', 'service_request', 'service_update', 'community', 'general'
    ];
    
    const allUsers = [...residents, ...societyAdmins, ...securityGuards, ...staff];
    for (let i = 0; i < 50; i++) {
      const user = randomItem(allUsers);
      const type = randomItem(notificationTypes);
      
      await Notification.create({
        userId: user._id,
        societyId: user.societyId,
        type: type,
        title: `Notification ${i + 1}`,
        message: `This is a sample ${type} notification message.`,
        isRead: Math.random() > 0.5,
        readAt: Math.random() > 0.5 ? randomDate(new Date(2024, 0, 1), new Date()) : undefined,
        priority: Math.random() > 0.7 ? 'high' : Math.random() > 0.5 ? 'medium' : 'low'
      });
    }
    console.log(`✅ Created 50 notifications`);

    console.log('\n🎉 Seed data created successfully!');
    console.log('\n📊 Summary:');
    console.log(`   - ${societies.length} Societies`);
    console.log(`   - ${1 + societyAdmins.length + residents.length + securityGuards.length + staff.length} Users`);
    console.log(`   - ${visitors.length} Visitors`);
    console.log(`   - ${deliveries.length} Deliveries`);
    console.log(`   - ${vehicles.length} Vehicles`);
    console.log(`   - ${notices.length} Notices`);
    console.log(`   - ${complaints.length} Complaints`);
    console.log(`   - ${payments.length} Payments`);
    console.log(`   - ${bookings.length} Bookings`);
    console.log(`   - ${counts.vendors} Vendors with ${counts.providers} service profiles, ${counts.requests} service bookings`);
    console.log(`   - ${counts.posts} Community posts, ${counts.helpers} Daily helpers, ${counts.contacts} Emergency contacts, ${counts.expenses} Expenses`);
    console.log(`   - 50 Notifications`);
    
    console.log('\n🔐 Default Login Credentials:');
    console.log('   Super Admin:');
    console.log('     Email: superadmin@mygate.com');
    console.log('     Password: admin123');
    console.log('\n   Society Admin:');
    console.log('     Email: admin1@society.com');
    console.log('     Password: admin123');
    console.log('\n   Resident:');
    console.log('     Email: resident1@example.com');
    console.log('     Password: resident123');
    console.log('\n   Security:');
    console.log('     Email: security1@example.com');
    console.log('     Password: security123');
    console.log('\n   Vendor (home services):');
    console.log('     Email: vendor1.<last 4 chars of a society id>@example.com');
    console.log('     Password: vendor123');
    console.log('\n   Staff:');
    console.log('     Email: staff1@example.com');
    console.log('     Password: staff123');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding data:', error);
    process.exit(1);
  }
};

seedData();
