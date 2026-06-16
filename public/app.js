// State Management
const state = {
  currentPage: 1,
  currentLimit: 10,
  currentSort: 'activity_score',
  selectedUsernames: new Set(),
  activeInspectUsername: null,
  healthInterval: null
};

// DOM Elements
const elements = {
  healthBadge: document.getElementById('health-check'),
  healthText: document.querySelector('#health-check .health-text'),
  healthDb: document.getElementById('health-db'),
  healthGithub: document.getElementById('health-github'),

  analyzeForm: document.getElementById('analyze-form'),
  usernameInput: document.getElementById('username-input'),
  analyzeError: document.getElementById('analyze-error'),

  sortSelect: document.getElementById('sort-select'),
  profilesList: document.getElementById('profiles-list'),
  paginationControls: document.getElementById('pagination-controls'),
  pageIndicator: document.getElementById('page-indicator'),
  btnPrev: document.getElementById('btn-prev'),
  btnNext: document.getElementById('btn-next'),

  compareDeck: document.getElementById('compare-deck'),
  compareCount: document.getElementById('compare-count'),
  btnCompareTrigger: document.getElementById('btn-compare-trigger'),

  welcomeView: document.getElementById('welcome-view'),
  detailView: document.getElementById('detail-view'),
  compareView: document.getElementById('compare-view'),

  btnCloseCompare: document.getElementById('btn-close-compare'),
  comparisonHeaders: document.getElementById('compare-headers'),
  rowAvatar: document.getElementById('row-avatar'),
  rowScore: document.getElementById('row-score'),
  rowStars: document.getElementById('row-stars'),
  rowForks: document.getElementById('row-forks'),
  rowFollowers: document.getElementById('row-followers'),
  rowRepos: document.getElementById('row-repos'),
  rowLocation: document.getElementById('row-location'),
  rowLanguages: document.getElementById('row-languages'),

  detailAvatar: document.getElementById('detail-avatar'),
  detailName: document.getElementById('detail-name'),
  detailUsername: document.getElementById('detail-username'),
  detailGithubLink: document.getElementById('detail-github-link'),
  detailScore: document.getElementById('detail-score'),
  detailBio: document.getElementById('detail-bio'),

  detailLocationBadge: document.getElementById('detail-location-badge'),
  detailCompanyBadge: document.getElementById('detail-company-badge'),
  detailBlogBadge: document.getElementById('detail-blog-badge'),

  statRepos: document.getElementById('stat-repos'),
  statStars: document.getElementById('stat-stars'),
  statForks: document.getElementById('stat-forks'),
  statFollowers: document.getElementById('stat-followers'),

  languagesContainer: document.getElementById('languages-container'),
  reposContainer: document.getElementById('repos-container'),
  toastContainer: document.getElementById('toast-container')
};

/* ─────────────────────────────────────────────────────────────
   Toast Notification System
   ───────────────────────────────────────────────────────────── */

function showToast(message, type = 'success', duration = 4000) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  let iconClass = 'fa-circle-info';
  if (type === 'success') iconClass = 'fa-circle-check';
  if (type === 'error') iconClass = 'fa-triangle-exclamation';

  toast.innerHTML = `
    <i class="fa-solid ${iconClass}"></i>
    <div class="toast-content">${message}</div>
    <button class="toast-close"><i class="fa-solid fa-xmark"></i></button>
  `;

  elements.toastContainer.appendChild(toast);

  // Close handler
  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', () => {
    removeToast(toast);
  });

  // Auto dismiss
  setTimeout(() => {
    removeToast(toast);
  }, duration);
}

function removeToast(toast) {
  toast.style.animation = 'toast-out 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards';
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 300);
}

/* ─────────────────────────────────────────────────────────────
   Health Check API
   ───────────────────────────────────────────────────────────── */

async function checkSystemHealth() {
  try {
    const res = await fetch('/health');
    const data = await res.json();

    // Update Tooltips
    const dbStatus = data.services.database?.status || 'error';
    const dbMode = data.services.database?.mode || 'mysql';
    const ghStatus = data.services.github_api?.status || 'error';

    // Update DB status inside tooltip
    if (dbStatus === 'ok' && dbMode === 'in-memory-fallback') {
      elements.healthDb.className = 'tooltip-item warning';
      elements.healthDb.querySelector('span').textContent = 'In-Memory';
    } else {
      elements.healthDb.className = `tooltip-item ${dbStatus}`;
      elements.healthDb.querySelector('span').textContent = dbStatus === 'ok' ? 'Online' : 'Offline';
    }

    elements.healthGithub.className = `tooltip-item ${ghStatus}`;
    const rateLimit = data.services.github_api?.rate_limit;
    elements.healthGithub.querySelector('span').textContent =
      ghStatus === 'ok' && rateLimit ? `${rateLimit.remaining}/${rateLimit.limit}` : 'Offline';

    if (data.status === 'ok') {
      if (dbMode === 'in-memory-fallback') {
        elements.healthBadge.className = 'health-badge warning';
        elements.healthText.textContent = 'In-Memory Mode';
      } else {
        elements.healthBadge.className = 'health-badge ok';
        elements.healthText.textContent = 'Systems Nominal';
      }
    } else {
      elements.healthBadge.className = 'health-badge degraded';
      elements.healthText.textContent = 'System Degraded';
    }
  } catch (err) {
    elements.healthBadge.className = 'health-badge degraded';
    elements.healthText.textContent = 'Aether offline';
    elements.healthDb.className = 'tooltip-item error';
    elements.healthDb.querySelector('span').textContent = 'Error';
    elements.healthGithub.className = 'tooltip-item error';
    elements.healthGithub.querySelector('span').textContent = 'Error';
  }
}

/* ─────────────────────────────────────────────────────────────
   Directory Index (Stored Profiles)
   ───────────────────────────────────────────────────────────── */

async function loadProfilesIndex(page = 1) {
  state.currentPage = page;
  elements.profilesList.innerHTML = `
    <div class="list-placeholder">
      <i class="fa-solid fa-spinner fa-spin"></i> Fetching profile index...
    </div>
  `;

  try {
    const sort = elements.sortSelect.value;
    const res = await fetch(`/api/profiles?page=${page}&limit=${state.currentLimit}&sort=${sort}`);

    if (!res.ok) throw new Error('Failed to retrieve profiles list');
    const payload = await res.json();

    renderProfilesList(payload.data);
    renderPagination(payload.pagination);
  } catch (err) {
    elements.profilesList.innerHTML = `
      <div class="list-placeholder" style="color: #fca5a5;">
        <i class="fa-solid fa-triangle-exclamation"></i> Sync failed.
      </div>
    `;
    showToast(err.message, 'error');
  }
}

function renderProfilesList(profiles) {
  if (profiles.length === 0) {
    elements.profilesList.innerHTML = `
      <div class="list-placeholder">
        <i class="fa-solid fa-folder-open" style="margin-bottom: 8px; font-size: 1.2rem;"></i><br>
        No analyzed profiles stored yet.
      </div>
    `;
    return;
  }

  elements.profilesList.innerHTML = '';
  profiles.forEach(profile => {
    const username = profile.github_username;
    const isChecked = state.selectedUsernames.has(username.toLowerCase());
    const isActive = state.activeInspectUsername === username.toLowerCase();

    const item = document.createElement('div');
    item.className = `profile-item ${isActive ? 'active' : ''}`;
    item.dataset.username = username;

    item.innerHTML = `
      <div class="profile-item-select ${isChecked ? 'checked' : ''}" title="Select for comparison">
        <i class="fa-solid fa-check"></i>
      </div>
      <img class="profile-item-avatar" src="${profile.avatar_url}" alt="${username}">
      <div class="profile-item-details">
        <span class="profile-item-name">${profile.name || username}</span>
        <span class="profile-item-username">@${username}</span>
      </div>
      <div class="profile-item-score-badge" title="Activity Score">
        ${parseFloat(profile.activity_score).toFixed(1)}
      </div>
      <div class="profile-item-actions">
        <button class="btn-item-action refresh" title="Refresh Profile"><i class="fa-solid fa-arrows-rotate"></i></button>
        <button class="btn-item-action delete" title="Delete Profile"><i class="fa-solid fa-trash"></i></button>
      </div>
    `;

    // Select Checkbox Click
    const selectBox = item.querySelector('.profile-item-select');
    selectBox.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSelectCompare(username.toLowerCase(), selectBox);
    });

    // Refresh Button Click
    const refreshBtn = item.querySelector('.refresh');
    refreshBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerProfileRefresh(username);
    });

    // Delete Button Click
    const deleteBtn = item.querySelector('.delete');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerProfileDelete(username);
    });

    // Whole Card Click (Inspect)
    item.addEventListener('click', () => {
      inspectProfile(username);
    });

    elements.profilesList.appendChild(item);
  });
}

function renderPagination(pageData) {
  const { page, total_pages } = pageData;

  if (total_pages <= 1) {
    elements.paginationControls.classList.add('hidden');
    return;
  }

  elements.paginationControls.classList.remove('hidden');
  elements.pageIndicator.textContent = `Page ${page} of ${total_pages}`;

  elements.btnPrev.disabled = page <= 1;
  elements.btnNext.disabled = page >= total_pages;
}

/* ─────────────────────────────────────────────────────────────
   Compare Deck Operations
   ───────────────────────────────────────────────────────────── */

function toggleSelectCompare(username, elementNode) {
  const normUser = username.toLowerCase();

  if (state.selectedUsernames.has(normUser)) {
    state.selectedUsernames.delete(normUser);
    elementNode.classList.remove('checked');
  } else {
    if (state.selectedUsernames.size >= 5) {
      showToast('Maximum comparison limit is 5 profiles', 'error');
      return;
    }
    state.selectedUsernames.add(normUser);
    elementNode.classList.add('checked');
  }

  updateCompareDeck();
}

function updateCompareDeck() {
  const size = state.selectedUsernames.size;
  elements.compareCount.textContent = `${size} / 5`;

  if (size >= 2) {
    elements.compareDeck.classList.remove('hidden');
  } else {
    elements.compareDeck.classList.add('hidden');
  }
}

/* ─────────────────────────────────────────────────────────────
   Profile Details Visualization (Dashboard)
   ───────────────────────────────────────────────────────────── */

async function inspectProfile(username) {
  state.activeInspectUsername = username.toLowerCase();

  // Highlight currently inspected in directory list
  document.querySelectorAll('.profile-item').forEach(item => {
    if (item.dataset.username.toLowerCase() === state.activeInspectUsername) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Hide comparison, show detail panels
  elements.compareView.classList.add('hidden');
  elements.welcomeView.classList.add('hidden');
  elements.detailView.classList.remove('hidden');

  // Loading skeleton states
  elements.detailName.textContent = 'Loading...';
  elements.detailUsername.textContent = `@${username}`;
  elements.detailBio.textContent = 'Retrieving profile blueprints...';
  elements.detailScore.textContent = '---';
  elements.statRepos.textContent = '---';
  elements.statStars.textContent = '---';
  elements.statForks.textContent = '---';
  elements.statFollowers.textContent = '---';
  elements.languagesContainer.innerHTML = '<div class="list-placeholder"><i class="fa-solid fa-circle-notch fa-spin"></i> Rendering statistics...</div>';
  elements.reposContainer.innerHTML = '<div class="list-placeholder"><i class="fa-solid fa-circle-notch fa-spin"></i> Sorting repositories...</div>';

  try {
    const res = await fetch(`/api/profiles/${username}`);
    if (!res.ok) throw new Error('Failed to download profile details');
    const payload = await res.json();

    renderProfileDetails(payload.data);
  } catch (err) {
    showToast(err.message, 'error');
    elements.detailView.classList.add('hidden');
    elements.welcomeView.classList.remove('hidden');
  }
}

function renderProfileDetails(profile) {
  elements.detailAvatar.src = profile.avatar_url;
  elements.detailName.textContent = profile.name || profile.github_username;
  elements.detailUsername.textContent = `@${profile.github_username}`;
  elements.detailGithubLink.href = `https://github.com/${profile.github_username}`;
  elements.detailBio.textContent = profile.bio || "No biography available.";
  elements.detailScore.textContent = parseFloat(profile.activity_score).toFixed(1);

  // Badges
  updateBadge(elements.detailLocationBadge, profile.location);
  updateBadge(elements.detailCompanyBadge, profile.company);
  updateBadge(elements.detailBlogBadge, profile.blog);

  // Basic Stats
  elements.statRepos.textContent = profile.public_repos;
  elements.statStars.textContent = profile.total_stars;
  elements.statForks.textContent = profile.total_forks;
  elements.statFollowers.textContent = profile.followers;

  // Programming Languages Chart
  renderLanguagesChart(profile.language_stats);

  // Repositories Table
  renderRepositoriesList(profile.repositories);
}

function updateBadge(node, val) {
  if (val && val.trim()) {
    node.classList.remove('hidden');
    node.querySelector('.val').textContent = val;
  } else {
    node.classList.add('hidden');
  }
}

function renderLanguagesChart(languages) {
  if (!languages || languages.length === 0) {
    elements.languagesContainer.innerHTML = `
      <div class="list-placeholder">
        No language metrics compiled.
      </div>
    `;
    return;
  }

  const totalCount = languages.reduce((acc, curr) => acc + curr.repo_count, 0);
  elements.languagesContainer.innerHTML = '';

  // Sort languages descending
  languages.sort((a, b) => b.repo_count - a.repo_count);

  // Map beautiful background colors based on language
  const colorsMap = {
    javascript: 'var(--accent-purple)',
    typescript: 'var(--accent-cyan)',
    python: 'var(--accent-blue)',
    html: 'var(--accent-pink)',
    css: 'var(--accent-teal)',
    go: '#00add8',
    rust: '#dea584',
    java: '#b07219',
    c: '#555555',
    'c++': '#f34b7d',
    ruby: '#701516',
    php: '#4f5d95'
  };

  languages.forEach((lang, idx) => {
    const percentage = ((lang.repo_count / (totalCount || 1)) * 100).toFixed(1);
    const langKey = lang.language.toLowerCase();
    const barColor = colorsMap[langKey] || 'var(--grad-button)';

    const row = document.createElement('div');
    row.className = 'language-row';
    row.innerHTML = `
      <div class="language-meta">
        <span class="language-name">${lang.language}</span>
        <span class="language-count">${lang.repo_count} repos (${percentage}%)</span>
      </div>
      <div class="progress-track">
        <div class="progress-bar" style="width: 0%; background: ${barColor};"></div>
      </div>
    `;

    elements.languagesContainer.appendChild(row);

    // Animate progress bar entry
    setTimeout(() => {
      row.querySelector('.progress-bar').style.width = `${percentage}%`;
    }, 100 + (idx * 50));
  });
}

function renderRepositoriesList(repos) {
  if (!repos || repos.length === 0) {
    elements.reposContainer.innerHTML = `
      <div class="list-placeholder">
        No public repositories recorded.
      </div>
    `;
    return;
  }

  elements.reposContainer.innerHTML = '';

  // Sort repos descending by stars
  repos.sort((a, b) => b.stars - a.stars);

  repos.forEach(repo => {
    const card = document.createElement('div');
    card.className = 'repo-item';
    card.innerHTML = `
      <div class="repo-title-row">
        <a href="${repo.repo_url}" target="_blank" class="repo-name-link" title="Visit Repo Docks">${repo.repo_name}</a>
        ${repo.is_fork ? '<span class="repo-fork-badge"><i class="fa-solid fa-code-branch"></i> Fork</span>' : ''}
      </div>
      <p class="repo-desc">${repo.description || 'No description provided.'}</p>
      <div class="repo-meta-row">
        ${repo.language ? `
          <div class="repo-lang-indicator">
            <span class="lang-dot" style="background-color: ${getLanguageDotColor(repo.language)}"></span>
            <span>${repo.language}</span>
          </div>
        ` : ''}
        <div class="repo-stars-forks">
          <span><i class="fa-regular fa-star"></i> ${repo.stars}</span>
          <span><i class="fa-solid fa-code-fork"></i> ${repo.forks}</span>
        </div>
      </div>
    `;
    elements.reposContainer.appendChild(card);
  });
}

function getLanguageDotColor(lang) {
  const colorsMap = {
    javascript: '#f1e05a',
    typescript: '#3178c6',
    python: '#3572a5',
    html: '#e34c26',
    css: '#563d7c',
    go: '#00add8',
    rust: '#dea584',
    java: '#b07219',
    c: '#555555',
    'c++': '#f34b7d',
    ruby: '#701516',
    php: '#4f5d95'
  };
  return colorsMap[lang.toLowerCase()] || 'var(--text-muted)';
}

/* ─────────────────────────────────────────────────────────────
   Profile Trigger Actions (Analyze, Refresh, Delete)
   ───────────────────────────────────────────────────────────── */

// Form Submission (POST /analyze)
elements.analyzeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = elements.usernameInput.value.trim();
  if (!username) return;

  // UI states
  elements.analyzeError.classList.add('hidden');
  const submitBtn = elements.analyzeForm.querySelector('button[type="submit"]');
  const submitText = submitBtn.querySelector('span');
  const submitIcon = submitBtn.querySelector('i');

  submitBtn.disabled = true;
  submitText.textContent = 'Searching...';
  submitIcon.className = 'fa-solid fa-spinner fa-spin';

  try {
    const res = await fetch('/api/profiles/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });

    const payload = await res.json();

    if (!res.ok) {
      throw new Error(payload.error?.message || 'Aether connection dropped');
    }

    showToast(payload.message || `Profile '${username}' processed`, 'success');
    elements.usernameInput.value = '';

    // Refresh list and inspect newly created profile
    await loadProfilesIndex(1);
    inspectProfile(username);
  } catch (err) {
    elements.analyzeError.textContent = err.message;
    elements.analyzeError.classList.remove('hidden');
    showToast(err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitText.textContent = 'Analyze';
    submitIcon.className = 'fa-solid fa-sparkles';
  }
});

// Refresh profile API (PUT /refresh)
async function triggerProfileRefresh(username) {
  showToast(`Initiating refresh for @${username}...`, 'info');
  try {
    const res = await fetch(`/api/profiles/${username}/refresh`, {
      method: 'PUT'
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error?.message || 'Refraction failed');

    showToast(`Successfully refreshed profile data for @${username}!`, 'success');

    // Refresh directory list
    await loadProfilesIndex(state.currentPage);

    // If we were looking at this profile, update the dashboard
    if (state.activeInspectUsername === username.toLowerCase()) {
      inspectProfile(username);
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Delete Profile API (DELETE /delete)
async function triggerProfileDelete(username) {
  if (!confirm(`Are you sure you want to delete profile '${username}'?`)) return;

  try {
    const res = await fetch(`/api/profiles/${username}`, {
      method: 'DELETE'
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error?.message || 'Removal failed');

    showToast(`Removed database trace for profile @${username}`, 'success');

    // Clear check states if present
    state.selectedUsernames.delete(username.toLowerCase());
    updateCompareDeck();

    // Reload profiles index
    await loadProfilesIndex(state.currentPage);

    // Reset view if deleting inspected profile
    if (state.activeInspectUsername === username.toLowerCase()) {
      state.activeInspectUsername = null;
      elements.detailView.classList.add('hidden');
      elements.welcomeView.classList.remove('hidden');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ─────────────────────────────────────────────────────────────
   Profile Comparison Operations
   ───────────────────────────────────────────────────────────── */

elements.btnCompareTrigger.addEventListener('click', async () => {
  const usersList = Array.from(state.selectedUsernames).join(',');
  if (state.selectedUsernames.size < 2) {
    showToast('Select at least 2 profiles to compare', 'error');
    return;
  }

  elements.welcomeView.classList.add('hidden');
  elements.detailView.classList.add('hidden');
  elements.compareView.classList.remove('hidden');

  try {
    const res = await fetch(`/api/profiles/compare?users=${usersList}`);
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error?.message || 'Matrix correlation failed');

    renderComparisonMatrix(payload.data.profiles);
  } catch (err) {
    showToast(err.message, 'error');
    elements.compareView.classList.add('hidden');
    elements.welcomeView.classList.remove('hidden');
  }
});

function renderComparisonMatrix(profiles) {
  // Clear dynamic heads & rows
  elements.comparisonHeaders.innerHTML = '<th>Metric</th>';
  elements.rowAvatar.innerHTML = '<td class="metric-label">Profile</td>';
  elements.rowScore.innerHTML = '<td class="metric-label">Activity Score</td>';
  elements.rowStars.innerHTML = '<td class="metric-label">Total Stars</td>';
  elements.rowForks.innerHTML = '<td class="metric-label">Total Forks</td>';
  elements.rowFollowers.innerHTML = '<td class="metric-label">Followers</td>';
  elements.rowRepos.innerHTML = '<td class="metric-label">Public Repos</td>';
  elements.rowLocation.innerHTML = '<td class="metric-label">Location</td>';
  elements.rowLanguages.innerHTML = '<td class="metric-label">Top Languages</td>';

  // Calculate maximums for winning highlights
  const maxScore = Math.max(...profiles.map(p => parseFloat(p.activity_score)));
  const maxStars = Math.max(...profiles.map(p => p.total_stars));
  const maxForks = Math.max(...profiles.map(p => p.total_forks));
  const maxFollowers = Math.max(...profiles.map(p => p.followers));
  const maxRepos = Math.max(...profiles.map(p => p.public_repos));

  profiles.forEach(p => {
    const username = p.github_username;

    // Headers
    const th = document.createElement('th');
    th.className = 'compare-header-cell';
    th.innerHTML = `
      <div class="comp-user-name">${p.name || username}</div>
      <div class="comp-user-handle">@${username}</div>
    `;
    elements.comparisonHeaders.appendChild(th);

    // Avatars
    const tdAvatar = document.createElement('td');
    tdAvatar.innerHTML = `<img class="compare-avatar" src="${p.avatar_url}" alt="${username}">`;
    elements.rowAvatar.appendChild(tdAvatar);

    // Scores
    const scoreVal = parseFloat(p.activity_score);
    const tdScore = document.createElement('td');
    tdScore.className = `compare-cell-value highlight-score ${scoreVal === maxScore ? 'highlight-win' : ''}`;
    tdScore.textContent = scoreVal.toFixed(1);
    elements.rowScore.appendChild(tdScore);

    // Stars
    const tdStars = document.createElement('td');
    tdStars.className = `compare-cell-value ${p.total_stars === maxStars ? 'highlight-win' : ''}`;
    tdStars.textContent = p.total_stars.toLocaleString();
    elements.rowStars.appendChild(tdStars);

    // Forks
    const tdForks = document.createElement('td');
    tdForks.className = `compare-cell-value ${p.total_forks === maxForks ? 'highlight-win' : ''}`;
    tdForks.textContent = p.total_forks.toLocaleString();
    elements.rowForks.appendChild(tdForks);

    // Followers
    const tdFollowers = document.createElement('td');
    tdFollowers.className = `compare-cell-value ${p.followers === maxFollowers ? 'highlight-win' : ''}`;
    tdFollowers.textContent = p.followers.toLocaleString();
    elements.rowFollowers.appendChild(tdFollowers);

    // Repos
    const tdRepos = document.createElement('td');
    tdRepos.className = `compare-cell-value ${p.public_repos === maxRepos ? 'highlight-win' : ''}`;
    tdRepos.textContent = p.public_repos.toLocaleString();
    elements.rowRepos.appendChild(tdRepos);

    // Location
    const tdLoc = document.createElement('td');
    tdLoc.className = 'compare-cell-value';
    tdLoc.textContent = p.location || 'Not Specified';
    elements.rowLocation.appendChild(tdLoc);

    // Languages
    const tdLangs = document.createElement('td');
    tdLangs.className = 'compare-cell-value';
    if (p.top_languages && p.top_languages.length > 0) {
      const topList = p.top_languages.map(l => `<span class="compare-lang-badge">${l.language}</span>`).join('');
      tdLangs.innerHTML = `<div class="compare-lang-list">${topList}</div>`;
    } else {
      tdLangs.textContent = 'None';
    }
    elements.rowLanguages.appendChild(tdLangs);
  });
}

elements.btnCloseCompare.addEventListener('click', () => {
  elements.compareView.classList.add('hidden');
  if (state.activeInspectUsername) {
    elements.detailView.classList.remove('hidden');
  } else {
    elements.welcomeView.classList.remove('hidden');
  }
});

/* ─────────────────────────────────────────────────────────────
   Event Listeners (General & Init)
   ───────────────────────────────────────────────────────────── */

elements.sortSelect.addEventListener('change', () => {
  loadProfilesIndex(1);
});

elements.btnPrev.addEventListener('click', () => {
  if (state.currentPage > 1) {
    loadProfilesIndex(state.currentPage - 1);
  }
});

elements.btnNext.addEventListener('click', () => {
  loadProfilesIndex(state.currentPage + 1);
});

// Page Boot Initialization
document.addEventListener('DOMContentLoaded', () => {
  checkSystemHealth();
  loadProfilesIndex(1);

  // Set recurring checking of health
  state.healthInterval = setInterval(checkSystemHealth, 30000);
});
