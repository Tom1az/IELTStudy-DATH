#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/4557b4ac18820c6c20ff4814c45b59bc5cf1d731857137911f00db5b4c4c83b1/contract';
import startContract from '../../snapshots/4557b4ac18820c6c20ff4814c45b59bc5cf1d731857137911f00db5b4c4c83b1/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/6bb279f3a6e117a9aa3142cf1e1f9fcc7fa1959709b1cbca6e12713cdd418e65/contract';
import endContract from '../../snapshots/6bb279f3a6e117a9aa3142cf1e1f9fcc7fa1959709b1cbca6e12713cdd418e65/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'admin_audit_logs',
        columns: [
          col('action', 'character varying(64)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 64 } },
          }),
          col('actor_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('audit_id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('details', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('summary', 'character varying(500)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 500 } },
          }),
          col('target_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('target_type', 'character varying(32)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 32 } },
          }),
        ],
        constraints: [primaryKey(['audit_id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'attempt_feedback',
        columns: [
          col('attempt_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('comment', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('instructor_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('score_override', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['attempt_id']),
          checkExpression(
            'attempt_feedback_score_nonnegative_adb8949a',
            'score_override IS NULL OR score_override >= 0',
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'content_reports',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('handled_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('handled_by_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('note', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('reason', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('report_id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('reporter_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('open'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('target_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('target_type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['report_id']),
          checkExpression(
            'content_reports_handled_when_closed_94128ffc',
            "(status = 'open') = (handled_at IS NULL)",
          ),
          checkExpression(
            'content_reports_status_check_342b8d8d',
            `"status" IN ('open', 'resolved', 'dismissed')`,
          ),
          checkExpression(
            'content_reports_target_type_check_fe68a219',
            `"target_type" IN ('comment', 'lesson', 'question')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'lesson_comments',
        columns: [
          col('body', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('comment_id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('deleted_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('deleted_by_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('lesson_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('parent_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('user_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['comment_id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'notifications',
        columns: [
          col('body', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('link', 'character varying(1024)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 1024 } },
          }),
          col('notification_id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('read_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('title', 'character varying(255)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('type', 'character varying(64)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 64 } },
          }),
          col('user_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['notification_id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'password_reset_tokens',
        columns: [
          col('created_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('expires_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('token_hash', 'character varying(64)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 64 } },
          }),
          col('token_id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('used_at', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('user_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['token_id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'quiz_attempts',
        column: col('draft_answers', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'quiz_attempts',
        column: col('draft_saved_at', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'users',
        column: col('password_changed_at', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'content_reports',
        constraint: 'content_reports_reporter_id_target_type_target_id_key',
        columns: ['reporter_id', 'target_type', 'target_id'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'password_reset_tokens',
        constraint: 'password_reset_tokens_token_hash_key',
        columns: ['token_hash'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'admin_audit_logs',
        index: 'admin_audit_logs_action_idx_cd0d2116',
        columns: ['action'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'admin_audit_logs',
        index: 'admin_audit_logs_actor_id_idx_69a2164d',
        columns: ['actor_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'admin_audit_logs',
        index: 'admin_audit_logs_created_at_idx_225d8c0f',
        columns: ['created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'attempt_feedback',
        index: 'attempt_feedback_instructor_id_idx_50db9bd8',
        columns: ['instructor_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'content_reports',
        index: 'content_reports_handled_by_id_idx_1d05907c',
        columns: ['handled_by_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'content_reports',
        index: 'content_reports_status_created_at_idx_1bbe8adf',
        columns: ['status', 'created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'content_reports',
        index: 'content_reports_target_type_target_id_idx_792315bb',
        columns: ['target_type', 'target_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'lesson_comments',
        index: 'lesson_comments_deleted_by_id_idx_783fe282',
        columns: ['deleted_by_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'lesson_comments',
        index: 'lesson_comments_lesson_id_created_at_idx_2a1925f7',
        columns: ['lesson_id', 'created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'lesson_comments',
        index: 'lesson_comments_parent_id_idx_ab33b399',
        columns: ['parent_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'lesson_comments',
        index: 'lesson_comments_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'notifications',
        index: 'notifications_user_id_created_at_idx_b562028f',
        columns: ['user_id', 'created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'password_reset_tokens',
        index: 'password_reset_tokens_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'admin_audit_logs',
        foreignKey: {
          name: 'admin_audit_logs_actor_id_fkey',
          columns: ['actor_id'],
          references: { schema: 'public', table: 'users', columns: ['user_id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'attempt_feedback',
        foreignKey: {
          name: 'attempt_feedback_attempt_id_fkey',
          columns: ['attempt_id'],
          references: { schema: 'public', table: 'quiz_attempts', columns: ['attempt_id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'attempt_feedback',
        foreignKey: {
          name: 'attempt_feedback_instructor_id_fkey',
          columns: ['instructor_id'],
          references: { schema: 'public', table: 'users', columns: ['user_id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'content_reports',
        foreignKey: {
          name: 'content_reports_reporter_id_fkey',
          columns: ['reporter_id'],
          references: { schema: 'public', table: 'users', columns: ['user_id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'content_reports',
        foreignKey: {
          name: 'content_reports_handled_by_id_fkey',
          columns: ['handled_by_id'],
          references: { schema: 'public', table: 'users', columns: ['user_id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'lesson_comments',
        foreignKey: {
          name: 'lesson_comments_lesson_id_fkey',
          columns: ['lesson_id'],
          references: { schema: 'public', table: 'lessons', columns: ['lesson_id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'lesson_comments',
        foreignKey: {
          name: 'lesson_comments_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'users', columns: ['user_id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'lesson_comments',
        foreignKey: {
          name: 'lesson_comments_parent_id_fkey',
          columns: ['parent_id'],
          references: { schema: 'public', table: 'lesson_comments', columns: ['comment_id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'lesson_comments',
        foreignKey: {
          name: 'lesson_comments_deleted_by_id_fkey',
          columns: ['deleted_by_id'],
          references: { schema: 'public', table: 'users', columns: ['user_id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'notifications',
        foreignKey: {
          name: 'notifications_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'users', columns: ['user_id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'password_reset_tokens',
        foreignKey: {
          name: 'password_reset_tokens_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'users', columns: ['user_id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
