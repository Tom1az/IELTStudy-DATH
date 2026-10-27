-- =====================================================================
-- IELTStudy – Advanced component (BKT + Recommendation)
-- Bảng/cột BỔ SUNG so với Relational Data Model trong proposal.
-- Cần thống nhất với nhóm Backend trước khi freeze schema (tuần 40).
-- Kiểu id (uuid/bigint) hãy sửa cho khớp với schema chính.
-- =====================================================================

-- 1) Gắn skill cho bài học -> nền tảng của Content-Based Filtering
CREATE TABLE IF NOT EXISTS lesson_skills (
  lesson_id  BIGINT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  skill_id   BIGINT NOT NULL REFERENCES skills(id)  ON DELETE CASCADE,
  weight     NUMERIC(3,2) NOT NULL DEFAULT 1.0 CHECK (weight > 0 AND weight <= 1),
  PRIMARY KEY (lesson_id, skill_id)
);
CREATE INDEX IF NOT EXISTS idx_lesson_skills_skill ON lesson_skills(skill_id);

-- 2) Đánh dấu micro-lesson dùng để remediation
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS is_remedial BOOLEAN NOT NULL DEFAULT FALSE;

-- 3) Đăng ký khoá học & tiến độ bài học (Dashboard: completion progress)
CREATE TABLE IF NOT EXISTS enrollments (
  user_id     BIGINT NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  course_id   BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, course_id)
);

CREATE TABLE IF NOT EXISTS lesson_progress (
  user_id      BIGINT NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  lesson_id    BIGINT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  status       TEXT   NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed')),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, lesson_id)
);

-- 4) Lịch sử mastery theo từng attempt: vẽ trend + đảm bảo idempotent
CREATE TABLE IF NOT EXISTS mastery_history (
  id             BIGSERIAL PRIMARY KEY,
  user_id        BIGINT NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  skill_id       BIGINT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  attempt_id     BIGINT NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  source         TEXT   NOT NULL CHECK (source IN ('placement','quiz')),
  mastery_before NUMERIC(5,4),
  mastery_after  NUMERIC(5,4) NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, skill_id)
);
CREATE INDEX IF NOT EXISTS idx_mastery_history_user_time ON mastery_history(user_id, created_at);

-- 5) Index phục vụ latency < 300 ms
CREATE INDEX IF NOT EXISTS idx_user_skill_mastery_user ON user_skill_mastery(user_id);
CREATE INDEX IF NOT EXISTS idx_question_responses_attempt ON question_responses(attempt_id, attempt_order);
CREATE INDEX IF NOT EXISTS idx_question_skills_question ON question_skills(question_id);
