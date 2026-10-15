# Google sign in for the desktop app: setup guide for Jethro

> **Moved to the shared project (2026-10-15).** Belific now uses the project shared with Landis and Proload, ref `vlogfwnmaqorhialcqbr`, and the callback URL is `https://vlogfwnmaqorhialcqbr.supabase.co/auth/v1/callback`. Everything below uses that URL. The Apple and Google settings of that project are shared, so read the section "Shared with Landis and Proload" in `docs/CURRENT_TRUTH.md` before saving anything in a provider. Where this guide says to replace a value, first check that no other app still uses it. Nothing here has been done for you.


Desktop Google sign in (decision 026, app 2.18.0) is built and tested against fakes, but it **cannot work until you do the steps below**. They are all dashboard clicks; nothing here was done for you, and no dashboard or live service was touched while building it. Do them in order. The Supabase project ref is `vlogfwnmaqorhialcqbr`.

**Unverified:** the wording and the position of the buttons in the Google Cloud console and the Supabase dashboard below are written from memory of how they looked, not checked against today's screens. Both change often. If a name does not match, look for the closest one and tell me what you saw, so this guide can be corrected.

You need: a Google account that will own the project, the Supabase dashboard, and about 20 minutes.

Values used below:

| Thing | Value |
|---|---|
| Supabase callback URL (Google's "Authorized redirect URI") | `https://vlogfwnmaqorhialcqbr.supabase.co/auth/v1/callback` |
| Desktop redirect (Supabase redirect allow list) | `belific://auth-callback` |
| Scopes the app needs | `openid`, `email`, `profile` (the basic ones) |

## (a) Create a Google Cloud project

1. Go to https://console.cloud.google.com and sign in.
2. Open the project picker at the top and choose **New project**. Name it `Belific`. Create it and select it.

## (b) The consent screen (what people see when they choose Google)

1. Open **APIs and Services**, then **OAuth consent screen** (newer consoles call this area **Google Auth Platform**, with tabs Branding, Audience and Data Access).
2. User type: **External**.
3. App name: `Belific`. Support email: pick your own address from the list Google offers. Developer contact: your own address. (Do not paste either into the repository.)
4. Authorized domain: add `supabase.co`. If the console asks for a privacy policy link, use https://najeca.github.io/belific/privacy.html and for terms https://najeca.github.io/belific/terms.html.
5. Scopes: add only `.../auth/userinfo.email`, `.../auth/userinfo.profile` and `openid`. Do not add anything else. These are the basic scopes and normally need no Google review.
6. Publishing status: **In production** (the button is called **Publish app**). While it says **Testing**, only the test users you list can sign in and Google ends their sign in after about 7 days.

## (c) Create the OAuth client

1. Open **Credentials**, then **Create credentials**, then **OAuth client ID**.
2. Application type: **Web application**. Name: `Belific Supabase`.
3. **Authorized redirect URIs**: if the shared project already has a Google client, edit that one instead of making a second (the Google provider takes one client); add exactly `https://vlogfwnmaqorhialcqbr.supabase.co/auth/v1/callback`. Nothing else is needed. Leave **Authorized JavaScript origins** empty.
4. Create. Copy the **Client ID** and the **Client secret**. Keep the secret out of the repository, chat and notes. Unlike the Apple secret, this one does not expire on a schedule.

## (d) Turn Google on in Supabase

1. Supabase dashboard, your Belific project, **Authentication**, then **Sign In / Providers** (older dashboards: **Providers**), then **Google**.
2. Enable it. Paste the Client ID and the Client secret. Leave the "skip nonce check" option off. Save.
3. **Authentication**, **URL Configuration**, **Redirect URLs**: confirm `belific://auth-callback` is in the list (you added it for Apple in step (e) of `docs/APPLE_SIGNIN_SETUP.md`). Whether the list needs the pattern `belific://auth-callback**` is unverified, same as for Apple.

## (e) Test it with a throwaway Google account, not yours

1. Make a new, empty Google account just for this.
2. Follow `docs/ACCOUNT_LINKING_TEST.md`. It also says how to remove the stray test user afterwards, which needs a backup and your go-ahead first.

## What can go wrong

- **"Access blocked" or "app not verified" from Google:** the consent screen is still in Testing, or a sensitive scope was added. Publish it and remove extra scopes.
- **"redirect_uri_mismatch":** the redirect URI in (c) is not exactly the Supabase callback URL.
- **The browser finishes but Belific stays on "Finish signing in":** the redirect allow list in (d) step 3 is missing `belific://auth-callback`.
- **Two Belific accounts for one person** (one Apple, one Google): see `docs/ACCOUNT_LINKING_TEST.md`.

## The iPhone (2.18.1)
The iPhone's Google sign in uses the **same** Google OAuth client, the same Supabase Google provider and the same callback URL as the desktop (`https://vlogfwnmaqorhialcqbr.supabase.co/auth/v1/callback`), and the same `belific://auth-callback` entry in Supabase's Redirect URLs. **No new Google client and no iOS client ID are needed**, because the phone signs in through the system browser, not a Google SDK. Nothing extra to do in Google Cloud or Supabase for the phone beyond the desktop steps above. Unverified until a device test.
