# Apple sign in for the desktop app: setup guide for Jethro

Desktop sign in (decision 012, app 2.10.0) is built and tested against fakes, but it **cannot work until you do the steps below**. They are all dashboard clicks; nothing here was done for you. Do them in order. Keep the Supabase project ref handy: `uucycebkpgwbktdytxvr`.

You need: your Apple Developer account, the Supabase dashboard, and about 30 minutes.

Values used below (change the Services ID name if you prefer, but use the same one everywhere):

| Thing | Value |
|---|---|
| Primary App ID (already exists) | `com.najeca.belific` |
| New Services ID | `com.najeca.belific.signin` |
| Supabase callback URL (Apple's "Return URL") | `https://uucycebkpgwbktdytxvr.supabase.co/auth/v1/callback` |
| Supabase domain (Apple's "Domain") | `uucycebkpgwbktdytxvr.supabase.co` |
| Desktop redirect | `belific://auth-callback` |

## (a) Create the Services ID and group it with the App ID

1. Go to https://developer.apple.com/account and open **Certificates, Identifiers & Profiles**.
2. Click **Identifiers** in the left list, then the blue **+** next to the heading.
3. Choose **Services IDs** and click **Continue**.
4. Description: `Belific Desktop`. Identifier: `com.najeca.belific.signin`. Click **Continue**, then **Register**.
5. In the Identifiers list, set the filter (top right) to **Services IDs** and open `com.najeca.belific.signin`.
6. Tick **Sign in with Apple** and click **Configure** next to it.
7. **Primary App ID**: pick **Belific (com.najeca.belific)**. This grouping is what makes Apple return the same user for the phone and the desktop.

## (b) The return URL for Supabase's Apple provider

Still in the Configure dialog from (a):

1. **Domains and Subdomains**: `uucycebkpgwbktdytxvr.supabase.co`
2. **Return URLs**: `https://uucycebkpgwbktdytxvr.supabase.co/auth/v1/callback`
3. Click **Next**, **Done**, then **Continue**, then **Save** on the Services ID page.

(Apple only accepts https return URLs. That is why the app does not point Apple at `belific://`: Apple redirects to Supabase, and Supabase redirects to `belific://auth-callback` afterwards, see (e).)

## (c) Generate the client secret, and the 6 month reminder

Apple's "client secret" is a signed token. It expires after at most 6 months, so it must be regenerated. When it expires, desktop sign in stops working (the iPhone is not affected, it uses a different path).

1. In **Certificates, Identifiers & Profiles**, click **Keys**, then the blue **+**.
2. Key name: `Belific Sign in`. Tick **Sign in with Apple** and click **Configure**. Choose **Belific (com.najeca.belific)** as the primary App ID and click **Save**, then **Continue**, then **Register**.
3. Click **Download** and keep the `AuthKey_XXXXXXXXXX.p8` file. **Apple lets you download it once.** Do not put it in the repository. Write down the **Key ID** shown on the page (10 characters, the `XXXXXXXXXX` in the file name).
4. Find your **Team ID**: click your name at the top right of the developer site, or open **Membership details** (10 characters).
5. Generate the token. In a terminal:
   ```
   cd desktop
   node scripts/apple-client-secret.js <TEAM_ID> com.najeca.belific.signin <KEY_ID> <path to AuthKey_XXXXXXXXXX.p8>
   ```
   It prints one long line starting `eyJ`. That is the client secret. Copy it. The script writes no file and sends nothing anywhere.
6. **Set a calendar reminder for 5 months from today**, titled "Regenerate Apple client secret for Belific desktop (repeat steps c5 and d3)". The token is valid for about 6 months, and the reminder leaves a month of slack.

## (d) Add the Services ID to the Supabase Apple provider

1. Open the Supabase dashboard, project `uucycebkpgwbktdytxvr`.
2. **Authentication**, then **Sign In / Providers** (older dashboards: **Providers**), then **Apple**.
3. Make sure **Enable Sign in with Apple** is on.
4. **Client IDs**: this is a comma separated list. Put the bundle id first, then the Services ID, no spaces: `com.najeca.belific,com.najeca.belific.signin`. Keep the bundle id: the iPhone's native sign in depends on it.
5. **Secret Key (for OAuth)**: paste the token from (c5). (When you regenerate every 5 months, only this field changes.)
6. Click **Save**.

## (e) Allow the desktop redirect

1. Supabase dashboard, **Authentication**, then **URL Configuration**.
2. Under **Redirect URLs** click **Add URL** and add `belific://auth-callback`. Click **Save**.
3. Do not change **Site URL**.
4. If, in the check below, the browser ends on your Site URL instead of reopening Belific, come back and also add `belific://auth-callback**` (some Supabase versions compare the query string too). [unverified which is needed]

## (f) Check that the same user comes back as on the iPhone

This is the open item in decision 012: it is believed that a Services ID under the same team returns the same Apple `sub` (so the same Supabase user) as the native iPhone flow. It is not yet proven. **Test with a throwaway Apple ID, not your own, first.**

1. Make sure the two migrations from checkpoint 5 are applied (see `docs/sessions/2026-10-06-cp5.md`), or accept that the app will use its schema fallback.
2. Sign in on the iPhone with the throwaway Apple ID (a TestFlight or development build is fine). Add one task so there is something to see.
3. In the Supabase dashboard, **Authentication**, then **Users**: note the one new row and its **User UID**.
4. On the desktop, open Belific, click the account line at the bottom of the left pane ("Local only · not signed in"), click **Sign in with Apple**, and sign in with the same throwaway Apple ID in the browser that opens.
5. Back in the dashboard, **Users** must still show **one** row for that person with the same User UID, with `apple` as the provider. If a **second** row appeared, the `sub` differs: stop, do not sign in with your real Apple ID, and tell me; the plan then changes (decision 012's fallback is email based linking).
6. On the desktop the task from step 2 should appear within a couple of minutes (or click **Sync now** in Settings).
7. Clean up: in the desktop Settings click **Delete account** (this also exercises the delete path), or delete the user in the dashboard.
8. Only after this passes, sign in with your own Apple ID. The desktop takes a backup named `pre-signin` before its first ever sign in (Settings, **Open backups folder**).

## (g) Confirm Electron's origin for the delete account CORS rule

The delete-account Edge Function only answers browser calls from the origin `app://belific` (`mobile/supabase/functions/delete-account/index.ts`, `ALLOWED_ORIGINS`). The function is **not deployed yet**; deploying it is your step.

To confirm the origin the desktop page really has, in `desktop`:

```
npx electron . --remote-debugging-port=9222
```

then open `http://localhost:9222/json` in Chrome: the page's `url` should start with `app://belific/`, and the origin is that without the trailing slash: `app://belific`. (The automated check `npm run test:real:cp6` also asserts `location.origin === 'app://belific'`; it passed.)

After you deploy the function, test the rule with:

```
curl -i -X OPTIONS https://uucycebkpgwbktdytxvr.supabase.co/functions/v1/delete-account -H "Origin: app://belific" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization,content-type"
```

You should see `Access-Control-Allow-Origin: app://belific`. **If the origin is different** (for example `app://belific/` or `null`): edit `ALLOWED_ORIGINS` in the function to the exact origin string, redeploy the function, and run the curl again. If it is missing, Delete account on the desktop shows "The account could not be deleted. Please try again."

## What the callback contains (for reference)

Supabase's PKCE redirect is `belific://auth-callback?code=<code>` (the auth library appends `sb_flow_id=<id>` only when several sign ins are in flight; the app accepts it when present and checks it). There is no OAuth `state` in it. The app accepts a link only when it is exactly that, a sign in was started in this run in the last 10 minutes, and it is used once; the code is then exchanged using the verifier stored (encrypted) on this computer.
