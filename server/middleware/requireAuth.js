const admin = require('../config/firebase-admin');
const User = require('../models/User');

/**
 * Authentication middleware — verifies Firebase ID token from the Authorization header.
 * Attaches the MongoDB user document to req.user.
 */
const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized. No token provided.' });
    }

    const token = authHeader.split('Bearer ')[1];

    // Verify the Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(token);

    // Find the user in our database
    const user = await User.findOne({ firebaseUid: decodedToken.uid });
    if (!user) {
      return res.status(401).json({ error: 'User not found. Please sign in again.' });
    }

    // Attach user to request
    req.user = user;
    req.firebaseUser = decodedToken;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err.message);

    if (err.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    }

    return res.status(401).json({ error: 'Unauthorized. Invalid token.' });
  }
};

module.exports = requireAuth;
