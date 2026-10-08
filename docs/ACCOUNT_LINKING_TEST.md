# Account linking test (Apple and Google)

Written for decision 026 and app 2.18.0. **Nothing in this file has been run against the real Supabase project.** Everything marked [unverified] is from how Supabase is documented to behave, not from a test here.

## What can go wrong

Belific has no account system of its own. A person is whichever Supabase user the sign in lands on. Today the iPhone signs in with Apple only and the desktop can use Apple or Google.

1. **Apple's private relay.** When someone signs in with Apple and chooses "Hide my email", Apple gives Supabase a random relay address, not their real one. The same person's Google sign in carries their real address. The two addresses differ, so Supabase has no reason to treat them as one person and creates **two separate users with two separate sets of data** (tasks on the iPhone under Apple, a second empty account on the desktop under Google). Nothing is lost, but it looks as if the data vanished. This is the main risk of offering Google.
2. **Same real email on both.** If the person shared their real email with Apple, the Apple user and the Google user have the same verified email. Supabase's default is to link identities that share a verified email into one user [unverified], so both methods then reach the same data. This is what we want.
3. **Unverified emails must never link.** Linking on an unverified address would let someone take over an account. Apple and Google both give verified emails. The email and password method (2.19.0) must confirm the address with a code before it can link to anything.
4. **A delete is final.** Deleting the account from either method deletes the one user and all synced rows, including the identities linked to it.

What 2.18.0 does about it: nothing automatic. It does not guess, merge or link accounts itself. The account choice question (upload this computer's data or start empty) still appears when a different user signs in on a computer that has data, so no data is mixed silently. Manual linking from a signed in session ("Add a sign in method") is left for 2.19.0 because it needs a dashboard setting (decision 026).

## How to test with a throwaway Google account

Do this only after `docs/GOOGLE_SIGNIN_SETUP.md` is done. Use a **new Google account made for this test**, never yours.

Before you start:
1. Close Belific and copy the folder `%APPDATA%\belific-desktop` somewhere safe. That is a backup of the real data. Belific also makes a `pre-signin` backup before the first sign in.
2. Note which email your real Apple sign in uses. In the Supabase dashboard, Authentication, Users, look at your Apple user and see whether its email ends in `privaterelay.appleid.com` [unverified: column names].

Test A: different emails (the relay case)
1. In Belific on the desktop, open the profile menu, **Sign in**, **Continue with Google**, and finish with the throwaway account.
2. Expect: signed in as the throwaway address, with an empty board or the question about this computer's data. In the dashboard there is a **new** user. This shows the two accounts outcome.
3. Sign out. Do not delete anything yet.

Test B: same verified email [unverified outcome]
1. Give the throwaway Google address to a throwaway Apple ID, or use a second throwaway method that carries the same address.
2. Sign in with one, sign out, sign in with the other.
3. Expect: one user in the dashboard with two identities, and the same data from both.

## Cleaning up the stray user afterwards

Only with a backup and Jethro's go-ahead, in this order:
1. Make sure the backup from "Before you start" exists.
2. Sign in on the desktop as the throwaway user and use **Settings, Account, Delete account**. This runs the same delete as for a real user and removes its rows and the user.
3. If that is not possible, tell Claude the user's email and wait for a go-ahead before deleting it in the dashboard (Authentication, Users, the user's menu, Delete user). Never delete a user you did not create for the test.
4. Check Authentication, Users shows only the real users.
5. Remove the throwaway Google account's access if you like, at https://myaccount.google.com/permissions on the throwaway account.

## What this test does not cover

The Apple token that Apple keeps after a user is deleted (see "Apple token revocation" in `docs/sessions/2026-10-08-cp12.md`).
