# Decision 012 — Account and identity strategy

**Date:** 2026-10-05
**Status:** Proposed — awaiting Jethro's confirmation

Source: `docs/OPUS_PLAN_REVIEW.md` section 3.

---

**Decision.** Desktop works fully signed out (local first, as on iOS). The first desktop sign in provider is **Sign in with Apple through the system browser** (Supabase `signInWithOAuth`, PKCE, redirect to `belific://auth-callback`, handled by `app.setAsDefaultProtocolClient` and the `second-instance` event). Because the user id is the same Apple `sub`, desktop reaches the same Supabase user as the iPhone, with no iOS release needed. Google is deferred. When it is added, it is linked from an already signed in session with `linkIdentity`, which needs manual linking enabled in the dashboard. A fresh Google sign in is never offered to a user who already has an Apple account.

**Setup Jethro must do.** Create an Apple Services ID grouped with the primary App ID `com.najeca.belific`, add the Supabase callback URL to it, generate the client secret, and add the Services ID to the Supabase Apple provider client id list next to the bundle id. Put a calendar reminder for secret rotation 5 months out. Add `belific://auth-callback` to the redirect allow list.

**Verify before building** [unverified]: that a Services ID under the same team returns the same `sub` as the native flow. Test with a throwaway Apple ID first.

## Built (2026-10-06, checkpoint 6, app 2.10.0). Status stays Proposed.

Code: `desktop/src/authLink.js` (callback parser and the pending-sign-in gate), `secureStore.js` (safeStorage wrapper), `firstSignin.js`, `main.js`, `preload.js`, `mobile/lib/desktopAuth.ts`, `mobile/components/desktop/SettingsModal.tsx`. Setup: `docs/APPLE_SIGNIN_SETUP.md`.

- **As decided:** `signInWithOAuth` (provider apple, PKCE, `skipBrowserRedirect`) with the URL opened by `shell.openExternal`; redirect `belific://auth-callback`; the `belific` protocol registered with `setAsDefaultProtocolClient` (dev mode passes the script path); the link handled at first launch and in `second-instance`; `exchangeCodeForSession`.
- **Callback validation (deviation from the plan's wording):** the redirect carries no OAuth `state`. It is `belific://auth-callback?code=…`, plus `sb_flow_id` only when auth-js tracks several flows (it did not in a real run). A callback is accepted only if the link is exactly that, a sign in was started in this run less than 10 minutes ago, it has not been used, the flow id (if any) matches, and the exchange succeeds with the verifier stored locally. Forged or replayed codes fail cleanly; nothing is logged but a reason word.
- **Session storage:** the Supabase session and PKCE verifier go through `belificDesktop.secureKv`, encrypted in main with `safeStorage` (files `secure.<hash>.kv`). If encryption is unavailable nothing is persisted (sign in lasts for the run) and Settings says so. iOS storage is unchanged.
- **First sign in:** a backup folder `YYYY-MM-DD-pre-signin` is taken before the browser opens, exactly once (a flag is set only after it succeeds; if it fails sign in does not start). Labelled backups are never pruned. Sign out clears the session, outbox, cursors and the sync flag, never local data.
- **Still unverified:** the live Apple round trip; that the Services ID returns the same `sub` as the iPhone; whether Supabase's redirect allow list needs `belific://auth-callback**`; Electron's origin against the deployed function (the page's `location.origin` is `app://belific`, checked). All depend on Jethro completing `docs/APPLE_SIGNIN_SETUP.md`.

## Hardened (2026-10-06, checkpoint 6.1, app 2.11.1). Status stays Proposed.

Changes to the built behaviour above, from the security review:
- **The pending sign in survives stray links.** Adding a flow id to `redirect_to` was rejected (it needs a Supabase allow list pattern that cannot be verified before the Apple setup). Instead the main process keeps a private in memory copy of the PKCE verifier entries before each exchange (auth-js deletes the verifier even when an exchange fails) and restores it on failure. The pending sign in ends only on a successful exchange, cancel, sign out, the 10 minute expiry, or the third failed attempt. A provider error link counts as a failed attempt. Only one code is handed out for exchange at a time.
- **Verifiers never touch the disk** (this replaces "the session and verifier go through secureKv, encrypted"). Keys ending in `code-verifier` are held in main memory only, wiped whenever a sign in ends or a begin fails. The session itself is still encrypted on disk. Quitting the app mid sign in abandons that sign in (it was already memory only).
- **Account switching.** The last signed in user id is stored (`belific_last_user_id`, not secret, `deleted` after delete account). A different user (or any user after a delete) with local data gets a choice before anything syncs: upload this computer's data, or start empty; a labelled `account-switch` backup is taken first. A persisted hold flag stops sync until it is answered, also after a restart. The first ever sign in and the same user are unchanged.
- **Session copies.** `secure.*` files are excluded from daily backups, labelled backups and Export data. A sign out whose server revoke fails keeps the tokens in the encrypted store as "revoke pending", retried at launch and when the network returns (with a throwaway client that never touches the stored session).
- **Smaller:** `secureStore` encrypts first and falls back to memory with a warning on error; `shell.openExternal` and `window.open` allow only the Supabase authorize URL and Belific's privacy, terms and support pages; the page cannot use `secure.*` keys or the first sign in flag through the kv IPC; labelled backup folders get a numeric suffix instead of being replaced; `auth:begin` is refused while one is running; the CSP gained object-src, base-uri, form-action and frame-ancestors.

**2.11.2:** the desktop sign out and the pending revoke retry use scope `local` (this device's session only). The default is global and would also end the iPhone's session. iPhone sign out (`auth.ts`) is unchanged.

## Related Notes
- [[docs/OPUS_PLAN_REVIEW]]
- [[docs/decisions/009-desktop-platform-and-auth]]
