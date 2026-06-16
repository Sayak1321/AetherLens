# GitHub Profile Analyzer API — Walkthrough

## What Was Built

A production-ready backend REST API with Node.js + Express.js + MySQL that fetches GitHub user profiles, computes insights, stores them in a relational database, and exposes a full CRUD + analytics API.

---

## File Map

| File | Role |
|---|---|
| [app.js](file:///a:/antigravity/website/src/app.js) | Express app entry point, middleware, health check, boot |
| [db.js](file:///a:/antigravity/website/src/config/db.js) | `mysql2/promise` connection pool |
| [githubService.js](file:///a:/antigravity/website/src/services/githubService.js) | GitHub API client (axios) with rate-limit handling |
| [analysisService.js](file:///a:/antigravity/website/src/services/analysisService.js) | Pure computation: activity score, language stats, payload mapping |
| [profileController.js](file:///a:/antigravity/website/src/controllers/profileController.js) | All 6 request handlers with DB transactions |
| [profileRoutes.js](file:///a:/antigravity/website/src/routes/profileRoutes.js) | Express router + `express-validator` rules |
| [errorHandler.js](file:///a:/antigravity/website/src/middleware/errorHandler.js) | Centralized JSON error formatter |
| [schema.sql](file:///a:/antigravity/website/db/schema.sql) | DDL for `profiles`, `repositories`, `language_stats` |
| [README.md](file:///a:/antigravity/website/README.md) | Full setup guide + API reference |

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | DB + GitHub API connectivity check |
| `POST` | `/api/profiles/analyze` | Analyze & store a GitHub username |
| `GET` | `/api/profiles` | List all profiles (paginated + sortable) |
| `GET` | `/api/profiles/:username` | Full stored data for one user |
| `PUT` | `/api/profiles/:username/refresh` | Re-fetch & update from GitHub |
| `DELETE` | `/api/profiles/:username` | Delete a stored profile |
| `GET` | `/api/profiles/compare?users=a,b` | Side-by-side profile comparison |

---

## Key Design Decisions

### Upsert over Insert
`POST /analyze` uses `INSERT ... ON DUPLICATE KEY UPDATE` so analyzing the same user twice simply refreshes the data — no duplicate key errors.

### Transactional writes
All three tables (`profiles`, `repositories`, `language_stats`) are written inside a single MySQL transaction so a partial failure leaves no orphaned data.

### `/compare` before `/:username`
The `/compare` static route is registered before the `/:username` dynamic route in Express to prevent the router from treating `compare` as a username.

### Pure analysis layer
`analysisService.js` has zero side effects (no DB, no HTTP). This makes the insight logic trivially unit-testable in isolation.

### Activity Score formula
```
score = (total_stars × 2) + (total_forks × 1.5) + (followers × 1) + (public_repos × 0.5)
```
Stars get the highest weight (strongest signal of impact); repos get the lowest (to avoid inflating profiles with many empty repos).

---

## How to Run

### 1. Set up environment
```bash
cp .env.example .env
# Edit .env with your DB credentials and optionally GITHUB_TOKEN
```

### 2. Create the database
```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS github_analyzer;"
mysql -u root -p github_analyzer < db/schema.sql
```

### 3. Start the server
```bash
npm run dev       # development (nodemon)
npm start         # production
```

---

## Quick Smoke Test (curl)

```bash
# 1. Health check
curl http://localhost:3000/health

# 2. Analyze a profile
curl -X POST http://localhost:3000/api/profiles/analyze \
  -H "Content-Type: application/json" \
  -d '{"username": "torvalds"}'

# 3. Get stored profile
curl http://localhost:3000/api/profiles/torvalds

# 4. List all profiles, sorted by followers
curl "http://localhost:3000/api/profiles?sort=followers&limit=5"

# 5. Compare two profiles
curl "http://localhost:3000/api/profiles/compare?users=torvalds,gvanrossum"

# 6. Refresh profile
curl -X PUT http://localhost:3000/api/profiles/torvalds/refresh

# 7. Delete profile
curl -X DELETE http://localhost:3000/api/profiles/torvalds
```
