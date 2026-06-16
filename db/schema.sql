-- ============================================================
-- GitHub Profile Analyzer — Database Schema
-- Run: mysql -u root -p github_analyzer < db/schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS github_analyzer
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE github_analyzer;

-- ------------------------------------------------------------
-- profiles: core snapshot of a GitHub user
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id                 INT            NOT NULL AUTO_INCREMENT,
  github_id          BIGINT         NOT NULL,
  github_username    VARCHAR(39)    NOT NULL,
  name               VARCHAR(255)   DEFAULT NULL,
  bio                TEXT           DEFAULT NULL,
  location           VARCHAR(255)   DEFAULT NULL,
  company            VARCHAR(255)   DEFAULT NULL,
  blog               VARCHAR(500)   DEFAULT NULL,
  avatar_url         VARCHAR(500)   DEFAULT NULL,
  email              VARCHAR(255)   DEFAULT NULL,
  twitter_username   VARCHAR(255)   DEFAULT NULL,
  hireable           TINYINT(1)     DEFAULT NULL,
  public_repos       INT            NOT NULL DEFAULT 0,
  public_gists       INT            NOT NULL DEFAULT 0,
  followers          INT            NOT NULL DEFAULT 0,
  following          INT            NOT NULL DEFAULT 0,
  total_stars        INT            NOT NULL DEFAULT 0   COMMENT 'Sum of stargazers across all repos',
  total_forks        INT            NOT NULL DEFAULT 0   COMMENT 'Sum of forks across all repos',
  activity_score     DECIMAL(10,2)  NOT NULL DEFAULT 0   COMMENT 'Weighted computed insight',
  account_created_at DATETIME       DEFAULT NULL         COMMENT 'GitHub account creation date',
  account_updated_at DATETIME       DEFAULT NULL         COMMENT 'GitHub account last update date',
  analyzed_at        DATETIME       NOT NULL             COMMENT 'When we last fetched from GitHub',
  created_at         DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_github_id       (github_id),
  UNIQUE KEY uq_github_username (github_username),
  INDEX idx_followers   (followers DESC),
  INDEX idx_stars       (total_stars DESC),
  INDEX idx_score       (activity_score DESC),
  INDEX idx_analyzed_at (analyzed_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- repositories: top public repos per user (up to 100)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS repositories (
  id             INT            NOT NULL AUTO_INCREMENT,
  profile_id     INT            NOT NULL,
  github_repo_id BIGINT         NOT NULL,
  repo_name      VARCHAR(255)   NOT NULL,
  full_name      VARCHAR(512)   NOT NULL,
  description    TEXT           DEFAULT NULL,
  language       VARCHAR(100)   DEFAULT NULL,
  stars          INT            NOT NULL DEFAULT 0,
  forks          INT            NOT NULL DEFAULT 0,
  watchers       INT            NOT NULL DEFAULT 0,
  open_issues    INT            NOT NULL DEFAULT 0,
  is_fork        TINYINT(1)     NOT NULL DEFAULT 0,
  is_archived    TINYINT(1)     NOT NULL DEFAULT 0,
  repo_url       VARCHAR(500)   NOT NULL,
  homepage_url   VARCHAR(500)   DEFAULT NULL,
  topics         JSON           DEFAULT NULL            COMMENT 'Array of topic strings',
  repo_created_at DATETIME      DEFAULT NULL,
  repo_updated_at DATETIME      DEFAULT NULL,
  created_at     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_github_repo_id (github_repo_id),
  CONSTRAINT fk_repos_profile FOREIGN KEY (profile_id)
    REFERENCES profiles (id) ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_profile_stars (profile_id, stars DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- language_stats: aggregated language distribution per user
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS language_stats (
  id          INT          NOT NULL AUTO_INCREMENT,
  profile_id  INT          NOT NULL,
  language    VARCHAR(100) NOT NULL,
  repo_count  INT          NOT NULL DEFAULT 0  COMMENT 'Number of repos using this language',
  PRIMARY KEY (id),
  CONSTRAINT fk_langs_profile FOREIGN KEY (profile_id)
    REFERENCES profiles (id) ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE KEY uq_profile_lang (profile_id, language),
  INDEX idx_profile_id (profile_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
