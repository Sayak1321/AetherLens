const { Router } = require('express');
const { body, query } = require('express-validator');
const ctrl = require('../controllers/profileController');

const router = Router();

// ── Validation rules ──────────────────────────────────────────────────────────

const validateUsername = [
  body('username')
    .trim()
    .notEmpty().withMessage('username is required')
    .isLength({ max: 39 }).withMessage('GitHub usernames cannot exceed 39 characters')
    .matches(/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/)
    .withMessage('Invalid GitHub username format'),
];

const validateListQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
  query('sort')
    .optional()
    .isIn(['followers', 'total_stars', 'activity_score', 'public_repos', 'analyzed_at', 'created_at'])
    .withMessage('Invalid sort field'),
];

const validateCompare = [
  query('users')
    .trim()
    .notEmpty().withMessage('users query param is required')
    .custom((val) => {
      const list = val.split(',').map((u) => u.trim()).filter(Boolean);
      if (list.length < 2 || list.length > 5) {
        throw new Error('Provide between 2 and 5 usernames');
      }
      return true;
    }),
];

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * POST /api/profiles/analyze
 * Analyze a GitHub user and store insights.
 */
router.post('/analyze', validateUsername, ctrl.analyzeProfile);

/**
 * GET /api/profiles
 * List all stored profiles (paginated).
 */
router.get('/', validateListQuery, ctrl.getAllProfiles);

/**
 * GET /api/profiles/compare?users=a,b
 * Compare multiple stored profiles side-by-side.
 * NOTE: must be declared BEFORE /:username to avoid route conflict.
 */
router.get('/compare', validateCompare, ctrl.compareProfiles);

/**
 * GET /api/profiles/:username
 * Get full stored data for a single user.
 */
router.get('/:username', ctrl.getProfile);

/**
 * PUT /api/profiles/:username/refresh
 * Re-fetch from GitHub and update stored data.
 */
router.put('/:username/refresh', ctrl.refreshProfile);

/**
 * DELETE /api/profiles/:username
 * Remove a stored profile.
 */
router.delete('/:username', ctrl.deleteProfile);

module.exports = router;
