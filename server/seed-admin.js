/**
 * One-time admin seed script.
 * Creates an admin account in Firebase Auth + MongoDB.
 *
 * Usage:  node seed-admin.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const admin = require('./config/firebase-admin');
const User = require('./models/User');

const ADMIN_EMAIL    = 'admin@gmail.com';
const ADMIN_PASSWORD = 'Admin@123';   // Change after first login
const ADMIN_NAME     = 'System Admin';

async function seed() {
  // 1. Connect to MongoDB
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ MongoDB connected');

  // 2. Create Firebase Auth user (or fetch existing)
  let fbUser;
  try {
    fbUser = await admin.auth().getUserByEmail(ADMIN_EMAIL);
    console.log('ℹ️  Firebase user already exists:', fbUser.uid);
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      fbUser = await admin.auth().createUser({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        displayName: ADMIN_NAME,
      });
      console.log('✅ Firebase user created:', fbUser.uid);
    } else {
      throw err;
    }
  }

  // 3. Create or update MongoDB user with admin role
  let user = await User.findOne({ email: ADMIN_EMAIL });
  if (user) {
    user.role = 'admin';
    user.isActive = true;
    user.firebaseUid = fbUser.uid;
    await user.save();
    console.log('✅ Existing MongoDB user promoted to admin');
  } else {
    user = await User.create({
      firebaseUid: fbUser.uid,
      email: ADMIN_EMAIL,
      name: ADMIN_NAME,
      authMethod: 'email',
      role: 'admin',
      isActive: true,
    });
    console.log('✅ New admin user created in MongoDB');
  }

  console.log('\n🎉 Admin account ready!');
  console.log('   Email:    ', ADMIN_EMAIL);
  console.log('   Password: ', ADMIN_PASSWORD);
  console.log('   Role:      admin');
  console.log('\n   Login at http://localhost:3000/login');

  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
