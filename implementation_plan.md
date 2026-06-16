# GitHub Profile Analyzer API — Implementation Plan

A backend REST API that fetches GitHub user profile data, analyzes it, stores insights in MySQL, and exposes endpoints to query the stored data.

---

## Proposed Extra Features (Beyond Requirements)

| Feature | Rationale |
|---|---|
| **Re-analysis / Refresh** | Re-fetch a profile from GitHub and update stale data |
| **Language breakdown** | Aggregate top programming languages across all public repos |
| **Activity score** | Computed metric: stars + forks + followers (weighted) |
| **Pagination + filtering** | `GET /profiles?page=1&limit=10&sort=followers` |
| **Profile comparison** | `GET /compare?users=torvalds,gvanrossum` |
| **Rate-limit awareness** | Detect GitHub API rate limits and return graceful errors |
| **GitHub token support** | Optional `GITHUB_TOKEN` env var to raise API rate limit from 60 → 5000 req/hr |
| **Health check endpoint** | `GET /health` — checks DB + GitHub API connectivity |
| **Request validation** | `express-validator` for all inputs |
| **Structured logging** | `morgan` HTTP logger + custom error handler |

---

## Project Structure

```
github-analyzer/
├── src/
│   ├── config/
│   │   └── db.js            # MySQL connection pool (mysql2/promise)
│   ├── controllers/
│   │   └── profileController.js
│   ├── routes/
│   │   └── profileRoutes.js
│   ├── services/
│   │   ├── githubService.js  # GitHub API calls (axios)
│   │   └── analysisService.js # Scoring + insight computation
│   ├── middleware/
│   │   └── errorHandler.js
│   └── app.js               # Express app setup
├── db/
│   └── schema.sql           # DDL for all tables
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## Database Schema

### `profiles` table — core GitHub user snapshot
| Column | Type | Notes |
|---|---|---|
| `id` | INT PK AUTO_INCREMENT | |
| `github_username` | VARCHAR(39) UNIQUE | GitHub max username length |
| `name` | VARCHAR(255) | Display name |
| `bio` | TEXT | |
| `location` | VARCHAR(255) | |
| `company` | VARCHAR(255) | |
| `blog` | VARCHAR(500) | |
| `avatar_url` | VARCHAR(500) | |
| `github_id` | BIGINT UNIQUE | Stable GitHub user ID |
| `public_repos` | INT | |
| `public_gists` | INT | |
| `followers` | INT | |
| `following` | INT | |
| `account_created_at` | DATETIME | GitHub `created_at` |
| `account_updated_at` | DATETIME | GitHub `updated_at` |
| `activity_score` | DECIMAL(10,2) | Computed insight |
| `analyzed_at` | DATETIME | When we last fetched |
| `created_at` | DATETIME DEFAULT NOW() | |

### `repositories` table — top repos per user
| Column | Type | Notes |
|---|---|---|
| `id` | INT PK | |
| `profile_id` | INT FK → profiles | |
| `repo_name` | VARCHAR(255) | |
| `description` | TEXT | |
| `language` | VARCHAR(100) | |
| `stars` | INT | |
| `forks` | INT | |
| `watchers` | INT | |
| `is_fork` | TINYINT(1) | |
| `repo_url` | VARCHAR(500) | |
| `created_at` / `updated_at` | DATETIME | |

### `language_stats` table — aggregated language distribution
| Column | Type | Notes |
|---|---|---|
| `id` | INT PK | |
| `profile_id` | INT FK → profiles | |
| `language` | VARCHAR(100) | |
| `repo_count` | INT | How many repos use this lang |

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/profiles/analyze` | Analyze + store a GitHub username |
| `GET` | `/api/profiles` | List all stored profiles (paginated) |
| `GET` | `/api/profiles/:username` | Get full stored data for one user |
| `PUT` | `/api/profiles/:username/refresh` | Re-fetch from GitHub and update DB |
| `DELETE` | `/api/profiles/:username` | Delete a profile from DB |
| `GET` | `/api/profiles/compare` | Compare 2+ profiles (`?users=a,b`) |
| `GET` | `/health` | Health check (DB + GitHub API) |

---

## Key Implementation Details

### GitHub Service (`githubService.js`)
- Uses `axios` with an `Authorization: token <GITHUB_TOKEN>` header (optional)
- Fetches: `GET /users/{username}` and `GET /users/{username}/repos?per_page=100&sort=updated`
- Handles 404 (user not found), 403 (rate limited), 5xx errors explicitly

### Analysis Service (`analysisService.js`)
- **Activity Score** = `(stars * 2) + (forks * 1.5) + (followers * 1) + (public_repos * 0.5)`
- **Language Stats** = reduce repos array → `{ Python: 12, JavaScript: 8, ... }`
- Top N repos by stars

### DB Config (`db.js`)
- `mysql2/promise` connection pool
- Pool size configurable via env var

---

## Environment Variables (`.env`)

```
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=github_analyzer
GITHUB_TOKEN=ghp_xxxxxxx   # optional but recommended
```

---

## Dependencies

| Package | Purpose |
|---|---|
| `express` | HTTP framework |
| `mysql2` | MySQL driver (promise API) |
| `axios` | GitHub API HTTP client |
| `dotenv` | Environment config |
| `express-validator` | Input validation |
| `morgan` | HTTP request logging |
| `cors` | Cross-origin headers |
| `nodemon` (dev) | Auto-restart |

---

## Verification Plan

### Automated
- Manual `curl` / Postman test suite documented in `README.md`
- Schema applied via `schema.sql`

### Manual
1. `POST /api/profiles/analyze` with `{ "username": "torvalds" }` → confirm DB insert
2. `GET /api/profiles/torvalds` → confirm full profile + repos + languages returned
3. `GET /api/profiles?page=1&limit=5&sort=followers` → confirm pagination
4. `PUT /api/profiles/torvalds/refresh` → confirm `analyzed_at` updated
5. `GET /api/profiles/compare?users=torvalds,gvanrossum` → confirm side-by-side diff
6. `GET /health` → confirm DB + GitHub API connectivity check
