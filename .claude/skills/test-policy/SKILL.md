---
name: test-policy
description: Use whenever code is written or changed to decide what to test: targeted tests while building, the full regression once at the end, and no test for every function.
---

# Test policy

Goal: enough testing to catch real problems, without waiting on tests that add nothing.

## What deserves a test

Logic that can go wrong silently: dates and time zones, money, sync and merging, data migrations, permissions, parsing, and anything with rules and edge cases. Skip tests for simple layout, getters and plumbing.

## While building

- Run typecheck and only the tests related to the files you changed.
- For screens you changed, drive the real app or browser once with a scripted flow and take a screenshot. Do not re-run checks for screens you did not touch.

## Before each commit

Typecheck, the related tests, and the security scan if the repo has one.

## Once, at the end of a batch

The full test suite, every gate the project defines, and the full real app regression.

## When something fails

- If an older check fails, run it on the previous commit (stash your work) to see whether you caused it. Report the result honestly, and say how many times you ran it if it looks flaky.
- Edit an existing test only when the intended behaviour changed on purpose, and say so. Never change a test just to make it pass.
- A bug the user finds gets a test that fails first, then the fix.

## Where the commands live

Read them from the Testing section of CLAUDE.md. If there is none, work them out from the package scripts, ask the user to confirm once, and record them there.
