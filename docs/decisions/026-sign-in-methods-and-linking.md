# Decision 026 - Sign in methods and account linking

**Date:** 2026-10-08
**Status:** Proposed. Awaiting Jethro's confirmation. Confirm after one real Google sign in from the desktop and the linking test in `docs/ACCOUNT_LINKING_TEST.md`.

Source: Jethro's instruction for checkpoint 12, answers 1 to 6 (app 2.18.0, with email sign in planned for a later minor version; reworded 2026-10-16: 2.19.0 to 2.22.0 went to build plan phases 2 to 5, so it takes the next free minor version when it is built). Builds on decision 012 (account and identity strategy) and decision 025 (profile icon and pages).

---

**Decision.**
- **Signing in stays optional.** A signed out computer works fully and never touches the network. The Sign in page says so ("You can use Belific without an account.") and "Not now" is as easy to reach as any method.
- **2.18.0 adds a Sign in page with Apple and Google only.** Both go through the system browser with PKCE, the same pattern, the same `belific://auth-callback` callback and the same validation (one pending sign in, started in this run, ten minute window, single use, exchange needs the locally held verifier). The main process opens a URL only for exactly one provider from the list apple, google.
- **The profile popover and Settings, Account each have one Sign in button** that opens the page. The old "Sign in with Apple" buttons are gone from both. There is no "Use email" button until that release exists.
- **The next free minor version (this was 2.19.0 when written; a later release, needs its own approval) adds email and password with one time codes**, not links (a link opens in a browser and cannot come back to the desktop app reliably). Minimum password length 10. Email delivery is deferred because the sending domain is not known to be ready.
- **The iPhone is unchanged:** Apple only, through the native sheet. It offers no Google, so Apple's rule about equivalent login options is not triggered there.
- **Account linking is not done by Belific.** No code guesses, merges or links accounts. Supabase's own rule for identities with the same verified email applies [unverified], and Apple's private relay address means an Apple and a Google sign in by the same person can end as two users. The existing account choice question protects local data when a different user signs in. See `docs/ACCOUNT_LINKING_TEST.md`.
- **"Add a sign in method" in Settings, Account (manual linking from a signed in session) is not built in 2.18.0.** Supabase needs manual linking switched on in the dashboard, which is an extra dashboard setting, so it waits for that release.
- **What is shown for an account** is the email, else "Apple account" or "Google account".
- **Failure wording does not name a provider** and never echoes a provider's or a server's text, so both fail with identical sentences.

**Not decided here.** Apple token revocation when an account is deleted (a separate item, findings in `docs/sessions/2026-10-08-cp12.md`).

**Why.** Many people have no Apple device on their computer and a Google account is the common alternative. A separate page keeps the popover small and gives the privacy lines room. Doing Apple and Google first, with the same tested flow, adds the least new surface; passwords add the most (storage, resets, codes, email) and are split off.

**Note (2026-10-15, 2.18.1, phone move checkpoint).** Jethro chose option b: **the iPhone also offers Google**, so the phone lands on the same user as the desktop (and as Landis, the login is shared). Apple stays. The bullet above ("The iPhone is unchanged") is superseded for 2.18.1. Linking an Apple and a Google sign in for one person ("Add a sign in method", `linkIdentity`, needs the manual linking switch in Supabase) comes **before any public release**, not in this build. The phone signs out with the local scope only, so signing out of the phone does not sign out the desktop or the other apps. Apple's rule about equivalent login options is met because Sign in with Apple is offered next to Google. The privacy page and terms still say Google is Windows only and must be updated before anyone but Jethro can install the phone build.

## Related Notes
- [[docs/decisions/012-account-and-identity-strategy]]
- [[docs/decisions/025-profile-icon-settings-labels-pages]]
- [[docs/GOOGLE_SIGNIN_SETUP]]
- [[docs/ACCOUNT_LINKING_TEST]]
