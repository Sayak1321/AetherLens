const axios = require('axios');

const GITHUB_API_BASE = 'https://api.github.com';

/**
 * Build axios headers — include the auth token when available to raise
 * the rate limit from 60 to 5,000 requests per hour.
 */
function buildHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const token = process.env.GITHUB_TOKEN;
  if (token && token.trim() && !/^ghp_x+$/i.test(token.trim())) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Fetch public profile data for a GitHub username.
 * @param {string} username
 * @returns {Promise<Object>} GitHub user object
 */
async function fetchUserProfile(username) {
  try {
    const { data } = await axios.get(`${GITHUB_API_BASE}/users/${username}`, {
      headers: buildHeaders(),
    });
    return data;
  } catch (err) {
    _handleGitHubError(err, username);
  }
}

/**
 * Fetch all public repositories for a GitHub username (up to 100 most recently updated).
 * @param {string} username
 * @returns {Promise<Array>} array of GitHub repo objects
 */
async function fetchUserRepos(username) {
  try {
    const { data } = await axios.get(`${GITHUB_API_BASE}/users/${username}/repos`, {
      headers: buildHeaders(),
      params: {
        per_page: 100,
        sort: 'updated',
        direction: 'desc',
      },
    });
    return data;
  } catch (err) {
    _handleGitHubError(err, username);
  }
}

/**
 * Check GitHub API rate limit status.
 * @returns {Promise<Object>} rate limit info object
 */
async function fetchRateLimit() {
  const { data } = await axios.get(`${GITHUB_API_BASE}/rate_limit`, {
    headers: buildHeaders(),
  });
  return data.rate;
}

/**
 * Translate axios/GitHub API errors into meaningful HTTP errors.
 * @private
 */
function _handleGitHubError(err, username) {
  if (err.response) {
    const { status, data } = err.response;

    if (status === 404) {
      const error = new Error(`GitHub user '${username}' not found`);
      error.status = 404;
      throw error;
    }

    if (status === 403 || status === 429) {
      const resetAt = err.response.headers['x-ratelimit-reset'];
      const resetTime = resetAt
        ? new Date(parseInt(resetAt, 10) * 1000).toISOString()
        : 'unknown';
      const error = new Error(
        `GitHub API rate limit exceeded. Resets at ${resetTime}. ` +
        `Set GITHUB_TOKEN in .env to raise the limit to 5,000 req/hr.`
      );
      error.status = 429;
      throw error;
    }

    const error = new Error(data.message || 'GitHub API error');
    error.status = status;
    throw error;
  }

  // Network / timeout errors
  const error = new Error(`Failed to reach GitHub API: ${err.message}`);
  error.status = 503;
  throw error;
}

module.exports = { fetchUserProfile, fetchUserRepos, fetchRateLimit };
