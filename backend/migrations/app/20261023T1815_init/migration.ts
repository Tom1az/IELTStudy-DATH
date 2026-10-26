#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/4557b4ac18820c6c20ff4814c45b59bc5cf1d731857137911f00db5b4c4c83b1/contract';
import endContract from '../../snapshots/4557b4ac18820c6c20ff4814c45b59bc5cf1d731857137911f00db5b4c4c83b1/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'courses',
        columns: [
          col('course_id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('instructor_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('review_feedback', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('reviewed_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('reviewed_by_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('draft'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('submitted_at', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('target_level', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('title', 'character varying(255)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['course_id']),
          checkExpression(
            'courses_rejection_has_feedback_2718b32d',
            "status <> 'rejected' OR review_feedback IS NOT NULL",
          ),
          checkExpression(
            'courses_status_check_f2707368',
            `"status" IN ('draft', 'pending_review', 'approved', 'rejected', 'archived')`,
          ),
          checkExpression(
            'courses_target_level_check_0bfcbf74',
            `"target_level" IN ('beginner', 'intermediate', 'advanced')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'enrollments',
        columns: [
          col('completed_at', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('course_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('enrolled_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('user_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['user_id', 'course_id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'lesson_progress',
        columns: [
          col('completed_at', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('lesson_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('started_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('in_progress'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('user_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['user_id', 'lesson_id']),
          checkExpression(
            'lesson_progress_completed_at_f8d33380',
            "(status = 'completed') = (completed_at IS NOT NULL)",
          ),
          checkExpression(
            'lesson_progress_status_check_d625c9f0',
            `"status" IN ('in_progress', 'completed')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'lesson_skills',
        columns: [
          col('lesson_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('skill_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('weight', 'float8', {
            notNull: true,
            default: lit(1),
            codecRef: { codecId: 'pg/float8@1' },
          }),
        ],
        constraints: [
          primaryKey(['lesson_id', 'skill_id']),
          checkExpression('lesson_skills_weight_range_3ac91c16', 'weight > 0 AND weight <= 1'),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'lessons',
        columns: [
          col('content', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('course_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('kind', 'text', {
            notNull: true,
            default: lit('core'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('lesson_id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('order_index', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('title', 'character varying(255)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['lesson_id']),
          checkExpression('lessons_kind_check_d093d521', `"kind" IN ('core', 'remedial')`),
          checkExpression('lessons_order_index_nonnegative_a6202c44', 'order_index >= 0'),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'passages_media',
        columns: [
          col('content', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('created_by_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('lesson_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('media_path', 'character varying(1024)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 1024 } },
          }),
          col('order_index', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('passage_id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('title', 'character varying(255)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['passage_id']),
          checkExpression(
            'passages_media_has_payload_6cee5a49',
            "(type = 'reading_text' AND content IS NOT NULL) OR (type <> 'reading_text' AND media_path IS NOT NULL)",
          ),
          checkExpression(
            'passages_media_type_check_7edc1389',
            `"type" IN ('reading_text', 'listening_audio', 'video')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'question_responses',
        columns: [
          col('answered_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('attempt_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('attempt_order', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('is_correct', 'bool', { notNull: true, codecRef: { codecId: 'pg/bool@1' } }),
          col('question_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('response_id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('response_time_seconds', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('user_answer', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
        ],
        constraints: [
          primaryKey(['response_id']),
          checkExpression('question_responses_order_positive_0c60fab0', 'attempt_order >= 1'),
          checkExpression(
            'question_responses_time_nonnegative_fbecd90a',
            'response_time_seconds IS NULL OR response_time_seconds >= 0',
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'question_skills',
        columns: [
          col('question_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('skill_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('weight', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
        ],
        constraints: [
          primaryKey(['question_id', 'skill_id']),
          checkExpression('question_skills_weight_range_3ac91c16', 'weight > 0 AND weight <= 1'),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'questions',
        columns: [
          col('answer_key', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('created_by_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('difficulty', 'int2', {
            notNull: true,
            default: lit(3),
            codecRef: { codecId: 'pg/int2@1' },
          }),
          col('explanation', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('options', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('passage_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('question_id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('question_text', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('question_type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['question_id']),
          checkExpression('questions_difficulty_range_6ed448a4', 'difficulty BETWEEN 1 AND 5'),
          checkExpression(
            'questions_question_type_check_9265baa9',
            `"question_type" IN ('multiple_choice', 'true_false_not_given', 'gap_fill', 'matching', 'error_identification')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'quiz_attempts',
        columns: [
          col('attempt_id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('completed_at', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('mastery_changes', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('max_score', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('quiz_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('started_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('total_score', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('user_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['attempt_id']),
          checkExpression(
            'quiz_attempts_score_on_complete_422c0529',
            '(completed_at IS NULL) = (total_score IS NULL)',
          ),
          checkExpression(
            'quiz_attempts_score_range_d229c75f',
            'total_score IS NULL OR total_score BETWEEN 0 AND max_score',
          ),
          checkExpression(
            'quiz_attempts_time_order_307f78e9',
            'completed_at IS NULL OR completed_at >= started_at',
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'quiz_questions',
        columns: [
          col('order_index', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('question_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('quiz_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['quiz_id', 'question_id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'quizzes',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('created_by_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('kind', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('lesson_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('quiz_id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('time_limit_seconds', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('title', 'character varying(255)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['quiz_id']),
          checkExpression(
            'quizzes_kind_check_007bfe91',
            `"kind" IN ('diagnostic', 'lesson', 'practice')`,
          ),
          checkExpression(
            'quizzes_kind_lesson_link_94be95bb',
            "(kind <> 'lesson' OR lesson_id IS NOT NULL) AND (kind <> 'diagnostic' OR lesson_id IS NULL)",
          ),
          checkExpression(
            'quizzes_time_limit_positive_f7eae20a',
            'time_limit_seconds IS NULL OR time_limit_seconds > 0',
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'recommendations',
        columns: [
          col('clicked_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('lesson_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('mastery_prob', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('quiz_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('rank', 'int2', { notNull: true, codecRef: { codecId: 'pg/int2@1' } }),
          col('rationale', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('recommendation_id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('score', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('skill_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('source_attempt_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('user_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['recommendation_id']),
          checkExpression('recommendations_mastery_range_03ef29df', 'mastery_prob BETWEEN 0 AND 1'),
          checkExpression(
            'recommendations_one_target_95601bd0',
            'num_nonnulls(lesson_id, quiz_id) = 1',
          ),
          checkExpression('recommendations_rank_positive_44134b3b', 'rank >= 1'),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'skills',
        columns: [
          col('category', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'character varying(255)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('skill_code', 'character varying(64)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 64 } },
          }),
          col('skill_id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['skill_id']),
          checkExpression(
            'skills_category_check_4a3c23aa',
            `"category" IN ('listening', 'reading', 'writing', 'speaking')`,
          ),
          checkExpression('skills_code_format_41111c46', "skill_code ~ '^[A-Z][A-Z0-9_]*$'"),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'user_skill_mastery',
        columns: [
          col('mastery_prob', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('observations', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('skill_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('user_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['user_id', 'skill_id']),
          checkExpression('user_skill_mastery_prob_range_03ef29df', 'mastery_prob BETWEEN 0 AND 1'),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'users',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('email', 'character varying(255)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('full_name', 'character varying(255)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('hashed_pass', 'character varying(255)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('is_active', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('role', 'text', {
            notNull: true,
            default: lit('learner'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('target_band', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('user_id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['user_id']),
          checkExpression(
            'users_role_check_f28eb4e5',
            `"role" IN ('learner', 'instructor', 'admin')`,
          ),
          checkExpression(
            'users_target_band_half_steps_cbff5ae5',
            'target_band IS NULL OR (target_band BETWEEN 0 AND 9 AND target_band * 2 = trunc(target_band * 2))',
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'question_responses',
        constraint: 'question_responses_attempt_id_question_id_key',
        columns: ['attempt_id', 'question_id'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'question_responses',
        constraint: 'question_responses_attempt_id_attempt_order_key',
        columns: ['attempt_id', 'attempt_order'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'skills',
        constraint: 'skills_skill_code_key',
        columns: ['skill_code'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'users',
        constraint: 'users_email_key',
        columns: ['email'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'courses',
        index: 'courses_instructor_id_idx_50db9bd8',
        columns: ['instructor_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'courses',
        index: 'courses_reviewed_by_id_idx_660e1779',
        columns: ['reviewed_by_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'courses',
        index: 'courses_status_idx_e98638ab',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'enrollments',
        index: 'enrollments_course_id_idx_297aaf4e',
        columns: ['course_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'lesson_progress',
        index: 'lesson_progress_lesson_id_idx_0ab04b1c',
        columns: ['lesson_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'lesson_skills',
        index: 'lesson_skills_skill_id_idx_676c8389',
        columns: ['skill_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'lessons',
        index: 'lessons_course_id_order_index_idx_5402b12d',
        columns: ['course_id', 'order_index'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'passages_media',
        index: 'passages_media_created_by_id_idx_2b1d9a03',
        columns: ['created_by_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'passages_media',
        index: 'passages_media_lesson_id_order_index_idx_f5ec59dc',
        columns: ['lesson_id', 'order_index'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'question_responses',
        index: 'question_responses_question_id_idx_fcfb223c',
        columns: ['question_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'question_responses',
        index: 'question_responses_user_answer_gin_367f4d44',
        columns: ['user_answer'],
        extras: { type: 'gin' },
      }),
      this.createIndex({
        schema: 'public',
        table: 'question_skills',
        index: 'question_skills_skill_id_idx_676c8389',
        columns: ['skill_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'questions',
        index: 'questions_created_by_id_idx_2b1d9a03',
        columns: ['created_by_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'questions',
        index: 'questions_passage_id_idx_732b1381',
        columns: ['passage_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'quiz_attempts',
        index: 'quiz_attempts_one_open_e8405198',
        columns: ['user_id', 'quiz_id'],
        extras: { where: 'completed_at IS NULL', unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'quiz_attempts',
        index: 'quiz_attempts_quiz_id_idx_0bcad934',
        columns: ['quiz_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'quiz_attempts',
        index: 'quiz_attempts_user_id_quiz_id_idx_0b8f4336',
        columns: ['user_id', 'quiz_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'quiz_questions',
        index: 'quiz_questions_question_id_idx_fcfb223c',
        columns: ['question_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'quizzes',
        index: 'quizzes_created_by_id_idx_2b1d9a03',
        columns: ['created_by_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'quizzes',
        index: 'quizzes_lesson_id_idx_0ab04b1c',
        columns: ['lesson_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'quizzes',
        index: 'quizzes_single_diagnostic_a8c7f9b1',
        columns: ['kind'],
        extras: { where: "kind = 'diagnostic'", unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'recommendations',
        index: 'recommendations_lesson_id_idx_0ab04b1c',
        columns: ['lesson_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'recommendations',
        index: 'recommendations_quiz_id_idx_0bcad934',
        columns: ['quiz_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'recommendations',
        index: 'recommendations_skill_id_idx_676c8389',
        columns: ['skill_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'recommendations',
        index: 'recommendations_source_attempt_id_idx_c1e7bc0d',
        columns: ['source_attempt_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'recommendations',
        index: 'recommendations_user_id_created_at_idx_b562028f',
        columns: ['user_id', 'created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'user_skill_mastery',
        index: 'user_skill_mastery_skill_id_idx_676c8389',
        columns: ['skill_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'courses',
        foreignKey: {
          name: 'courses_instructor_id_fkey',
          columns: ['instructor_id'],
          references: { schema: 'public', table: 'users', columns: ['user_id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'courses',
        foreignKey: {
          name: 'courses_reviewed_by_id_fkey',
          columns: ['reviewed_by_id'],
          references: { schema: 'public', table: 'users', columns: ['user_id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'enrollments',
        foreignKey: {
          name: 'enrollments_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'users', columns: ['user_id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'enrollments',
        foreignKey: {
          name: 'enrollments_course_id_fkey',
          columns: ['course_id'],
          references: { schema: 'public', table: 'courses', columns: ['course_id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'lesson_progress',
        foreignKey: {
          name: 'lesson_progress_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'users', columns: ['user_id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'lesson_progress',
        foreignKey: {
          name: 'lesson_progress_lesson_id_fkey',
          columns: ['lesson_id'],
          references: { schema: 'public', table: 'lessons', columns: ['lesson_id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'lesson_skills',
        foreignKey: {
          name: 'lesson_skills_lesson_id_fkey',
          columns: ['lesson_id'],
          references: { schema: 'public', table: 'lessons', columns: ['lesson_id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'lesson_skills',
        foreignKey: {
          name: 'lesson_skills_skill_id_fkey',
          columns: ['skill_id'],
          references: { schema: 'public', table: 'skills', columns: ['skill_id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'lessons',
        foreignKey: {
          name: 'lessons_course_id_fkey',
          columns: ['course_id'],
          references: { schema: 'public', table: 'courses', columns: ['course_id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'passages_media',
        foreignKey: {
          name: 'passages_media_lesson_id_fkey',
          columns: ['lesson_id'],
          references: { schema: 'public', table: 'lessons', columns: ['lesson_id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'passages_media',
        foreignKey: {
          name: 'passages_media_created_by_id_fkey',
          columns: ['created_by_id'],
          references: { schema: 'public', table: 'users', columns: ['user_id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'question_responses',
        foreignKey: {
          name: 'question_responses_attempt_id_fkey',
          columns: ['attempt_id'],
          references: { schema: 'public', table: 'quiz_attempts', columns: ['attempt_id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'question_responses',
        foreignKey: {
          name: 'question_responses_question_id_fkey',
          columns: ['question_id'],
          references: { schema: 'public', table: 'questions', columns: ['question_id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'question_skills',
        foreignKey: {
          name: 'question_skills_question_id_fkey',
          columns: ['question_id'],
          references: { schema: 'public', table: 'questions', columns: ['question_id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'question_skills',
        foreignKey: {
          name: 'question_skills_skill_id_fkey',
          columns: ['skill_id'],
          references: { schema: 'public', table: 'skills', columns: ['skill_id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'questions',
        foreignKey: {
          name: 'questions_passage_id_fkey',
          columns: ['passage_id'],
          references: { schema: 'public', table: 'passages_media', columns: ['passage_id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'questions',
        foreignKey: {
          name: 'questions_created_by_id_fkey',
          columns: ['created_by_id'],
          references: { schema: 'public', table: 'users', columns: ['user_id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'quiz_attempts',
        foreignKey: {
          name: 'quiz_attempts_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'users', columns: ['user_id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'quiz_attempts',
        foreignKey: {
          name: 'quiz_attempts_quiz_id_fkey',
          columns: ['quiz_id'],
          references: { schema: 'public', table: 'quizzes', columns: ['quiz_id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'quiz_questions',
        foreignKey: {
          name: 'quiz_questions_quiz_id_fkey',
          columns: ['quiz_id'],
          references: { schema: 'public', table: 'quizzes', columns: ['quiz_id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'quiz_questions',
        foreignKey: {
          name: 'quiz_questions_question_id_fkey',
          columns: ['question_id'],
          references: { schema: 'public', table: 'questions', columns: ['question_id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'quizzes',
        foreignKey: {
          name: 'quizzes_lesson_id_fkey',
          columns: ['lesson_id'],
          references: { schema: 'public', table: 'lessons', columns: ['lesson_id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'quizzes',
        foreignKey: {
          name: 'quizzes_created_by_id_fkey',
          columns: ['created_by_id'],
          references: { schema: 'public', table: 'users', columns: ['user_id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'recommendations',
        foreignKey: {
          name: 'recommendations_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'users', columns: ['user_id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'recommendations',
        foreignKey: {
          name: 'recommendations_skill_id_fkey',
          columns: ['skill_id'],
          references: { schema: 'public', table: 'skills', columns: ['skill_id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'recommendations',
        foreignKey: {
          name: 'recommendations_lesson_id_fkey',
          columns: ['lesson_id'],
          references: { schema: 'public', table: 'lessons', columns: ['lesson_id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'recommendations',
        foreignKey: {
          name: 'recommendations_quiz_id_fkey',
          columns: ['quiz_id'],
          references: { schema: 'public', table: 'quizzes', columns: ['quiz_id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'recommendations',
        foreignKey: {
          name: 'recommendations_source_attempt_id_fkey',
          columns: ['source_attempt_id'],
          references: { schema: 'public', table: 'quiz_attempts', columns: ['attempt_id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'user_skill_mastery',
        foreignKey: {
          name: 'user_skill_mastery_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'users', columns: ['user_id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'user_skill_mastery',
        foreignKey: {
          name: 'user_skill_mastery_skill_id_fkey',
          columns: ['skill_id'],
          references: { schema: 'public', table: 'skills', columns: ['skill_id'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
