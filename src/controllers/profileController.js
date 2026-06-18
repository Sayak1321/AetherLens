const { validationResult } = require('express-validator');
const { pool }              = require('../config/db');
const githubService         = require('../services/githubService');
const analysisService       = require('../services/analysisService');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Throw a 400 if express-validator found any problems. */
function assertValid(req) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const err = new Error('Validation failed');
    err.status = 400;
    err.details = errors.array();
    throw err;
  }
}

/**
 * Fetch a full stored profile (profile + repos + language stats) by profile id.
 * @param {Object} conn  mysql2 connection
 * @param {number} profileId
 */
async function fetchFullProfile(conn, profileId) {
  const [[profile]] = await conn.execute(
    'SELECT * FROM profiles WHERE id = ?',
    [profileId]
  );
  if (!profile) return null;

  const [repos] = await conn.execute(
    'SELECT * FROM repositories WHERE profile_id = ? ORDER BY stars DESC',
    [profileId]
  );

  const [languages] = await conn.execute(
    'SELECT language, repo_count FROM language_stats WHERE profile_id = ? ORDER BY repo_count DESC',
    [profileId]
  );

  return { ...profile, repositories: repos, language_stats: languages };
}

/**
 * Persist (insert or update) a full analysis into the DB.
 * Wrapped in a transaction.
 * @param {string} username
 * @param {Object} ghUser   Raw GitHub user object
 * @param {Array}  repos    Raw GitHub repos array
 * @returns {Object}  The stored profile (full)
 */
async function persistAnalysis(username, ghUser, repos) {
  const profilePayload  = analysisService.buildProfilePayload(ghUser, repos);
  const languageStats   = analysisService.computeLanguageStats(repos);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // ── Upsert profile ──────────────────────────────────────────────────────
    const profileCols = Object.keys(profilePayload);
    const profileVals = Object.values(profilePayload);

    // Build "col = VALUES(col)" pairs for ON DUPLICATE KEY UPDATE
    const updateClauses = profileCols
      .filter((c) => c !== 'github_id') // don't update the unique key itself
      .map((c) => `${c} = VALUES(${c})`)
      .join(', ');

    const [upsertResult] = await conn.execute(
      `INSERT INTO profiles (${profileCols.join(', ')})
       VALUES (${profileCols.map(() => '?').join(', ')})
       ON DUPLICATE KEY UPDATE ${updateClauses}`,
      profileVals
    );

    // insertId = 0 on UPDATE; retrieve real id
    let profileId = upsertResult.insertId;
    if (!profileId) {
      const [[row]] = await conn.execute(
        'SELECT id FROM profiles WHERE github_username = ?',
        [username]
      );
      profileId = row.id;
    }

    // ── Replace repos ────────────────────────────────────────────────────────
    await conn.execute('DELETE FROM repositories WHERE profile_id = ?', [profileId]);

    if (repos.length > 0) {
      const repoPayloads = analysisService.buildRepoPayloads(profileId, repos);
      const repoCols = Object.keys(repoPayloads[0]);

      const repoPlaceholders = repoPayloads.map(() => `(${repoCols.map(() => '?').join(', ')})`).join(', ');
      const repoValues = repoPayloads.flatMap(Object.values);

      await conn.execute(
        `INSERT INTO repositories (${repoCols.join(', ')}) VALUES ${repoPlaceholders}`,
        repoValues
      );
    }

    // ── Replace language stats ───────────────────────────────────────────────
    await conn.execute('DELETE FROM language_stats WHERE profile_id = ?', [profileId]);

    if (languageStats.length > 0) {
      const langPlaceholders = languageStats.map(() => '(?, ?, ?)').join(', ');
      const langValues = languageStats.flatMap(({ language, repo_count }) => [
        profileId,
        language,
        repo_count,
      ]);
      await conn.execute(
        `INSERT INTO language_stats (profile_id, language, repo_count) VALUES ${langPlaceholders}`,
        langValues
      );
    }

    await conn.commit();
    return await fetchFullProfile(conn, profileId);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Controllers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/profiles/analyze
 * Body: { "username": "torvalds" }
 *
 * Fetches data from GitHub, computes insights, and stores them.
 * If the profile already exists it is refreshed.
 */
async function analyzeProfile(req, res, next) {
  try {
    assertValid(req);

    const { username } = req.body;

    // Check if the profile already exists in our database
    const [[existing]] = await pool.execute(
      'SELECT id FROM profiles WHERE github_username = ?',
      [username]
    );
    const isNew = !existing;

    const [ghUser, repos] = await Promise.all([
      githubService.fetchUserProfile(username),
      githubService.fetchUserRepos(username),
    ]);

    const fullProfile = await persistAnalysis(username, ghUser, repos);

    const statusCode = isNew ? 201 : 200;
    const message = isNew
      ? `Profile '${username}' analyzed and stored successfully`
      : `Profile '${username}' refreshed and updated successfully`;

    res.status(statusCode).json({
      success: true,
      message,
      data: fullProfile,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/profiles
 * Query: page, limit, sort (followers|total_stars|activity_score|public_repos|analyzed_at|created_at)
 *
 * Returns a paginated list of all stored profiles (without repos/language arrays).
 */
async function getAllProfiles(req, res, next) {
  try {
    assertValid(req);

    const page  = Math.max(1, parseInt(req.query.page  || '1',  10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '10', 10)));
    const offset = (page - 1) * limit;

    const ALLOWED_SORT = new Set([
      'followers', 'total_stars', 'activity_score', 'public_repos', 'analyzed_at', 'created_at',
    ]);
    const sort = ALLOWED_SORT.has(req.query.sort) ? req.query.sort : 'activity_score';

    const [[{ total }]] = await pool.execute('SELECT COUNT(*) AS total FROM profiles');

    // Fetch all profiles without ORDER BY (to avoid prepared statement issues with column names)
    const [allProfiles] = await pool.execute(
      'SELECT id, github_username, name, avatar_url, location, public_repos, followers, following, total_stars, total_forks, activity_score, analyzed_at, created_at FROM profiles'
    );

    // Sort in Node.js (client-side sorting)
    const sorted = allProfiles.sort((a, b) => {
      let valA = a[sort];
      let valB = b[sort];
      
      if (typeof valA === 'string') {
        return valB.localeCompare(valA);
      }
      return (valB || 0) - (valA || 0);
    });

    // Paginate
    const profiles = sorted.slice(offset, offset + limit);

    res.json({
      success: true,
      data: profiles,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
        sort,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/profiles/:username
 *
 * Returns full stored data for a single profile including
 * repositories and language_stats.
 */
async function getProfile(req, res, next) {
  try {
    const { username } = req.params;

    const [[row]] = await pool.execute(
      'SELECT id FROM profiles WHERE github_username = ?',
      [username]
    );

    if (!row) {
      const err = new Error(`Profile '${username}' has not been analyzed yet. Use POST /api/profiles/analyze first.`);
      err.status = 404;
      throw err;
    }

    const conn = await pool.getConnection();
    try {
      const fullProfile = await fetchFullProfile(conn, row.id);
      res.json({ success: true, data: fullProfile });
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/profiles/:username/refresh
 *
 * Re-fetches the profile from GitHub and updates all stored data.
 */
async function refreshProfile(req, res, next) {
  try {
    const { username } = req.params;

    // Verify it exists in our DB first
    const [[row]] = await pool.execute(
      'SELECT id FROM profiles WHERE github_username = ?',
      [username]
    );
    if (!row) {
      const err = new Error(`Profile '${username}' not found in database. Analyze it first with POST /api/profiles/analyze`);
      err.status = 404;
      throw err;
    }

    const [ghUser, repos] = await Promise.all([
      githubService.fetchUserProfile(username),
      githubService.fetchUserRepos(username),
    ]);

    const fullProfile = await persistAnalysis(username, ghUser, repos);

    res.json({
      success: true,
      message: `Profile '${username}' refreshed successfully`,
      data: fullProfile,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/profiles/:username
 *
 * Removes a stored profile and all related data (cascaded by FK).
 */
async function deleteProfile(req, res, next) {
  try {
    const { username } = req.params;

    const [result] = await pool.execute(
      'DELETE FROM profiles WHERE github_username = ?',
      [username]
    );

    if (result.affectedRows === 0) {
      const err = new Error(`Profile '${username}' not found`);
      err.status = 404;
      throw err;
    }

    res.json({
      success: true,
      message: `Profile '${username}' deleted successfully`,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/profiles/compare?users=torvalds,gvanrossum
 *
 * Side-by-side comparison of 2–5 stored profiles.
 */
async function compareProfiles(req, res, next) {
  try {
    assertValid(req);

    const usernameList = (req.query.users || '')
      .split(',')
      .map((u) => u.trim().toLowerCase())
      .filter(Boolean);

    if (usernameList.length < 2 || usernameList.length > 5) {
      const err = new Error('Provide between 2 and 5 comma-separated usernames in the `users` query param');
      err.status = 400;
      throw err;
    }

    // Fetch all profiles from DB
    const placeholders = usernameList.map(() => '?').join(', ');
    const [rows] = await pool.execute(
      `SELECT id, github_username, name, avatar_url, location, public_repos, public_gists, followers, following, total_stars, total_forks, activity_score, analyzed_at FROM profiles WHERE github_username IN (${placeholders})`,
      usernameList
    );

    const foundNames   = rows.map((r) => r.github_username.toLowerCase());
    const missingNames = usernameList.filter((u) => !foundNames.includes(u));

    const languages = await Promise.all(
      rows.map(async (profile) => {
        const [langs] = await pool.execute(
          'SELECT language, repo_count FROM language_stats WHERE profile_id = ? ORDER BY repo_count DESC LIMIT 5',
          [profile.id]
        );
        return { username: profile.github_username, top_languages: langs };
      })
    );

    const langMap = Object.fromEntries(languages.map(({ username, top_languages }) => [username, top_languages]));
    const enriched = rows.map((p) => ({
      ...p,
      top_languages: langMap[p.github_username] || [],
    }));

    res.json({
      success: true,
      data: {
        profiles: enriched,
        ...(missingNames.length > 0 && {
          warning: `These usernames were not found in the database (analyze them first): ${missingNames.join(', ')}`,
        }),
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  analyzeProfile,
  getAllProfiles,
  getProfile,
  refreshProfile,
  deleteProfile,
  compareProfiles,
};
