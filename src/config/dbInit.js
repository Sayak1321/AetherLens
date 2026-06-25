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

    // Create profiles table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS profiles (
        id SERIAL PRIMARY KEY,
        github_id INT UNIQUE NOT NULL,
        github_username VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        avatar_url VARCHAR(500),
        location VARCHAR(255),
        bio TEXT,
        public_repos INT DEFAULT 0,
        public_gists INT DEFAULT 0,
        followers INT DEFAULT 0,
        following INT DEFAULT 0,
        total_stars INT DEFAULT 0,
        total_forks INT DEFAULT 0,
        activity_score NUMERIC(10, 2) DEFAULT 0,
        analyzed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ [DATABASE] Profiles table created/verified');

    // Create repositories table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS repositories (
        id SERIAL PRIMARY KEY,
        profile_id INT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        url VARCHAR(500),
        stars INT DEFAULT 0,
        forks INT DEFAULT 0,
        language VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ [DATABASE] Repositories table created/verified');

    // Create language_stats table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS language_stats (
        id SERIAL PRIMARY KEY,
        profile_id INT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        language VARCHAR(100),
        repo_count INT DEFAULT 0
      )
    `);
    console.log('✅ [DATABASE] Language stats table created/verified');

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(github_username)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_profiles_github_id ON profiles(github_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_repositories_profile_id ON repositories(profile_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_language_stats_profile_id ON language_stats(profile_id)
    `);
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
