# CLAUDE.md — AI Agent Instructions for Landis

## Who reads this
Claude Code, Cursor, any AI agent working on this repo.
Read this before touching any file.

## What Landis is
A mobile-first iOS and web app generating tailored CVs 
and cover letters using the Anthropic Claude API.

## Non-negotiable architecture decisions
1. Raw fetch to Anthropic API — never the SDK
   (SDK uses node:fs, breaks Vercel)
2. Single API call per Generation — never streaming
   (Vercel Hobby 10 second timeout)
3. Lazy Supabase client on mobile via getSupabase()
   (module-scope createClient() crashes before polyfills)
4. disableHierarchicalLookup: false in Metro
   (monorepo needs root node_modules traversal)
5. No overrides block in root package.json
   (Expo SDK 54 requires React 19)
6. Bottom tab bar only — never hamburger menu
   (iOS HIG compliance)
7. babel.config.js must exist in apps/mobile
   (without it Metro bundle crashes on launch)
8. react-native-get-random-values must be line 1 
   of apps/mobile/index.js
   (Supabase needs crypto.getRandomValues())

## Do not touch without explicit instruction
- apps/web — fully deployed, do not break it
- Supabase migrations already applied — never drop tables
- apps/mobile/lib/supabase.ts — lazy pattern must stay
- apps/mobile/index.js — polyfill order must stay

## Quality gates before every commit
- Zero as any in TypeScript
- Zero hardcoded credentials
- Zero console.log of sensitive values
- RLS on all Supabase tables
- Run bash .claude/skills/workflow/security-review/
  scripts/security-scan.sh before committing

## Domain language
Master Profile — never call it a CV
Generation — one atomic Claude API call
CVJson / CoverLetterJson — typed output names
History Snapshot — immutable archive
ProfileBullet vs CVBullet — raw vs rewritten
Rate limit — 10/day per user, resets 00:00 UTC

## Stack
Web: Next.js 14, React 19, Supabase, Vercel
Mobile: Expo SDK 54, React Native 0.81.5, EAS Build
Shared: @landis/schemas, @landis/types, @landis/api-client

## Session protocol
Opening message every session:
Read docs/current-state-audit.md, docs/architecture.md,
docs/UBIQUITOUS_LANGUAGE.md, docs/claude-code-standard.md,
docs/cursor-audit.md, and docs/CLAUDE.md then summarise.

Closing message every session:
Run /workflow/session-close