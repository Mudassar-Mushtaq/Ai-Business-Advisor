const express = require('express');
const admin = require('../config/firebase-admin');
const User = require('../models/User');
const router = express.Router();

// Helper: pick safe user fields for client
const safeUser = (user) => {
  const { _id, name, email, avatar, authMethod, createdAt } = user;
  return { _id, name, email, avatar, authMethod, createdAt };
};

// ═══════════════════════════════════════
// Firebase Auth Sync
// Called after every Firebase sign-in to get/create the MongoDB user
// ═══════════════════════════════════════

router.post('/firebase-sync', async (req, res) => {
  try {
    const { token, name, avatar } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Firebase token is required.' });
    }

    // Verify the Firebase ID token
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(token);
    } catch (verifyErr) {
      console.error('Token verification failed:', verifyErr.message);
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }

    const { uid, email, firebase: { sign_in_provider } } = decodedToken;
    const authMethod = sign_in_provider === 'google.com' ? 'google' : 'email';

    // Try to find existing user by Firebase UID
    let user = await User.findOne({ firebaseUid: uid });

    if (user) {
      // Update user info if changed
      let needsUpdate = false;

      if (name && user.name !== name) {
        user.name = name;
        needsUpdate = true;
      }
      if (avatar && user.avatar !== avatar) {
        user.avatar = avatar;
        needsUpdate = true;
      }
      if (user.authMethod !== authMethod) {
        user.authMethod = authMethod;
        needsUpdate = true;
      }

      if (needsUpdate) {
        await user.save();
      }

      return res.json({ user: safeUser(user) });
    }

    // Check if a user with this email exists but different Firebase UID
    // (e.g. migrated from old auth system)
    user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
      // Link this Firebase UID to the existing account
      user.firebaseUid = uid;
      user.authMethod = authMethod;
      if (avatar && !user.avatar) user.avatar = avatar;
      if (name && !user.name) user.name = name;
      await user.save();
      console.log(`🔗 Linked Firebase UID to existing account: ${user.email}`);
      return res.json({ user: safeUser(user) });
    }

    // Create brand new user
    user = await User.create({
      firebaseUid: uid,
      email: (email || '').toLowerCase().trim(),
      name: name || email?.split('@')[0] || 'User',
      authMethod,
      avatar: avatar || '',
    });

    console.log(`✨ New user created: ${user.email} (${authMethod})`);
    return res.status(201).json({ user: safeUser(user) });

  } catch (err) {
    console.error('Firebase sync error:', err);

    if (err.code === 11000) {
      // Duplicate key — race condition, just find and return the user
      try {
        const { token } = req.body;
        const decoded = await admin.auth().verifyIdToken(token);
        const user = await User.findOne({ firebaseUid: decoded.uid });
        if (user) return res.json({ user: safeUser(user) });
      } catch (_) { /* fall through */ }
    }

    res.status(500).json({ error: 'Server error during authentication.' });
  }
});

module.exports = router;
