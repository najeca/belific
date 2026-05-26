# Decision 003 — No Supabase for v1

**Date:** May 2026  
**Status:** Decided — do not change

---

## Decision
No auth, no database, no Supabase for v1.
Schedule data lives in `data.js`.
Reminders live in the OS notification store.
No user account required.

## Reason
Toyota Yaris — simplest solution always.
Belific is a personal tool. No login friction.
No backend to maintain, secure, or pay for.
All data the app needs (schedule, notification store) is already on-device.

## Consequences
- No `getSupabase()` / `createClient()` pattern needed
- No `expo-secure-store` required for v1
- Polyfill entry point (`react-native-get-random-values`) is still required because expo packages pull it in transitively — keep it in `mobile/index.js` line 1

## Do Not Change Unless
Multi-device sync is needed, or the user wants their reminders to survive a phone reset.

---

## Related Notes
- [[architecture]]
- [[002-local-notifications-only]]
