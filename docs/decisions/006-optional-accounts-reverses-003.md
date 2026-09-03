# Decision 006 — Optional Accounts + Cloud Backup (Partially Reverses 003)

**Date:** 2026-07-31
**Status:** Decided

---

## Decision
Belific gains optional accounts and cloud backup: Sign in with Apple plus a
Supabase-backed sync layer for the 7 synced data types (custom events, tasks,
routines, routine completions, brain dump items, projects, custom
categories). This is a partial reversal of
[[003-no-supabase]] ("No Supabase for v1") — not a full one.

**Local-only usage remains fully supported and unaffected.** Every screen
and feature works identically signed out, exactly as before this change.
Nothing here changes behavior for anyone who never signs in. No login is
required to use the app.

## Reason
See the `docs/CHANGELOG.md` `2.0.0` entry for full detail. In short:
Jethro wanted his data to survive a phone reset / be usable across more than
one device, which decision 003 itself named as one of its own "Do Not Change
Unless" triggers ("the user wants their reminders to survive a phone
reset"). Auth without a sync layer, or sync without auth, is an unshippable
half-feature, so Phase C (Sign in with Apple) and Phase D (sync) shipped
together in `2.0.0`. Phase A (local data-shape migration, `1.7.0`) and Phase
B (Supabase project/schema, infra-only) preceded it without changing any
user-facing behavior by themselves.

## What Changed From 003
- A Supabase project now exists for Belific (ref `uucycebkpgwbktdytxvr`,
  distinct from Landis's `vlogfwnmaqorhialcqbr`, same org — always confirm
  the ref before any Supabase call).
- `getSupabase()` / `createClient()` pattern now exists (`mobile/lib/`),
  scoped to sync only, gated on being signed in.
- Sign in with Apple is available as an entirely optional account layer.
- Account deletion is real and server-verified (Supabase Edge Function).

## What Did Not Change
- No login is required to use the app — 003's "no login friction" default
  still holds for anyone who doesn't sign in.
- No backend is required to run Belific locally — the Supabase layer is
  additive, not load-bearing for core functionality.
- 003's original reasoning (Toyota Yaris simplicity, personal-tool scope,
  no backend to maintain for the default case) is still valid for why
  local-only remains the default — it just no longer describes the *only*
  mode the app supports.

## Consequences
- `mobile/lib/sync.ts` exists: local-first, optimistic, fire-and-forget push
  on write, `runFullSync()` reconcile on app foreground. Signed-out or
  offline is a fast, silent no-op.
- New quality-gate surface: anything touching the 7 synced types now needs a
  Supabase migration in `mobile/supabase/migrations/`, kept in sync with
  `sync.ts`'s remote-row mappers and `mobile/lib/types.ts`.
- `docs/decisions/003-no-supabase.md` is annotated (not rewritten) to point
  here, since a future session reading 003 cold would otherwise be misled
  into thinking "no backend" still fully holds.

## Related Notes
- [[003-no-supabase]]
- [[architecture]]
