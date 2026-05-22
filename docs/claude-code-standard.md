# Claude Code Operating Standard
> Version: 1.0 | Last updated: 16 May 2026

## Core Philosophy

> [!TIP] The Golden Rule
> Prompt skills, not Claude. Trade AI tokens for code compute wherever possible.

| Role | Tool |
|------|------|
| 🧠 Brain | Obsidian — source of truth |
| 🤝 Hands | Claude Code — builds and executes |
| 🛡️ Safety | Cursor — reviews and audits |

---

## Session Protocol

### Opening Message (every session)
Read docs/current-state-audit.md, docs/architecture.md, docs/ubiquitous-language.md, and docs/claude-code-standard.md then summarise what you understand before we begin.
## Closing Message (every session)

Run /session-close

### Before any large milestone

1. Press `Shift+Tab` to enter Plan Mode 
2. Claude Code describes all changes in Markdown first 
3. Copy plan into `docs/sessions/YYYY-MM-DD.md` 
4. Approve before any code is written

---

## Skill Architecture

### Layer 1 — Description 
Two sentences maximum. Specific enough that Claude Code knows exactly when to invoke it without reading the full skill. 
> [!EXAMPLE] Bad vs Good 
> > ❌ "helps with API stuff" 
> > > ✅ "Use when generating a Supabase migration. Checks RLS policies and validates against existing schema." 
> > > 
### Layer 2 — Instructions Step by step. No ambiguity. Claude Code follows this exactly. 
> > > 
### Layer 3 — Tools Scripts, API calls, reference files saved inside the skill folder. 
> [!NOTE] Key Principle
> If a script works, save it inside the skill. Never rewrite a working script.
> > Code is deterministic. AI is not. Use code when you can. 
> > 
---

## Skill Flags 
| Flag | Effect | Use When |
|------|--------|----------|
| `disable_model_invocation: true` | Only you can run it | Deploy, commit, EAS build | | `user_invocable: false` | Hidden from /menu, agent only | Background housekeeping | ----

---

## Composability Rules
- [ ] One skill does one thing — if it does two, split it 
- [ ] Skills can call other skills 
- [ ] Update the skill when the process improves 
- [ ] Save working scripts inside the skill — never rewrite them 
- [ ] After second repetition of a task — make it a skill 

--- 
## Quality Gates 
> [!WARNING] Toyota Yaris Standard 
> > Every commit must pass all of these before pushing 
> > 
- [ ] Zero `as any` in TypeScript 
- [ ] Zero hardcoded credentials 
- [ ] Zero `console.log` of sensitive values 
- [ ] RLS enabled on all Supabase tables touched 
- [ ] `docs/current-state-audit.md` updated 
- [ ] `docs/issues.md` updated 
--- 
## Skill Audit Prompts 
### Run periodically to keep skills sharp 

**Visibility audit:**
Audit my Claude skills for visibility. Skills with high risk side effects like deploy, commit, send messages: add disable_model_invocation: true. Skills that are pure background knowledge I would never run myself: add user_invocable: false. Show rewrites with changelog.

**Determinism audit:**
Find any step inside a skill where AI is interpreting something that is actually a fixed repeatable operation. Replace those steps with a script saved inside the skill folder. Show rewrites with changelog.

**Composability audit:**
Flag any skill that duplicates logic another skill already has. Extract shared logic into a callable script or smaller composable skill. Show rewrites with changelog.

**Self-improvement prompt:**
Review the back and forth from this session after using each skill. Enhance the skills so these gaps are handled automatically next time.

---

## Skill Folder Convention 

workflow/ — process skills, reusable across projects invoke when: building, deploying, reviewing, debugging infrastructure 

features/ — product skills, project-specific invoke when: working on a named Landis feature never copy these to new projects — write fresh ones

---

## New Project Checklist 
- [ ] Create `docs/` folder in repo root 
- [ ] Create `.claude/skills/` folder in repo root 
- [ ] Copy this file into `docs/claude-code-standard.md` 
- [ ] Write `docs/ubiquitous-language.md` before writing any code 
- [ ] Write `docs/current-state-audit.md` after first architecture decisions 
- [ ] Build `security-review` skill before milestone 1 
- [ ] Build project-specific skills as patterns repeat 

--- 
## Related Notes 
- [[current-state-audit]]
- [[architecture]]
- [[ubiquitous-language]]
- [[issues]]

