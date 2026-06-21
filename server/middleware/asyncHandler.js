// Wraps an async Express handler so any thrown/rejected error
// flows into the central error middleware instead of crashing the worker.
//
// Usage: router.get('/', asyncHandler(async (req, res) => { ... }))
module.exports = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// A small AppError class lets handlers throw with a status code:
//   throw new AppError('Item not found', 404);
class AppError extends Error {
  constructor(message, status = 500, code) {
    super(message);
    this.status = status;
    if (code) this.code = code;
  }
}
module.exports.AppError = AppError;
