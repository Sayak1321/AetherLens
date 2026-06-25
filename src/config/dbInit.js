const { pool, getDbMode } = require('./db');

/**
 * Initialize database tables if they don't exist.
 * Skipped when running in in-memory mock mode — the mock manages its own
 * in-memory tables and does not support DDL statements.
 */
async function initializeDatabase() {
  // Skip schema init in mock mode — DDL is not supported by the mock executor
  if (getDbMode() === 'in-memory-fallback') {
    console.log('ℹ️  [DATABASE] Running in-memory fallback — skipping schema init.\n');
    return;
  }

  try {
    console.log('🔧 [DATABASE] Initializing schema...');

    // ── profiles ────────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS profiles (
        id                 SERIAL PRIMARY KEY,
        github_id          BIGINT         UNIQUE NOT NULL,
        github_username    VARCHAR(255)   UNIQUE NOT NULL,
        name               VARCHAR(255),
        bio                TEXT,
        location           VARCHAR(255),
        company            VARCHAR(255),
        blog               VARCHAR(500),
        avatar_url         VARCHAR(500),
        email              VARCHAR(255),
        twitter_username   VARCHAR(255),
        hireable           BOOLEAN,
        public_repos       INT            NOT NULL DEFAULT 0,
        public_gists       INT            NOT NULL DEFAULT 0,
        followers          INT            NOT NULL DEFAULT 0,
        following          INT            NOT NULL DEFAULT 0,
        total_stars        INT            NOT NULL DEFAULT 0,
        total_forks        INT            NOT NULL DEFAULT 0,
        activity_score     NUMERIC(10, 2) NOT NULL DEFAULT 0,
        account_created_at TIMESTAMP,
        account_updated_at TIMESTAMP,
        analyzed_at        TIMESTAMP,
        created_at         TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
        updated_at         TIMESTAMP      DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ [DATABASE] Profiles table created/verified');

    // ── repositories ────────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS repositories (
        id              SERIAL PRIMARY KEY,
        profile_id      INT            NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        github_repo_id  BIGINT         UNIQUE NOT NULL,
        repo_name       VARCHAR(255)   NOT NULL,
        full_name       VARCHAR(512)   NOT NULL,
        description     TEXT,
        language        VARCHAR(100),
        stars           INT            NOT NULL DEFAULT 0,
        forks           INT            NOT NULL DEFAULT 0,
        watchers        INT            NOT NULL DEFAULT 0,
        open_issues     INT            NOT NULL DEFAULT 0,
        is_fork         BOOLEAN        NOT NULL DEFAULT FALSE,
        is_archived     BOOLEAN        NOT NULL DEFAULT FALSE,
        repo_url        VARCHAR(500)   NOT NULL,
        homepage_url    VARCHAR(500),
        topics          JSONB,
        repo_created_at TIMESTAMP,
        repo_updated_at TIMESTAMP,
        created_at      TIMESTAMP      DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ [DATABASE] Repositories table created/verified');

    // ── language_stats ───────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS language_stats (
        id          SERIAL PRIMARY KEY,
        profile_id  INT          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        language    VARCHAR(100) NOT NULL,
        repo_count  INT          NOT NULL DEFAULT 0,
        UNIQUE (profile_id, language)
      )
    `);
    console.log('✅ [DATABASE] Language stats table created/verified');

    // ── indexes ──────────────────────────────────────────────────────────────
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_profiles_username       ON profiles(github_username)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_profiles_github_id      ON profiles(github_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_profiles_activity_score ON profiles(activity_score DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_profiles_followers      ON profiles(followers DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_repositories_profile_id ON repositories(profile_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_repositories_stars      ON repositories(profile_id, stars DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_language_stats_profile  ON language_stats(profile_id)`);
    console.log('✅ [DATABASE] Indexes created/verified');

    console.log('✅ [DATABASE] Schema initialized successfully\n');
  } catch (err) {
    // If we fell back to mock during schema init, that's fine — mock has no schema
    if (getDbMode() === 'in-memory-fallback') {
      console.log('ℹ️  [DATABASE] Switched to in-memory fallback during schema init — schema not needed.\n');
      return;
    }
    console.error('❌ [DATABASE] Failed to initialize schema:', err.message);
    throw err;
  }
}

module.exports = { initializeDatabase };
