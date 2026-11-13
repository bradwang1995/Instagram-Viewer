CREATE TABLE conversions (
  id TEXT PRIMARY KEY NOT NULL,
  guest TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX conversions_by_guest ON conversions (guest, expires_at DESC);

CREATE TABLE fallback (
  guest TEXT PRIMARY KEY NOT NULL,
  expires_at INTEGER NOT NULL
);
