// Schema for TeachMate's own tables. Applied idempotently on boot. All three
// tables are private (COMMENT ON TABLE ... 'staging:private'): lesson plans,
// quizzes and student scores are personal information beyond a public
// username, and staging must not carry a copy of them.
async function migrate(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      kind TEXT CHECK (kind IN ('lesson','quiz')),
      subject TEXT,
      subject_name TEXT,
      grade TEXT,
      topic TEXT,
      title TEXT,
      body JSONB,
      source TEXT NOT NULL DEFAULT 'ai',
      lesson_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
      is_demo BOOLEAN NOT NULL DEFAULT false,
      demo_key TEXT,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      UNIQUE (user_id, demo_key)
    )`);
  await pool.query(
    'CREATE INDEX IF NOT EXISTS documents_user_kind_created ON documents (user_id, kind, created_at DESC)');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gradings (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      quiz_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      class_name TEXT NOT NULL,
      student_name TEXT NOT NULL,
      method TEXT CHECK (method IN ('ai','hand')),
      photo_url TEXT,
      photo_file_id TEXT,
      mc_answers JSONB,
      essay_levels JSONB,
      results JSONB,
      score NUMERIC NOT NULL,
      max_score NUMERIC NOT NULL,
      feedback TEXT,
      is_demo BOOLEAN NOT NULL DEFAULT false,
      demo_key TEXT,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      UNIQUE (user_id, demo_key)
    )`);
  await pool.query(
    'CREATE INDEX IF NOT EXISTS gradings_user_quiz_class ON gradings (user_id, quiz_id, lower(class_name))');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS demo_seeds (
      user_id TEXT PRIMARY KEY,
      seeded_at TIMESTAMPTZ NOT NULL
    )`);
  await pool.query("COMMENT ON TABLE documents IS 'staging:private'");
  await pool.query("COMMENT ON TABLE gradings IS 'staging:private'");
  await pool.query("COMMENT ON TABLE demo_seeds IS 'staging:private'");
}

module.exports = { migrate };
