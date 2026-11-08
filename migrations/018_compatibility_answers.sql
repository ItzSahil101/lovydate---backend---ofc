CREATE TABLE IF NOT EXISTS user_compatibility_answers (
  user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  question_id SMALLINT NOT NULL CHECK (question_id BETWEEN 1 AND 10),
  selected_option VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, question_id)
);
