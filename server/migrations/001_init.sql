-- Barkelou : schéma initial
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  phone          text NOT NULL UNIQUE,
  email          text,
  password_hash  text NOT NULL,
  role           text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  failed_logins  integer NOT NULL DEFAULT 0,
  locked_until   timestamptz,
  token_version  integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_login_at  timestamptz
);

CREATE TABLE campaigns (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE,
  owner_id      uuid NOT NULL REFERENCES users(id),
  title         text NOT NULL,
  category      text NOT NULL,
  city          text,
  story         text NOT NULL,
  goal          bigint NOT NULL CHECK (goal > 0),
  deadline      date,
  cover         text,
  hide_amounts  boolean NOT NULL DEFAULT false,
  featured      boolean NOT NULL DEFAULT false,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'closed', 'suspended')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campaigns_owner_idx ON campaigns(owner_id);
CREATE INDEX campaigns_status_idx ON campaigns(status, created_at DESC);

-- Montants en FCFA entiers.
-- amount : don choisi ; donor_fee : frais payés en plus par le donateur ;
-- commission : part plateforme ; net : crédité à la cagnotte ; total_charged : payé via PayDunya.
CREATE TABLE contributions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    uuid NOT NULL REFERENCES campaigns(id),
  user_id        uuid REFERENCES users(id),
  donor_name     text NOT NULL,
  anonymous      boolean NOT NULL DEFAULT false,
  message        text,
  amount         bigint NOT NULL CHECK (amount > 0),
  donor_fee      bigint NOT NULL DEFAULT 0 CHECK (donor_fee >= 0),
  commission     bigint NOT NULL DEFAULT 0 CHECK (commission >= 0),
  net            bigint NOT NULL CHECK (net >= 0),
  total_charged  bigint NOT NULL CHECK (total_charged > 0),
  channel        text NOT NULL,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'cancelled')),
  provider_token text UNIQUE,
  provider_mode  text,
  receipt_url    text,
  customer_phone text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  paid_at        timestamptz
);
CREATE INDEX contributions_campaign_idx ON contributions(campaign_id, status, created_at DESC);
CREATE INDEX contributions_user_idx ON contributions(user_id);

-- amount : débité du solde ; fee : frais de retrait ; payout : envoyé au bénéficiaire
CREATE TABLE withdrawals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     uuid NOT NULL REFERENCES campaigns(id),
  owner_id        uuid NOT NULL REFERENCES users(id),
  amount          bigint NOT NULL CHECK (amount > 0),
  fee             bigint NOT NULL DEFAULT 0 CHECK (fee >= 0),
  payout          bigint NOT NULL CHECK (payout > 0),
  method          text NOT NULL,
  phone           text NOT NULL,
  status          text NOT NULL DEFAULT 'pending_review'
                  CHECK (status IN ('pending_review', 'processing', 'success', 'failed', 'rejected')),
  provider_token  text UNIQUE,
  provider_tx     text,
  failure_reason  text,
  reviewed_by     uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX withdrawals_campaign_idx ON withdrawals(campaign_id, status);
CREATE INDEX withdrawals_owner_idx ON withdrawals(owner_id, created_at DESC);

CREATE TABLE settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES users(id)
);

CREATE TABLE audit_logs (
  id          bigserial PRIMARY KEY,
  actor_id    uuid REFERENCES users(id),
  action      text NOT NULL,
  target      text,
  meta        jsonb,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_idx ON audit_logs(created_at DESC);

CREATE TABLE favorites (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, campaign_id)
);
