require('dotenv').config();

const express      = require('express');
const morgan       = require('morgan');
const cors         = require('cors');
const { testConnection, getDbMode } = require('./config/db');
const { fetchRateLimit } = require('./services/githubService');
const profileRoutes      = require('./routes/profileRoutes');
const errorHandler       = require('./middleware/errorHandler');

const app  = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// ─────────────────────────────────────────────────────────────────────────────
// Global Middleware
// ─────────────────────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use(express.static('public'));

// ─────────────────────────────────────────────────────────────────────────────
// Health Check
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /health
 * Checks database connectivity and GitHub API rate limit.
 */
app.get('/health', async (req, res) => {
  const result = {
    status:    'ok',
    timestamp: new Date().toISOString(),
    services:  {},
  };

  // Check DB
  try {
    await testConnection();
    const dbMode = getDbMode();
    result.services.database = { 
      status: 'ok',
      mode: dbMode,
      ...(dbMode === 'in-memory-fallback' && { message: 'Using in-memory database fallback (MySQL is unavailable)' })
    };
  } catch (err) {
    result.status = 'degraded';
    result.services.database = { status: 'error', message: err.message };
  }

  // Check GitHub API + report rate limit
  try {
    const rateLimit = await fetchRateLimit();
    result.services.github_api = {
      status:     'ok',
      rate_limit: {
        limit:     rateLimit.limit,
        remaining: rateLimit.remaining,
        reset_at:  new Date(rateLimit.reset * 1000).toISOString(),
        authenticated: !!(process.env.GITHUB_TOKEN && !/^ghp_x+$/i.test(process.env.GITHUB_TOKEN.trim())),
      },
    };
  } catch (err) {
    result.status = 'degraded';
    result.services.github_api = { status: 'error', message: err.message };
  }

  const httpStatus = result.status === 'ok' ? 200 : 503;
  res.status(httpStatus).json(result);
});

// ─────────────────────────────────────────────────────────────────────────────
// API Routes
// ─────────────────────────────────────────────────────────────────────────────

app.use('/api/profiles', profileRoutes);

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { message: `Route ${req.method} ${req.path} not found` },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Error Handler (must be last)
// ─────────────────────────────────────────────────────────────────────────────

app.use(errorHandler);

// ─────────────────────────────────────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🚀 GitHub Profile Analyzer API`);
  console.log(`   Listening on http://localhost:${PORT}`);
  console.log(`   Health:   GET  http://localhost:${PORT}/health`);
  console.log(`   Profiles: POST http://localhost:${PORT}/api/profiles/analyze\n`);
});

module.exports = app; // Exported for testing and execution
