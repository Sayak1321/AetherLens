/**
 * Global error-handling middleware.
 * Must be registered AFTER all routes in app.js.
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status  = err.status  || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  // Log stack trace in development
  if (process.env.NODE_ENV !== 'production') {
    console.error('[ERROR]', err.stack || err);
  }

  res.status(status).json({
    success: false,
    error: {
      message,
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    },
  });
}

module.exports = errorHandler;
