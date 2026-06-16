/**
 * analysisService.js
 * ─────────────────
 * Pure computation layer — no DB, no HTTP calls.
 * Takes raw GitHub API responses and derives useful insights.
 */

/**
 * Compute a weighted activity score for a user.
 *
 * Formula:
 *   score = (total_stars × 2) + (total_forks × 1.5) + (followers × 1) + (public_repos × 0.5)
 *
 * Rationale:
 *  - Stars are the strongest signal of community impact
 *  - Forks indicate downstream usage / contributions
 *  - Followers reflect community reach
 *  - Public repos show breadth of work (lower weight to avoid inflation)
 *
 * @param {number} totalStars
 * @param {number} totalForks
 * @param {number} followers
 * @param {number} publicRepos
 * @returns {number}
 */
function computeActivityScore(totalStars, totalForks, followers, publicRepos) {
  return (totalStars * 2) + (totalForks * 1.5) + (followers * 1) + (publicRepos * 0.5);
}

/**
 * Aggregate total stars and total forks across all repos.
 *
 * @param {Array} repos  Raw GitHub repo objects
 * @returns {{ totalStars: number, totalForks: number }}
 */
function aggregateRepoStats(repos) {
  return repos.reduce(
    (acc, repo) => {
      acc.totalStars += repo.stargazers_count || 0;
      acc.totalForks += repo.forks_count      || 0;
      return acc;
    },
    { totalStars: 0, totalForks: 0 }
  );
}

/**
 * Build a language distribution map from repos.
 * Skips repos with a null language.
 *
 * @param {Array} repos  Raw GitHub repo objects
 * @returns {Array<{ language: string, repo_count: number }>}  Sorted descending by count
 */
function computeLanguageStats(repos) {
  const langMap = {};

  for (const repo of repos) {
    if (!repo.language) continue;
    langMap[repo.language] = (langMap[repo.language] || 0) + 1;
  }

  return Object.entries(langMap)
    .map(([language, repo_count]) => ({ language, repo_count }))
    .sort((a, b) => b.repo_count - a.repo_count);
}

/**
 * Map a raw GitHub user API response to our DB profile shape.
 *
 * @param {Object} ghUser      Raw GitHub /users/:username response
 * @param {Array}  repos       Raw GitHub /users/:username/repos response
 * @returns {Object}
 */
function buildProfilePayload(ghUser, repos) {
  const { totalStars, totalForks } = aggregateRepoStats(repos);
  const activityScore = computeActivityScore(
    totalStars,
    totalForks,
    ghUser.followers,
    ghUser.public_repos
  );

  return {
    github_id:          ghUser.id,
    github_username:    ghUser.login,
    name:               ghUser.name        || null,
    bio:                ghUser.bio         || null,
    location:           ghUser.location    || null,
    company:            ghUser.company     || null,
    blog:               ghUser.blog        || null,
    avatar_url:         ghUser.avatar_url  || null,
    email:              ghUser.email       || null,
    twitter_username:   ghUser.twitter_username || null,
    hireable:           ghUser.hireable    ?? null,
    public_repos:       ghUser.public_repos,
    public_gists:       ghUser.public_gists,
    followers:          ghUser.followers,
    following:          ghUser.following,
    total_stars:        totalStars,
    total_forks:        totalForks,
    activity_score:     activityScore,
    account_created_at: ghUser.created_at  ? new Date(ghUser.created_at) : null,
    account_updated_at: ghUser.updated_at  ? new Date(ghUser.updated_at) : null,
    analyzed_at:        new Date(),
  };
}

/**
 * Map raw GitHub repo objects to our DB repositories shape.
 *
 * @param {number} profileId
 * @param {Array}  repos
 * @returns {Array<Object>}
 */
function buildRepoPayloads(profileId, repos) {
  return repos.map((r) => ({
    profile_id:      profileId,
    github_repo_id:  r.id,
    repo_name:       r.name,
    full_name:       r.full_name,
    description:     r.description  || null,
    language:        r.language     || null,
    stars:           r.stargazers_count || 0,
    forks:           r.forks_count      || 0,
    watchers:        r.watchers_count   || 0,
    open_issues:     r.open_issues_count || 0,
    is_fork:         r.fork ? 1 : 0,
    is_archived:     r.archived ? 1 : 0,
    repo_url:        r.html_url,
    homepage_url:    r.homepage   || null,
    topics:          r.topics?.length ? JSON.stringify(r.topics) : null,
    repo_created_at: r.created_at ? new Date(r.created_at) : null,
    repo_updated_at: r.updated_at ? new Date(r.updated_at) : null,
  }));
}

module.exports = {
  computeActivityScore,
  aggregateRepoStats,
  computeLanguageStats,
  buildProfilePayload,
  buildRepoPayloads,
};
