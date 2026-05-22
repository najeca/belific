---
name: supabase-migration
description: Generate and apply a Supabase migration for the Landis database. Validates RLS policies, checks against existing schema, and updates types and docs.
---

# Supabase Migration

## Instructions

1. Call `mcp__claude_ai_Supabase__list_tables` — inspect current schema before writing any SQL.
2. Draft the migration SQL. Every new table requires the two lines in the RLS Rules section below.
3. Show the complete SQL to the user and wait for explicit approval.
4. Call `mcp__claude_ai_Supabase__apply_migration` with the approved SQL.
5. Call `mcp__claude_ai_Supabase__generate_typescript_types` — save output to `packages/types/supabase.ts`.
6. Run `/security-review` to confirm no RLS gaps were introduced.
7. Update `docs/current-state-audit.md` with the schema change.

## RLS Rules (mandatory on every new table)

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "<table>_user_policy" ON <table>
  FOR ALL USING (auth.uid() = user_id);
```

## Existing Tables (never alter without explicit user approval)

| Table | Notes |
|-------|-------|
| `auth.users` | Managed by Supabase Auth — never touch directly |
| `work_experiences` | `user_id` FK → `auth.users` |
| `education` | `user_id` FK → `auth.users` |
| `skills` | `user_id` FK → `auth.users` |
| `achievements` | `user_id` FK → `auth.users` |
| `document_history` | JSONB `cv_json` + `cover_letter_json` |
| `generation_logs` | Service role only — no user-scoped RLS policy needed |
