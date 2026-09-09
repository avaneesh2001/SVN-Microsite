PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS donors (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  mobile TEXT NOT NULL,
  city TEXT NOT NULL,
  pan TEXT,
  message TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS donations (
  id TEXT PRIMARY KEY,
  donor_id TEXT NOT NULL REFERENCES donors(id),
  transaction_type TEXT NOT NULL CHECK(transaction_type IN ('membership','general_contribution')),
  amount INTEGER NOT NULL CHECK(amount >= 100),
  currency TEXT NOT NULL DEFAULT 'INR',
  payment_status TEXT NOT NULL DEFAULT 'pending',
  gateway_order_id TEXT,
  gateway_payment_id TEXT,
  eligible_80g_amount INTEGER,
  receipt_number TEXT,
  created_at TEXT NOT NULL,
  verified_at TEXT
);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  membership_tier TEXT NOT NULL,
  membership_amount INTEGER NOT NULL,
  membership_start_date TEXT,
  membership_expiry_date TEXT,
  membership_status TEXT NOT NULL DEFAULT 'pending',
  donor_id TEXT NOT NULL REFERENCES donors(id),
  donation_id TEXT NOT NULL UNIQUE REFERENCES donations(id),
  receipt_number TEXT,
  benefits_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS organisation_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
