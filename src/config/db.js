const mysql = require('mysql2/promise');

let useMock = false;

// Mock database tables in memory
let memoryProfiles = [];
let memoryRepositories = [];
let memoryLanguageStats = [];
let profileIdCounter = 1;
let repoIdCounter = 1;
let langIdCounter = 1;

/**
 * Checks if the database error is a connection-related error.
 */
function isConnectionError(err) {
  const code = err.code || '';
  return (
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === 'EADDRNOTAVAIL' ||
    code === 'ER_ACCESS_DENIED_ERROR' ||
    code === 'ER_BAD_DB_ERROR' ||
    (err.message && err.message.toLowerCase().includes('connect')) ||
    (err.message && err.message.toLowerCase().includes('access denied'))
  );
}

/**
 * Pure JavaScript Mock SQL Executor
 */
async function mockExecute(sql, params = []) {
  const normalizedSql = sql.trim().replace(/\s+/g, ' ');

  // 1. SELECT COUNT(*) AS total FROM profiles
  if (normalizedSql.startsWith('SELECT COUNT(*) AS total FROM profiles')) {
    return [[{ total: memoryProfiles.length }]];
  }

  // 2. SELECT id, github_username, name... FROM profiles ORDER BY ... LIMIT ? OFFSET ?
  if (normalizedSql.startsWith('SELECT id, github_username, name, avatar_url, location, public_repos, followers, following, total_stars, total_forks, activity_score, analyzed_at, created_at FROM profiles ORDER BY')) {
    const orderMatch = normalizedSql.match(/ORDER BY (\w+)(?: DESC)?/i);
    const sortField = orderMatch ? orderMatch[1] : 'activity_score';
    
    // params are limit, offset
    const limit = params[0] !== undefined ? params[0] : 10;
    const offset = params[1] !== undefined ? params[1] : 0;

    const sorted = [...memoryProfiles].sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (typeof valA === 'string') {
        return valB.localeCompare(valA);
      }
      return (valB || 0) - (valA || 0);
    });

    const paginated = sorted.slice(offset, offset + limit);
    return [paginated];
  }

  // 3. SELECT id FROM profiles WHERE github_username = ?
  if (normalizedSql.startsWith('SELECT id FROM profiles WHERE github_username = ?')) {
    const username = params[0].toLowerCase();
    const found = memoryProfiles.find(p => p.github_username.toLowerCase() === username);
    return [found ? [found] : []];
  }

  // 4. SELECT * FROM profiles WHERE id = ?
  if (normalizedSql.startsWith('SELECT * FROM profiles WHERE id = ?')) {
    const id = parseInt(params[0], 10);
    const found = memoryProfiles.find(p => p.id === id);
    return [found ? [found] : []];
  }

  // 5. SELECT * FROM repositories WHERE profile_id = ? ORDER BY stars DESC
  if (normalizedSql.startsWith('SELECT * FROM repositories WHERE profile_id = ? ORDER BY stars DESC')) {
    const profileId = parseInt(params[0], 10);
    const filtered = memoryRepositories.filter(r => r.profile_id === profileId);
    filtered.sort((a, b) => b.stars - a.stars);
    return [filtered];
  }

  // 6. SELECT language, repo_count FROM language_stats WHERE profile_id = ? ORDER BY repo_count DESC LIMIT 5
  // or: SELECT language, repo_count FROM language_stats WHERE profile_id = ? ORDER BY repo_count DESC
  if (normalizedSql.startsWith('SELECT language, repo_count FROM language_stats WHERE profile_id = ? ORDER BY repo_count DESC')) {
    const profileId = parseInt(params[0], 10);
    const limitMatch = normalizedSql.match(/LIMIT (\d+)/i);
    const limit = limitMatch ? parseInt(limitMatch[1], 10) : null;
    const filtered = memoryLanguageStats.filter(l => l.profile_id === profileId);
    filtered.sort((a, b) => b.repo_count - a.repo_count);
    const results = filtered.map(l => ({ language: l.language, repo_count: l.repo_count }));
    return [limit ? results.slice(0, limit) : results];
  }

  // 7. SELECT id, github_username, name, avatar_url, location, public_repos, public_gists, followers, following, total_stars, total_forks, activity_score, analyzed_at FROM profiles WHERE github_username IN (...)
  if (normalizedSql.includes('FROM profiles WHERE github_username IN')) {
    const usernames = params.map(u => u.toLowerCase());
    const matched = memoryProfiles.filter(p => usernames.includes(p.github_username.toLowerCase()));
    return [matched];
  }

  // 8. INSERT INTO profiles (...) VALUES (...) ON DUPLICATE KEY UPDATE ...
  if (normalizedSql.startsWith('INSERT INTO profiles')) {
    const colsMatch = normalizedSql.match(/INSERT INTO profiles \(([^)]+)\)/i);
    if (!colsMatch) throw new Error(`Failed to parse columns in mock INSERT: ${sql}`);
    const cols = colsMatch[1].split(',').map(s => s.trim());
    const rowObj = {};
    cols.forEach((col, i) => {
      rowObj[col] = params[i];
    });

    let existingIndex = memoryProfiles.findIndex(
      p => p.github_id === rowObj.github_id || p.github_username.toLowerCase() === rowObj.github_username.toLowerCase()
    );

    if (existingIndex !== -1) {
      const oldId = memoryProfiles[existingIndex].id;
      const oldCreatedAt = memoryProfiles[existingIndex].created_at;
      memoryProfiles[existingIndex] = {
        ...memoryProfiles[existingIndex],
        ...rowObj,
        id: oldId,
        created_at: oldCreatedAt,
        updated_at: new Date()
      };
      return [{ insertId: 0, affectedRows: 1 }];
    } else {
      const newId = profileIdCounter++;
      rowObj.id = newId;
      rowObj.created_at = new Date();
      rowObj.updated_at = new Date();
      memoryProfiles.push(rowObj);
      return [{ insertId: newId, affectedRows: 1 }];
    }
  }

  // 9. DELETE FROM repositories WHERE profile_id = ?
  if (normalizedSql.startsWith('DELETE FROM repositories WHERE profile_id = ?')) {
    const profileId = parseInt(params[0], 10);
    const originalLength = memoryRepositories.length;
    memoryRepositories = memoryRepositories.filter(r => r.profile_id !== profileId);
    return [{ affectedRows: originalLength - memoryRepositories.length }];
  }

  // 10. INSERT INTO repositories (...) VALUES ...
  if (normalizedSql.startsWith('INSERT INTO repositories')) {
    const colsMatch = normalizedSql.match(/INSERT INTO repositories \(([^)]+)\)/i);
    if (!colsMatch) throw new Error(`Failed to parse columns in mock INSERT repositories: ${sql}`);
    const cols = colsMatch[1].split(',').map(s => s.trim());
    const numCols = cols.length;
    const numRows = params.length / numCols;
    for (let r = 0; r < numRows; r++) {
      const rowObj = { id: repoIdCounter++ };
      for (let c = 0; c < numCols; c++) {
        rowObj[cols[c]] = params[r * numCols + c];
      }
      memoryRepositories.push(rowObj);
    }
    return [{ affectedRows: numRows }];
  }

  // 11. DELETE FROM language_stats WHERE profile_id = ?
  if (normalizedSql.startsWith('DELETE FROM language_stats WHERE profile_id = ?')) {
    const profileId = parseInt(params[0], 10);
    const originalLength = memoryLanguageStats.length;
    memoryLanguageStats = memoryLanguageStats.filter(l => l.profile_id !== profileId);
    return [{ affectedRows: originalLength - memoryLanguageStats.length }];
  }

  // 12. INSERT INTO language_stats (profile_id, language, repo_count) VALUES ...
  if (normalizedSql.startsWith('INSERT INTO language_stats')) {
    const numCols = 3;
    const numRows = params.length / numCols;
    for (let r = 0; r < numRows; r++) {
      const profileId = params[r * numCols];
      const language = params[r * numCols + 1];
      const repo_count = params[r * numCols + 2];
      memoryLanguageStats.push({
        id: langIdCounter++,
        profile_id: profileId,
        language,
        repo_count
      });
    }
    return [{ affectedRows: numRows }];
  }

  // 13. DELETE FROM profiles WHERE github_username = ?
  if (normalizedSql.startsWith('DELETE FROM profiles WHERE github_username = ?')) {
    const username = params[0].toLowerCase();
    const profile = memoryProfiles.find(p => p.github_username.toLowerCase() === username);
    if (profile) {
      memoryProfiles = memoryProfiles.filter(p => p.id !== profile.id);
      memoryRepositories = memoryRepositories.filter(r => r.profile_id !== profile.id);
      memoryLanguageStats = memoryLanguageStats.filter(l => l.profile_id !== profile.id);
      return [{ affectedRows: 1 }];
    }
    return [{ affectedRows: 0 }];
  }

  throw new Error(`Mock SQL execute not implemented for: ${sql}`);
}

/**
 * Returns a connection mock
 */
function mockGetConnection() {
  return {
    async execute(sql, params) {
      return mockExecute(sql, params);
    },
    async beginTransaction() {
      // Mock transaction, no-op
    },
    async commit() {
      // Mock transaction, no-op
    },
    async rollback() {
      // Mock transaction, no-op
    },
    release() {
      // Mock connection release, no-op
    }
  };
}

// Create MySQL database connection pool
const realPool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               parseInt(process.env.DB_PORT || '3306', 10),
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME     || 'github_analyzer',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  timezone:           '+00:00',
  dateStrings:        false,
});

// Wrapper Connection for real pool
function wrapConnection(conn) {
  return {
    execute(sql, params) {
      return conn.execute(sql, params);
    },
    beginTransaction() {
      return conn.beginTransaction();
    },
    commit() {
      return conn.commit();
    },
    rollback() {
      return conn.rollback();
    },
    release() {
      return conn.release();
    }
  };
}

// Proxy/Wrapper pool object
const pool = {
  async execute(sql, params) {
    if (useMock) {
      return mockExecute(sql, params);
    }
    try {
      return await realPool.execute(sql, params);
    } catch (err) {
      if (isConnectionError(err)) {
        console.warn(`\n⚠️  [DATABASE] MySQL connection failed: ${err.message}`);
        console.warn(`👉  [DATABASE] Switching to In-Memory Database Fallback. All profiles will be stored in RAM.\n`);
        useMock = true;
        return mockExecute(sql, params);
      }
      throw err;
    }
  },
  async getConnection() {
    if (useMock) {
      return mockGetConnection();
    }
    try {
      const conn = await realPool.getConnection();
      return wrapConnection(conn);
    } catch (err) {
      if (isConnectionError(err)) {
        console.warn(`\n⚠️  [DATABASE] MySQL connection failed: ${err.message}`);
        console.warn(`👉  [DATABASE] Switching to In-Memory Database Fallback. All profiles will be stored in RAM.\n`);
        useMock = true;
        return mockGetConnection();
      }
      throw err;
    }
  }
};

/**
 * Test connection to MySQL database, switching to mock database if connection fails.
 */
async function testConnection() {
  if (useMock) return;
  try {
    const conn = await realPool.getConnection();
    conn.release();
  } catch (err) {
    if (isConnectionError(err)) {
      console.warn(`\n⚠️  [DATABASE] MySQL connection test failed: ${err.message}`);
      console.warn(`👉  [DATABASE] Switching to In-Memory Database Fallback.\n`);
      useMock = true;
      return;
    }
    throw err;
  }
}

/**
 * Returns the current database running mode
 */
function getDbMode() {
  return useMock ? 'in-memory-fallback' : 'mysql';
}

module.exports = { pool, testConnection, getDbMode };

