CREATE TABLE files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  mime_type     TEXT NOT NULL
    CHECK (mime_type IN ('image/png', 'image/jpeg', 'application/pdf', 'text/plain')),
  size_bytes    INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- GET /files lista por usuario ordenado por fecha descendente (SPEC 1.3).
CREATE INDEX files_user_id_created_at_idx ON files (user_id, created_at DESC);
