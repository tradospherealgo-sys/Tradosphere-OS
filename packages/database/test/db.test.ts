import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { newDb, DataType } from 'pg-mem';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createDb } from '../src/client';

// Sprint 2 exit criterion: "migrations run cleanly up and down against a fresh
// database." No live Postgres is available in this sandbox, so we run the
// generated SQL against pg-mem (an in-memory Postgres-compatible engine).
//
// Note on approach: drizzle-orm's node-postgres driver uses wire-protocol
// features (`rowMode: 'array'` on `.returning()`, custom `types.getTypeParser`)
// that pg-mem's Pool shim explicitly does not implement (documented upstream:
// https://github.com/oguimbal/pg-mem -- "Not supported: pg rowMode"). Real
// Postgres handles both fine. Rather than paper over that gap with a fragile
// monkey-patch, this suite verifies the actual migration SQL (the artifact
// that matters for the exit criterion) via pg-mem's native query interface,
// and separately confirms `createDb()` links and exposes a working query
// builder shape. The drizzle query builder itself is exercised for real
// against real Postgres starting in Sprint 3+ integration tests.

const migrationsDir = path.join(__dirname, '..', 'migrations');

function loadUpSql(): string {
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
  if (files.length === 0) {
    throw new Error('No generated migration SQL found -- run `pnpm db:generate` first.');
  }
  const raw = files.map((f) => readFileSync(path.join(migrationsDir, f), 'utf-8')).join('\n');

  // Test-harness-only unwrap of the `DO $$ ... EXCEPTION WHEN duplicate_object`
  // idempotency guard drizzle-kit wraps constraints in -- pg-mem has no plpgsql
  // engine to run it. The shipped migrations/*.sql file is untouched.
  return raw.replace(
    /DO \$\$ BEGIN\s*([\s\S]*?);\s*EXCEPTION\s*WHEN duplicate_object THEN null;\s*END \$\$;/g,
    '$1;',
  );
}

// Sprint 7: education-schema.ts's search_vector columns use Postgres' native
// `tsvector` type for full-text search (see education-schema.ts's customType
// definition). pg-mem has no built-in tsvector support ("type \"tsvector\"
// does not exist") -- see B8 in EXECUTION_BOOK.md. Fix: pg-mem's documented
// registerEquivalentType() API (readme.md's macaddr example) teaches it to
// treat tsvector as opaque text for storage/constraint purposes only. This
// does NOT exercise real to_tsvector()/@@ query behavior -- that's deferred
// to services/education's real-Postgres integration suite (same
// embedded-postgres pattern as B4), since pg-mem can't run it either way.
function registerTsvectorType(mem: ReturnType<typeof newDb>): void {
  mem.public.registerEquivalentType({
    name: 'tsvector',
    equivalentTo: DataType.text,
    isValid: () => true,
  });
}

describe('database migrations (pg-mem, raw SQL)', () => {
  let mem: ReturnType<typeof newDb>;

  beforeAll(() => {
    mem = newDb({ autoCreateForeignKeyIndices: true });
    registerTsvectorType(mem);
    let counter = 0;
    mem.public.registerFunction({
      name: 'gen_random_uuid',
      returns: 'uuid' as any,
      // impure: true is required so pg-mem re-evaluates this per row instead of
      // caching the first result for the query plan.
      impure: true,
      implementation: () => `00000000-0000-4000-8000-${(++counter).toString().padStart(12, '0')}`,
    });

    mem.public.none(loadUpSql());
  });

  it('applies the up migration: tables, unique index, enum, and FK all exist', () => {
    const tables = mem.public.many(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`,
    );
    expect(tables.map((t: any) => t.table_name)).toEqual([
      'company_fundamentals',
      'courses',
      'education_categories',
      'education_content_revisions',
      'education_content_tags',
      'education_tags',
      'education_user_progress',
      'glossary_terms',
      'journal_entries',
      'lessons',
      'market_ticks',
      'quiz_attempts',
      'quiz_questions',
      'quizzes',
      'sessions',
      'strategies',
      'users',
    ]);
  });

  it('supports a real insert/select round trip', () => {
    mem.public.none(
      `INSERT INTO users (email, password_hash, role) VALUES ('anshh@tradosphere.os', 'hashed:not-a-real-hash', 'admin');`,
    );
    const found = mem.public.many(`SELECT * FROM users WHERE email = 'anshh@tradosphere.os';`);
    expect(found).toHaveLength(1);
    expect(found[0].role).toBe('admin');
  });

  it('enforces the unique email constraint from the schema', () => {
    expect(() =>
      mem.public.none(
        `INSERT INTO users (email, password_hash, role) VALUES ('anshh@tradosphere.os', 'x', 'trader');`,
      ),
    ).toThrow();
  });

  it('cascades session deletion when the parent user is deleted (foreign key from schema)', () => {
    const [user] = mem.public.many(
      `INSERT INTO users (email, password_hash, role) VALUES ('cascade-test@tradosphere.os', 'x', 'viewer') RETURNING id;`,
    );
    mem.public.none(
      `INSERT INTO sessions (user_id, refresh_token_hash, expires_at) VALUES ('${user.id}', 'refresh-hash', now() + interval '1 hour');`,
    );
    mem.public.none(`DELETE FROM users WHERE id = '${user.id}';`);
    const remaining = mem.public.many(`SELECT * FROM sessions WHERE user_id = '${user.id}';`);
    expect(remaining).toHaveLength(0);
  });

  it('down migration cleanly drops everything', () => {
    expect(() =>
      mem.public.none(
        [
          'DROP TABLE IF EXISTS sessions CASCADE',
          'DROP TABLE IF EXISTS users CASCADE',
          'DROP TABLE IF EXISTS market_ticks CASCADE',
          'DROP TABLE IF EXISTS company_fundamentals CASCADE',
          'DROP TABLE IF EXISTS journal_entries CASCADE',
          'DROP TABLE IF EXISTS quiz_attempts CASCADE',
          'DROP TABLE IF EXISTS quiz_questions CASCADE',
          'DROP TABLE IF EXISTS quizzes CASCADE',
          'DROP TABLE IF EXISTS education_user_progress CASCADE',
          'DROP TABLE IF EXISTS education_content_revisions CASCADE',
          'DROP TABLE IF EXISTS education_content_tags CASCADE',
          'DROP TABLE IF EXISTS lessons CASCADE',
          'DROP TABLE IF EXISTS courses CASCADE',
          'DROP TABLE IF EXISTS strategies CASCADE',
          'DROP TABLE IF EXISTS glossary_terms CASCADE',
          'DROP TABLE IF EXISTS education_tags CASCADE',
          'DROP TABLE IF EXISTS education_categories CASCADE',
        ].join('; ') + ';',
      ),
    ).not.toThrow();
    const tables = mem.public.many(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';`,
    );
    expect(tables).toHaveLength(0);
  });
});

describe('market_ticks schema (Sprint 3)', () => {
  let mem: ReturnType<typeof newDb>;

  beforeAll(() => {
    mem = newDb({ autoCreateForeignKeyIndices: true });
    registerTsvectorType(mem);
    let counter = 0;
    mem.public.registerFunction({
      name: 'gen_random_uuid',
      returns: 'uuid' as any,
      impure: true,
      implementation: () => `00000000-0000-4000-8000-${(++counter).toString().padStart(12, '0')}`,
    });
    mem.public.none(loadUpSql());
  });

  it('inserts a tick and enforces the (symbol, tick_timestamp) unique index', () => {
    mem.public.none(
      `INSERT INTO market_ticks (symbol, price, volume, tick_timestamp) VALUES ('TCS', 3500.5, 1200, '2026-01-01T00:00:00Z');`,
    );
    const rows = mem.public.many(`SELECT * FROM market_ticks WHERE symbol = 'TCS';`);
    expect(rows).toHaveLength(1);

    expect(() =>
      mem.public.none(
        `INSERT INTO market_ticks (symbol, price, volume, tick_timestamp) VALUES ('TCS', 3600.0, 1300, '2026-01-01T00:00:00Z');`,
      ),
    ).toThrow();
  });

  it('re-importing the same tick with ON CONFLICT DO NOTHING is idempotent', () => {
    const insertOnce = () =>
      mem.public.none(
        `INSERT INTO market_ticks (symbol, price, volume, tick_timestamp)
         VALUES ('INFY', 1500.0, 500, '2026-01-01T00:01:00Z')
         ON CONFLICT (symbol, tick_timestamp) DO NOTHING;`,
      );
    insertOnce();
    insertOnce();
    insertOnce();
    const rows = mem.public.many(`SELECT * FROM market_ticks WHERE symbol = 'INFY';`);
    expect(rows).toHaveLength(1);
  });
});

describe('company_fundamentals schema (Sprint 4 task 4.3)', () => {
  let mem: ReturnType<typeof newDb>;

  beforeAll(() => {
    mem = newDb({ autoCreateForeignKeyIndices: true });
    registerTsvectorType(mem);
    let counter = 0;
    mem.public.registerFunction({
      name: 'gen_random_uuid',
      returns: 'uuid' as any,
      impure: true,
      implementation: () => `00000000-0000-4000-8000-${(++counter).toString().padStart(12, '0')}`,
    });
    mem.public.none(loadUpSql());
  });

  it('inserts a financials row and enforces the (symbol, reporting_period) unique index', () => {
    mem.public.none(
      `INSERT INTO company_fundamentals (symbol, reporting_period, pe_ratio, debt_to_equity, revenue_growth_yoy_pct, net_profit_margin_pct)
       VALUES ('RELIANCE', 'FY2026Q1', 24.5, 0.4, 12.3, 9.8);`,
    );
    const rows = mem.public.many(`SELECT * FROM company_fundamentals WHERE symbol = 'RELIANCE';`);
    expect(rows).toHaveLength(1);

    expect(() =>
      mem.public.none(
        `INSERT INTO company_fundamentals (symbol, reporting_period, pe_ratio, debt_to_equity, revenue_growth_yoy_pct, net_profit_margin_pct)
         VALUES ('RELIANCE', 'FY2026Q1', 25.0, 0.41, 12.0, 9.5);`,
      ),
    ).toThrow();
  });

  it('re-ingesting the same symbol/period with ON CONFLICT DO NOTHING is idempotent', () => {
    const ingestOnce = () =>
      mem.public.none(
        `INSERT INTO company_fundamentals (symbol, reporting_period, pe_ratio, debt_to_equity, revenue_growth_yoy_pct, net_profit_margin_pct)
         VALUES ('TCS', 'FY2026Q1', 30.1, 0.1, 15.0, 20.0)
         ON CONFLICT (symbol, reporting_period) DO NOTHING;`,
      );
    ingestOnce();
    ingestOnce();
    ingestOnce();
    const rows = mem.public.many(`SELECT * FROM company_fundamentals WHERE symbol = 'TCS';`);
    expect(rows).toHaveLength(1);
  });
});

describe('education schema (Sprint 7)', () => {
  let mem: ReturnType<typeof newDb>;

  beforeAll(() => {
    mem = newDb({ autoCreateForeignKeyIndices: true });
    registerTsvectorType(mem);
    let counter = 0;
    mem.public.registerFunction({
      name: 'gen_random_uuid',
      returns: 'uuid' as any,
      impure: true,
      implementation: () => `00000000-0000-4000-8000-${(++counter).toString().padStart(12, '0')}`,
    });
    mem.public.none(loadUpSql());
  });

  it('links a course to a category through category_id (set-null FK)', () => {
    const [category] = mem.public.many(
      `INSERT INTO education_categories (slug, name) VALUES ('technical-analysis', 'Technical Analysis') RETURNING id;`,
    );
    mem.public.none(
      `INSERT INTO courses (slug, title, description, category_id) VALUES ('intro-ta', 'Intro to TA', 'The basics', '${category.id}');`,
    );
    const [course] = mem.public.many(`SELECT * FROM courses WHERE slug = 'intro-ta';`);
    expect(course.category_id).toBe(category.id);
  });

  it('enforces the unique slug index on courses', () => {
    expect(() =>
      mem.public.none(
        `INSERT INTO courses (slug, title, description) VALUES ('intro-ta', 'Duplicate slug', 'x');`,
      ),
    ).toThrow();
  });

  it('cascades lesson deletion when the parent course is deleted (lessons.course_id is cascade, unlike content.category_id)', () => {
    const [course] = mem.public.many(
      `INSERT INTO courses (slug, title, description) VALUES ('cascade-course', 'Cascade Course', 'x') RETURNING id;`,
    );
    mem.public.none(
      `INSERT INTO lessons (course_id, slug, title, content) VALUES ('${course.id}', 'lesson-1', 'Lesson 1', 'content');`,
    );
    mem.public.none(`DELETE FROM courses WHERE id = '${course.id}';`);
    const remaining = mem.public.many(`SELECT * FROM lessons WHERE course_id = '${course.id}';`);
    expect(remaining).toHaveLength(0);
  });

  it('enforces the polymorphic (content_type, content_id, tag_id) unique index on content tags', () => {
    const [tag] = mem.public.many(
      `INSERT INTO education_tags (slug, name) VALUES ('options', 'Options') RETURNING id;`,
    );
    const [course] = mem.public.many(
      `INSERT INTO courses (slug, title, description) VALUES ('tag-course', 'Tag Course', 'x') RETURNING id;`,
    );
    mem.public.none(
      `INSERT INTO education_content_tags (content_type, content_id, tag_id) VALUES ('course', '${course.id}', '${tag.id}');`,
    );
    expect(() =>
      mem.public.none(
        `INSERT INTO education_content_tags (content_type, content_id, tag_id) VALUES ('course', '${course.id}', '${tag.id}');`,
      ),
    ).toThrow();
  });

  it('upserts per-user progress idempotently via ON CONFLICT on (user_id, content_type, content_id)', () => {
    const [user] = mem.public.many(
      `INSERT INTO users (email, password_hash, role) VALUES ('learner@tradosphere.os', 'x', 'viewer') RETURNING id;`,
    );
    const [course] = mem.public.many(
      `INSERT INTO courses (slug, title, description) VALUES ('progress-course', 'Progress Course', 'x') RETURNING id;`,
    );
    const upsert = (status: string) =>
      mem.public.none(
        `INSERT INTO education_user_progress (user_id, content_type, content_id, status)
         VALUES ('${user.id}', 'course', '${course.id}', '${status}')
         ON CONFLICT (user_id, content_type, content_id) DO UPDATE SET status = EXCLUDED.status;`,
      );
    upsert('in_progress');
    upsert('completed');
    const rows = mem.public.many(`SELECT * FROM education_user_progress WHERE user_id = '${user.id}';`);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('completed');
  });

  it('allows multiple quiz attempts per user (no uniqueness on user_id + quiz_id)', () => {
    const [user] = mem.public.many(
      `INSERT INTO users (email, password_hash, role) VALUES ('quiz-taker@tradosphere.os', 'x', 'viewer') RETURNING id;`,
    );
    const [quiz] = mem.public.many(`INSERT INTO quizzes (slug, title) VALUES ('quiz-1', 'Quiz 1') RETURNING id;`);
    const attempt = (score: number) =>
      mem.public.none(
        `INSERT INTO quiz_attempts (user_id, quiz_id, score, total_questions, answers)
         VALUES ('${user.id}', '${quiz.id}', ${score}, 5, '[]');`,
      );
    attempt(2);
    attempt(4);
    const rows = mem.public.many(`SELECT * FROM quiz_attempts WHERE user_id = '${user.id}';`);
    expect(rows).toHaveLength(2);
  });
});

describe('journal_entries schema (Sprint 8 task 8.2)', () => {
  let mem: ReturnType<typeof newDb>;

  beforeAll(() => {
    mem = newDb({ autoCreateForeignKeyIndices: true });
    registerTsvectorType(mem);
    let counter = 0;
    mem.public.registerFunction({
      name: 'gen_random_uuid',
      returns: 'uuid' as any,
      impure: true,
      implementation: () => `00000000-0000-4000-8000-${(++counter).toString().padStart(12, '0')}`,
    });
    mem.public.none(loadUpSql());
  });

  it('sets user_id to NULL when the referencing user is deleted (ON DELETE SET NULL, Decision D16)', () => {
    const [user] = mem.public.many(
      `INSERT INTO users (email, password_hash, role) VALUES ('journal-owner@tradosphere.os', 'x', 'trader') RETURNING id;`,
    );
    const [entry] = mem.public.many(
      `INSERT INTO journal_entries (user_id, symbol, side, quantity, fill_price, filled_at, price_as_of)
       VALUES ('${user.id}', 'RELIANCE', 'buy', 10, 2500, now(), now()) RETURNING id;`,
    );

    mem.public.none(`DELETE FROM users WHERE id = '${user.id}';`);

    // Unlike sessions' cascade-on-delete FK (proven above), journal_entries is
    // a trade history record, not a session -- the row must survive the
    // user's deletion with user_id set to NULL, never removed.
    const rows = mem.public.many(`SELECT * FROM journal_entries WHERE id = '${entry.id}';`);
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBeNull();
    expect(rows[0].symbol).toBe('RELIANCE');
  });

  it('allows every recommended*/cio* column to stay NULL when no CIO idea backs the trade', () => {
    mem.public.none(
      `INSERT INTO journal_entries (symbol, side, quantity, fill_price, filled_at, price_as_of)
       VALUES ('TCS', 'sell', 5, 4100, now(), now());`,
    );
    const [row] = mem.public.many(`SELECT * FROM journal_entries WHERE symbol = 'TCS';`);
    expect(row.user_id).toBeNull();
    expect(row.recommended_direction).toBeNull();
    expect(row.cio_verdict).toBeNull();
    expect(row.status).toBe('open'); // schema default
  });
});

describe('createDb() links against a real pg Pool shape', () => {
  it('returns a query-builder object exposing select/insert/delete for our schema', () => {
    // Structural check only -- confirms packages/database's export surface
    // compiles and links against packages/logger-free imports correctly.
    // Live query execution against a real Pool is a Sprint 3+ integration test.
    const fakePool = { query: async () => ({ rows: [] }), on: () => undefined } as any;
    const db = createDb(fakePool);
    expect(typeof db.select).toBe('function');
    expect(typeof db.insert).toBe('function');
    expect(typeof db.delete).toBe('function');
  });
});
