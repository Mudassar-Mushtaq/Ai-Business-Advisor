/**
 * Admin role guard middleware — must be placed AFTER requireAuth.
 * Ensures the authenticated user has role === 'admin' and is active.
 */
module.exports = function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized. Authentication required.' });
  }

  if (req.user.isActive === false) {
    return res.status(403).json({ error: 'Your account has been suspended. Please contact support.' });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden. Admin privileges required.' });
  }

  next();
};
