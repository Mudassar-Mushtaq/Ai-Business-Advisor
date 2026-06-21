// Escape special regex characters in a user-provided string
// so it can be safely used in a MongoDB $regex query.
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = escapeRegex;
