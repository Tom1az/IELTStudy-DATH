-- IELTStudy – Adaptive Learning module
-- Lưu ý: đổi kiểu id (BIGINT) cho khớp schema hiện có của team (vd UUID trên Supabase).
-- Giả định đã có: users, courses, lessons, skills, questions, question_skills, quiz_attempts, question_responses, user_skill_mastery.

-- 1) Q-Matrix cấp lesson (content-based filtering dùng bảng này)
CREATE TABLE IF NOT EXISTS lesson_skills (
  lesson_id BIGINT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  skill_id  BIGINT NOT NULL REFERENCES skills(id)  ON DELETE CASCADE,
  weight    REAL   NOT NULL DEFAULT 1 CHECK (weight > 0 AND weight <= 1),
  PRIMARY KEY (lesson_id, skill_id)
);
CREATE INDEX IF NOT EXISTS idx_lesson_skills_skill ON lesson_skills(skill_id);

-- 2) Tiến độ học theo lesson
CREATE TABLE IF NOT EXISTS lesson_progress (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id BIGINT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed')),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, lesson_id)
);

-- 3) Tham số BKT theo skill (xuất từ pyBKT; thiếu thì dùng default trong bktParams.json)
CREATE TABLE IF NOT EXISTS skill_bkt_params (
  skill_id BIGINT PRIMARY KEY REFERENCES skills(id) ON DELETE CASCADE,
  p_l0 REAL NOT NULL, p_t REAL NOT NULL, p_s REAL NOT NULL, p_g REAL NOT NULL,
  fitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4) Lịch sử mastery (vẽ trend, tính Time-to-Mastery)
CREATE TABLE IF NOT EXISTS user_skill_mastery_history (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id BIGINT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  mastery_prob REAL NOT NULL,
  source_attempt_id BIGINT REFERENCES quiz_attempts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mastery_hist_user_time ON user_skill_mastery_history(user_id, created_at DESC);

-- 5) Log gợi ý + click => tính Precision@3 / MRR / CTR thật khi chạy production
CREATE TABLE IF NOT EXISTS recommendation_log (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id BIGINT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  rank SMALLINT NOT NULL,
  score REAL NOT NULL,
  type TEXT NOT NULL,
  rationale TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  clicked_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_reclog_user ON recommendation_log(user_id, generated_at DESC);

-- 6) Idempotency: mỗi attempt chỉ cập nhật mastery một lần
ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS mastery_processed_at TIMESTAMPTZ;
-- user_skill_mastery cần PK (user_id, skill_id) để UPSERT
-- ALTER TABLE user_skill_mastery ADD PRIMARY KEY (user_id, skill_id);
