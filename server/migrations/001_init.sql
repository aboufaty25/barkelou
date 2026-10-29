-- Barkelou : schéma MySQL / MariaDB (compatible Hostinger)
-- Montants en FCFA entiers. Identifiants : UUID générés par le serveur.

CREATE TABLE users (
  id             CHAR(36) NOT NULL PRIMARY KEY,
  name           VARCHAR(60) NOT NULL,
  phone          VARCHAR(20) NOT NULL UNIQUE,
  email          VARCHAR(120) NULL,
  password_hash  VARCHAR(100) NOT NULL,
  role           ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  status         ENUM('active', 'suspended') NOT NULL DEFAULT 'active',
  failed_logins  INT NOT NULL DEFAULT 0,
  locked_until   DATETIME(3) NULL,
  token_version  INT NOT NULL DEFAULT 0,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_login_at  DATETIME(3) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE campaigns (
  id            CHAR(36) NOT NULL PRIMARY KEY,
  slug          VARCHAR(80) NOT NULL UNIQUE,
  owner_id      CHAR(36) NOT NULL,
  title         VARCHAR(80) NOT NULL,
  category      VARCHAR(20) NOT NULL,
  city          VARCHAR(40) NULL,
  story         TEXT NOT NULL,
  goal          BIGINT NOT NULL,
  deadline      DATE NULL,
  cover         MEDIUMTEXT NULL,
  hide_amounts  TINYINT(1) NOT NULL DEFAULT 0,
  featured      TINYINT(1) NOT NULL DEFAULT 0,
  status        ENUM('pending', 'active', 'closed', 'suspended') NOT NULL DEFAULT 'active',
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY campaigns_owner_idx (owner_id),
  KEY campaigns_status_idx (status, created_at),
  CONSTRAINT campaigns_owner_fk FOREIGN KEY (owner_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- amount : don choisi · donor_fee : frais ajoutés au donateur · commission : part plateforme
-- net : crédité à la cagnotte · total_charged : payé via PayDunya
CREATE TABLE contributions (
  id             CHAR(36) NOT NULL PRIMARY KEY,
  campaign_id    CHAR(36) NOT NULL,
  user_id        CHAR(36) NULL,
  donor_name     VARCHAR(60) NOT NULL,
  anonymous      TINYINT(1) NOT NULL DEFAULT 0,
  message        VARCHAR(300) NULL,
  amount         BIGINT NOT NULL,
  donor_fee      BIGINT NOT NULL DEFAULT 0,
  commission     BIGINT NOT NULL DEFAULT 0,
  net            BIGINT NOT NULL,
  total_charged  BIGINT NOT NULL,
  channel        VARCHAR(20) NOT NULL,
  status         ENUM('pending', 'paid', 'failed', 'cancelled') NOT NULL DEFAULT 'pending',
  provider_token VARCHAR(100) NULL UNIQUE,
  provider_mode  VARCHAR(10) NULL,
  receipt_url    VARCHAR(500) NULL,
  customer_phone VARCHAR(30) NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  paid_at        DATETIME(3) NULL,
  KEY contributions_campaign_idx (campaign_id, status, paid_at),
  KEY contributions_user_idx (user_id),
  KEY contributions_status_idx (status, created_at),
  CONSTRAINT contributions_campaign_fk FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
  CONSTRAINT contributions_user_fk FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- amount : débité du solde · fee : frais de retrait · payout : envoyé au bénéficiaire
CREATE TABLE withdrawals (
  id              CHAR(36) NOT NULL PRIMARY KEY,
  campaign_id     CHAR(36) NOT NULL,
  owner_id        CHAR(36) NOT NULL,
  amount          BIGINT NOT NULL,
  fee             BIGINT NOT NULL DEFAULT 0,
  payout          BIGINT NOT NULL,
  method          VARCHAR(20) NOT NULL,
  phone           VARCHAR(20) NOT NULL,
  status          ENUM('pending_review', 'processing', 'success', 'failed', 'rejected') NOT NULL DEFAULT 'pending_review',
  provider_token  VARCHAR(100) NULL UNIQUE,
  provider_tx     VARCHAR(100) NULL,
  failure_reason  VARCHAR(255) NULL,
  reviewed_by     CHAR(36) NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY withdrawals_campaign_idx (campaign_id, status),
  KEY withdrawals_owner_idx (owner_id, created_at),
  KEY withdrawals_status_idx (status, updated_at),
  CONSTRAINT withdrawals_campaign_fk FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
  CONSTRAINT withdrawals_owner_fk FOREIGN KEY (owner_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE settings (
  setting_key  VARCHAR(64) NOT NULL PRIMARY KEY,
  value        TEXT NOT NULL,
  updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by   CHAR(36) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_logs (
  id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_id    CHAR(36) NULL,
  action      VARCHAR(64) NOT NULL,
  target      VARCHAR(64) NULL,
  meta        TEXT NULL,
  ip          VARCHAR(64) NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY audit_logs_action_idx (action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE favorites (
  user_id     CHAR(36) NOT NULL,
  campaign_id CHAR(36) NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, campaign_id),
  CONSTRAINT favorites_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT favorites_campaign_fk FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
