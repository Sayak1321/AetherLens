-- PostgreSQL Schema for GitHub Profile Analyzer

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
);

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
);

CREATE TABLE IF NOT EXISTS language_stats (
  id SERIAL PRIMARY KEY,
  profile_id INT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  language VARCHAR(100),
  repo_count INT DEFAULT 0
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(github_username);
CREATE INDEX IF NOT EXISTS idx_profiles_github_id ON profiles(github_id);
CREATE INDEX IF NOT EXISTS idx_repositories_profile_id ON repositories(profile_id);
CREATE INDEX IF NOT EXISTS idx_language_stats_profile_id ON language_stats(profile_id);
