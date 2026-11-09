CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- El email es único sin distinguir mayúsculas (SPEC 1.3).
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));
