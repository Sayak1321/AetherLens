# GitHub Profile Analyzer API

A backend REST API built with **Node.js**, **Express.js**, and **MySQL** that fetches GitHub user profile data via the GitHub public API, computes useful insights, and stores everything in a relational database.

---

## Features

| Feature | Description |
|---|---|
| **Profile Analysis** | Fetch & store full GitHub profile snapshots |
| **Repository Insights** | Top 100 public repos with stars, forks, language, topics |
| **Language Breakdown** | Aggregated programming language distribution per user |
| **Activity Score** | Weighted metric: `(stars×2) + (forks×1.5) + (followers×1) + (repos×0.5)` |
| **Pagination & Sorting** | `?page=1&limit=10&sort=followers` on the list endpoint |
| **Profile Comparison** | Side-by-side diff of 2–5 stored profiles |
| **Refresh** | Re-fetch stale profiles from GitHub on demand |
| **Health Check** | DB + GitHub API connectivity + rate limit status |
| **Rate-limit Aware** | Graceful 429 errors with reset time; supports `GITHUB_TOKEN` |

---

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MySQL 8+ (via `mysql2/promise`)
- **Third-party API**: GitHub REST API v3
- **Key libs**: `axios`, `dotenv`, `express-validator`, `morgan`, `cors`

---

## Project Structure

```
github-analyzer/
├── src/
│   ├── app.js                      # Express entry point
│   ├── config/
│   │   └── db.js                   # MySQL connection pool
│   ├── controllers/
│   │   └── profileController.js    # Request/response handlers
│   ├── middleware/
│   │   └── errorHandler.js         # Global error handler
│   ├── routes/
│   │   └── profileRoutes.js        # Route definitions + validation
│   └── services/
│       ├── githubService.js        # GitHub API client
│       └── analysisService.js      # Insight computation (pure)
├── db/
│   └── schema.sql                  # Database DDL
├── .env.example                    # Environment variable template
├── .gitignore
└── package.json
```

---

## Prerequisites

- Node.js ≥ 18
- MySQL 8+
- (Optional but recommended) A [GitHub Personal Access Token](https://github.com/settings/tokens) — raises the API rate limit from 60 to **5,000 requests/hour**

---

## Setup

### 1. Clone & install dependencies

```bash
git clone <your-repo-url>
cd github-analyzer
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in your MySQL credentials and optionally a GitHub token:

```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=github_analyzer
GITHUB_TOKEN=ghp_xxxxxxx   # optional
```

### 3. Create the database and schema

```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS github_analyzer;"
mysql -u root -p github_analyzer < db/schema.sql
```

### 4. Start the server

```bash
# Development (auto-restart on file changes)
npm run dev

# Production
npm start
```

The server starts at `http://localhost:3000`.

---

## API Reference

### `GET /health`

Check DB and GitHub API connectivity.

**Response**
```json
{
  "status": "ok",
  "timestamp": "2024-06-01T12:00:00.000Z",
  "services": {
    "database": { "status": "ok" },
    "github_api": {
      "status": "ok",
      "rate_limit": {
        "limit": 5000,
        "remaining": 4987,
        "reset_at": "2024-06-01T13:00:00.000Z",
        "authenticated": true
      }
    }
  }
}
```

---

### `POST /api/profiles/analyze`

Analyze a GitHub user and store all insights. If the profile already exists it is refreshed.

**Request Body**
```json
{ "username": "torvalds" }
```

**Response** `201`
```json
{
  "success": true,
  "message": "Profile 'torvalds' analyzed and stored successfully",
  "data": {
    "id": 1,
    "github_username": "torvalds",
    "name": "Linus Torvalds",
    "public_repos": 6,
    "followers": 240000,
    "total_stars": 215000,
    "activity_score": 670008.0,
    "repositories": [ ... ],
    "language_stats": [
      { "language": "C", "repo_count": 3 }
    ]
  }
}
```

---

### `GET /api/profiles`

List all stored profiles with pagination and sorting.

**Query Parameters**

| Param | Default | Description |
|---|---|---|
| `page` | `1` | Page number |
| `limit` | `10` | Results per page (max 100) |
| `sort` | `activity_score` | Sort field: `followers`, `total_stars`, `activity_score`, `public_repos`, `analyzed_at` |

**Example**
```
GET /api/profiles?page=1&limit=5&sort=followers
```

**Response** `200`
```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 5,
    "total": 42,
    "total_pages": 9,
    "sort": "followers"
  }
}
```

---

### `GET /api/profiles/:username`

Get full stored data for a single profile, including all repositories and language stats.

**Example**
```
GET /api/profiles/torvalds
```

**Response** `200`
```json
{
  "success": true,
  "data": {
    "github_username": "torvalds",
    "activity_score": 670008.0,
    "repositories": [ ... ],
    "language_stats": [ ... ]
  }
}
```

---

### `PUT /api/profiles/:username/refresh`

Re-fetch the profile from GitHub and update all stored data.

```
PUT /api/profiles/torvalds/refresh
```

---

### `DELETE /api/profiles/:username`

Remove a stored profile and all related data.

```
DELETE /api/profiles/torvalds
```

**Response** `200`
```json
{ "success": true, "message": "Profile 'torvalds' deleted successfully" }
```

---

### `GET /api/profiles/compare?users=a,b`

Side-by-side comparison of 2–5 stored profiles.

**Query Parameters**

| Param | Required | Description |
|---|---|---|
| `users` | ✅ | Comma-separated GitHub usernames (2–5) |

**Example**
```
GET /api/profiles/compare?users=torvalds,gvanrossum
```

**Response** `200`
```json
{
  "success": true,
  "data": {
    "profiles": [
      {
        "github_username": "torvalds",
        "followers": 240000,
        "total_stars": 215000,
        "activity_score": 670008.0,
        "top_languages": [{ "language": "C", "repo_count": 3 }]
      },
      { ... }
    ]
  }
}
```

---

## Database Schema

```
profiles
  ├── github_id (unique)
  ├── github_username (unique)
  ├── public_repos, followers, following, total_stars, total_forks
  ├── activity_score   ← computed insight
  └── analyzed_at      ← freshness timestamp

repositories  (FK → profiles, CASCADE DELETE)
  ├── stars, forks, watchers, language, topics
  └── is_fork, is_archived

language_stats  (FK → profiles, CASCADE DELETE)
  ├── language
  └── repo_count
```

---

## Error Responses

All errors follow a consistent format:

```json
{
  "success": false,
  "error": {
    "message": "GitHub user 'nobody' not found"
  }
}
```

| Status | Cause |
|---|---|
| `400` | Validation error (bad username, invalid query params) |
| `404` | GitHub user not found / profile not in DB |
| `429` | GitHub API rate limit exceeded |
| `503` | Cannot reach GitHub API |
| `500` | Unexpected server error |

---

## Activity Score Formula

```
activity_score = (total_stars × 2) + (total_forks × 1.5) + (followers × 1) + (public_repos × 0.5)
```

- **Stars ×2** — strongest signal of community impact
- **Forks ×1.5** — indicates downstream usage
- **Followers ×1** — community reach
- **Public repos ×0.5** — breadth of work (lower weight to avoid inflation by low-quality repos)
