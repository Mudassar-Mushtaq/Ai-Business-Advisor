// Central Express error middleware.
// Normalizes errors from Mongoose, JSON parse failures, our own AppError,
// and unexpected exceptions into a consistent JSON envelope.

function formatMongooseValidation(err) {
  const fields = {};
  for (const [key, val] of Object.entries(err.errors || {})) {
    fields[key] = val.message;
  }
  return { status: 400, code: 'validation_error', message: 'Validation failed', fields };
}

function formatMongoDuplicate(err) {
  const field = Object.keys(err.keyValue || {})[0] || 'field';
  return {
    status: 409,
    code: 'duplicate_key',
    message: `Duplicate value for ${field}`,
    fields: { [field]: 'must be unique' },
  };
}

module.exports = function errorHandler(err, req, res, _next) {
  let payload;

  if (err && err.name === 'ValidationError' && err.errors) {
    payload = formatMongooseValidation(err);
  } else if (err && err.code === 11000) {
    payload = formatMongoDuplicate(err);
  } else if (err && err.name === 'CastError') {
    payload = { status: 400, code: 'bad_id', message: `Invalid ${err.path}` };
  } else if (err && err.type === 'entity.parse.failed') {
    payload = { status: 400, code: 'bad_json', message: 'Malformed JSON body' };
  } else if (err && (err.status || err.statusCode)) {
    payload = {
      status: err.status || err.statusCode,
      code: err.code,
      message: err.message || 'Request failed',
    };
  } else {
    payload = { status: 500, code: 'internal_error', message: 'Internal Server Error' };
  }

  // Log everything except expected 4xx client errors
  if (!payload.status || payload.status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl} →`, err);
  } else if (process.env.NODE_ENV !== 'production') {
    console.warn(`[client-error] ${req.method} ${req.originalUrl} →`, err.message);
  }

  const body = { error: payload.message, code: payload.code };
  if (payload.fields) body.fields = payload.fields;
  res.status(payload.status).json(body);
};
