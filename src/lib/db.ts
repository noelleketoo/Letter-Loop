import { Pool, types } from "pg";
import { randomBytes } from "crypto";

// Return DATE columns as plain "YYYY-MM-DD" strings instead of local-time Date objects.
types.setTypeParser(1082, (v) => v);

const SCHEMA = `
create table if not exists users (
  id text primary key,
  email text not null unique,
  name text,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  token_hash text primary key,
  user_id text not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists login_tokens (
  token_hash text primary key,
  email text not null,
  redirect_to text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists login_tokens_email_idx on login_tokens(email, created_at);

create table if not exists loops (
  id text primary key,
  name text not null,
  description text not null default '',
  publish_day int not null default 1,
  created_by text references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists memberships (
  loop_id text not null references loops(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (loop_id, user_id)
);
create index if not exists memberships_user_idx on memberships(user_id);

create table if not exists issues (
  id text primary key,
  loop_id text not null references loops(id) on delete cascade,
  number int not null,
  publish_date date not null,
  status text not null default 'questions',
  question_call_sent_at timestamptz,
  answer_call_sent_at timestamptz,
  reminder_sent_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (loop_id, number)
);

create table if not exists questions (
  id text primary key,
  issue_id text not null references issues(id) on delete cascade,
  author_id text references users(id) on delete set null,
  body text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists questions_issue_idx on questions(issue_id);

create table if not exists answers (
  id text primary key,
  question_id text not null references questions(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  body text not null default '',
  updated_at timestamptz not null default now(),
  unique (question_id, user_id)
);

create table if not exists photos (
  id text primary key,
  answer_id text not null references answers(id) on delete cascade,
  url text not null,
  created_at timestamptz not null default now()
);
create index if not exists photos_answer_idx on photos(answer_id);

create table if not exists comments (
  id text primary key,
  answer_id text not null references answers(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists comments_answer_idx on comments(answer_id);
`;

const globalForDb = globalThis as unknown as { pgPool?: Pool; schemaReady?: Promise<void> };

function pool(): Pool {
  if (!globalForDb.pgPool) {
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    const local = /localhost|127\.0\.0\.1/.test(connectionString);
    globalForDb.pgPool = new Pool({
      connectionString,
      max: 5,
      ssl: local || /sslmode=disable/.test(connectionString) ? undefined : { rejectUnauthorized: false },
    });
  }
  return globalForDb.pgPool;
}

function ensureSchema(): Promise<void> {
  if (!globalForDb.schemaReady) {
    globalForDb.schemaReady = pool()
      .query(SCHEMA)
      .then(() => undefined)
      .catch((err) => {
        globalForDb.schemaReady = undefined;
        throw err;
      });
  }
  return globalForDb.schemaReady;
}

export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  await ensureSchema();
  const res = await pool().query(text, params);
  return res.rows as T[];
}

export async function one<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
export function newId(length = 12): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

// ---- Row types --------------------------------------------------------------

export type User = { id: string; email: string; name: string | null; created_at: Date };
export type Loop = {
  id: string;
  name: string;
  description: string;
  publish_day: number;
  created_by: string | null;
  created_at: Date;
};
export type Membership = { loop_id: string; user_id: string; role: "admin" | "member"; joined_at: Date | null };
export type IssueStatus = "questions" | "answers" | "published";
export type Issue = {
  id: string;
  loop_id: string;
  number: number;
  publish_date: string;
  status: IssueStatus;
  question_call_sent_at: Date | null;
  answer_call_sent_at: Date | null;
  reminder_sent_at: Date | null;
  published_at: Date | null;
};
export type Question = {
  id: string;
  issue_id: string;
  author_id: string | null;
  body: string;
  position: number;
  created_at: Date;
};
export type Answer = { id: string; question_id: string; user_id: string; body: string; updated_at: Date };
export type Photo = { id: string; answer_id: string; url: string };
export type Comment = { id: string; answer_id: string; user_id: string; body: string; created_at: Date };
