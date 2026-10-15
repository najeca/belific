# New project sync test: manual checklist for Jethro

First real test of Belific against the shared project (`vlogfwnmaqorhialcqbr`, schema `belific`). Nothing in the automated tests touches the real project, so this is the only proof that the schema, the sign in and the sync work together.

**Do not start until all of these are done** (see `docs/CURRENT_TRUTH.md`, "Shared with Landis and Proload"):

- [ ] A backup of the shared project exists.
- [ ] `mobile/supabase/belific_schema/001_belific_schema.sql` has been applied by hand.
- [ ] `belific` is listed under Data API, Exposed schemas (Settings, Data API in the dashboard).
- [ ] Google is configured for the new callback URL (`docs/GOOGLE_SIGNIN_SETUP.md`): the callback `https://vlogfwnmaqorhialcqbr.supabase.co/auth/v1/callback` is in the Google OAuth client, and `belific://auth-callback` is in the Supabase redirect list.
- [ ] Apple is configured for the new callback (`docs/APPLE_SIGNIN_SETUP.md`), only if you want to test Apple too. Not needed for this checklist.
- [ ] The desktop app was built from this code (`npm run dist` in `desktop/`) and installed or run from `desktop/dist/win-unpacked`.

Use a **throwaway Google account** that has never been used with Landis or Proload. Never your own account first.

## Steps

1. **Start clean.** On the desktop, open Settings, then **Open backups folder**, and note the newest backup. If you use this computer's real data, the app will make a labelled backup by itself at sign in.
2. **Sign in.** Profile icon, Sign in, **Continue with Google**, finish in the browser with the throwaway account. The app should come back and show the account.
   - If this computer has Belific data, the app asks what to do with it (this is expected after the move: it is a different account). Choose **Upload this computer's data** only if you are happy for that data to go to the throwaway user; otherwise choose to **start empty**, which keeps a backup.
3. **Check the user.** Dashboard, Authentication, Users: exactly **one** new user, provider `google`. Write down the User UID.
4. **Create a task** on the desktop (any title, for example `sync test 1`). Wait up to 2 minutes or press **Sync now** in Settings.
5. **Check it arrived.** Dashboard, Table Editor, schema `belific`, table `tasks`: one row with that title and `user_id` equal to the UID from step 3. `deleted_at` is empty.
6. **Edit it.** Change the title to `sync test 2`, set a due date and add one subtask. Sync. In `belific.tasks` the same row (same `id`) shows the new title, the due date and `subtasks` filled, and `server_updated_at` has moved forward. There is still one row.
7. **Delete it.** Delete the task in the app. Sync. The row stays in `belific.tasks` with `deleted_at` filled (that is the tombstone, it is how other devices learn of the delete).
8. **Sign out and in.** Settings, Sign out, then sign in again with the same Google account. The app should not ask the account question again (same account). The deleted task must not come back.
9. **No second user.** Authentication, Users: still exactly **one** user for the throwaway account.
10. **Other apps unharmed (look, do not touch).** Landis and Proload still open and sign in as before. Nothing in `public` changed.

If a step fails, stop and write down: the step number, what the app showed, and the time. Do not retry with your real account.

Typical failures:

- Every sync fails right after sign in: `belific` is not under Exposed schemas (error `PGRST106`), or the schema file was not applied.
- Sign in ends in the browser and never returns: the redirect list is missing `belific://auth-callback`.
- `redirect_uri_mismatch` from Google: the new callback URL is not in the Google OAuth client.

## Clean up the throwaway user

In-app **Delete account** removes this user's rows in the `belific` schema only. It does **not** delete the user, because the user belongs to the shared project (see the open decision in `docs/sessions/2026-10-15-project-move.md`). So:

1. In the desktop app, Settings, **Delete account**, confirm. (This also tests the delete function once it is deployed. If it is not deployed yet, skip this and go to step 3.)
2. In the dashboard, Table Editor, schema `belific`: all seven tables show no rows for the UID from step 3.
3. Authentication, Users: open the throwaway user and check it has nothing else (it was only ever used for this test). Then **Delete user**. Their remaining `belific` rows go with it (`on delete cascade`).
4. Back up first if there is any doubt which user you are deleting: the UID in step 3 is the only one to delete.
5. Remove the desktop's local copy of the test if you do not want it: it is kept by design ("Your data on this computer was kept").
