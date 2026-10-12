const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

// Create admin user
const createAdmin = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mygate');
    console.log('MongoDB connected');

    // Get admin details from command line arguments or use defaults
    const args = process.argv.slice(2);
    const email = args[0] || 'admin@mygate.com';
    if (process.env.NODE_ENV === 'production' && !args[1]) {
      console.error('Pass a password: npm run create-admin <email> <password> <name> <phone> <role>');
      process.exit(1);
    }
    const password = args[1] || 'admin123';
    const name = args[2] || 'Super Admin';
    const phone = args[3] || '1234567890';
    const role = args[4] || 'super_admin'; // super_admin or society_admin

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log(`❌ User with email ${email} already exists!`);
      console.log('To update the user, please use MongoDB directly or delete and recreate.');
      process.exit(1);
    }

    // Create admin user
    const admin = await User.create({
      name,
      email,
      password,
      phone,
      role,
      isApproved: true,
      isActive: true
      // Note: super_admin doesn't need societyId
    });

    console.log('✅ Admin user created successfully!');
    console.log('\n📋 Admin Details:');
    console.log(`   Email: ${admin.email}`);
    console.log(`   Password: ${password}`);
    console.log(`   Role: ${admin.role}`);
    console.log(`   ID: ${admin._id}`);
    console.log('\n🔐 You can now login with these credentials.');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin:', error.message);
    process.exit(1);
  }
};

createAdmin();
