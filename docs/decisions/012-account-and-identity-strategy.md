# Decision 012 — Account and identity strategy

**Date:** 2026-10-05
**Status:** Proposed — awaiting Jethro's confirmation

Source: `docs/OPUS_PLAN_REVIEW.md` section 3.

---

**Decision.** Desktop works fully signed out (local first, as on iOS). The first desktop sign in provider is **Sign in with Apple through the system browser** (Supabase `signInWithOAuth`, PKCE, redirect to `belific://auth-callback`, handled by `app.setAsDefaultProtocolClient` and the `second-instance` event). Because the user id is the same Apple `sub`, desktop reaches the same Supabase user as the iPhone, with no iOS release needed. Google is deferred. When it is added, it is linked from an already signed in session with `linkIdentity`, which needs manual linking enabled in the dashboard. A fresh Google sign in is never offered to a user who already has an Apple account.

**Setup Jethro must do.** Create an Apple Services ID grouped with the primary App ID `com.najeca.belific`, add the Supabase callback URL to it, generate the client secret, and add the Services ID to the Supabase Apple provider client id list next to the bundle id. Put a calendar reminder for secret rotation 5 months out. Add `belific://auth-callback` to the redirect allow list.

**Verify before building** [unverified]: that a Services ID under the same team returns the same `sub` as the native flow. Test with a throwaway Apple ID first.

## Related Notes
- [[docs/OPUS_PLAN_REVIEW]]
- [[docs/decisions/009-desktop-platform-and-auth]]
