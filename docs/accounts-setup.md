# Connect JobApply accounts

Accounts use Supabase Auth and PostgreSQL on the Free plan. This is a one-time setup for the app owner. Visitors then create their own JobApply accounts. The existing live app continues in browser-storage mode until the two public Supabase environment variables are supplied at build time.

## 1. Create the backend

1. Sign in to https://supabase.com/dashboard with your GitHub account.
2. Create a project named JobApply in a Free-plan organization. Choose a nearby region and store its database password privately.
3. In SQL Editor, run `supabase/migrations/202611170001_accounts.sql` from this repository. The script creates a private account table, row policies, and an atomic save function.
4. In the project Connect dialog or API settings, copy the project URL and **publishable** key. Do not use a secret or service-role key.

## 2. Configure sign-up emails

Under Authentication:

- Enable the Email provider, sign-ups, and email confirmation. Set the minimum password length to 12.
- Set Site URL to `https://job-apply-three.vercel.app`.
- Allow redirects to `https://job-apply-three.vercel.app/auth/callback` and `https://job-apply-three.vercel.app/auth/callback?recovery=1`.
- Connect a custom SMTP sender before inviting other users. Supabase's default sender only delivers to project team members and is limited to a few test messages. Without custom SMTP, public signup confirmation and password recovery will fail. See https://supabase.com/docs/guides/auth/auth-smtp. Choose a sender's free allowance; no paid subscription is required by JobApply.
- Keep the default confirmation/recovery email link templates using the provider's ConfirmationURL. PKCE links must be opened in the same browser that requested them.

Passwords are handled by Supabase Auth. The application never stores them in account data.

## 3. Connect Vercel

In Vercel → job-apply → Settings → Environment Variables, set these for Production:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL from Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project publishable key |
| `JOBAPPLY_ACCOUNT_ENCRYPTION_KEY` | A new random 32-byte key, encoded as 64 hexadecimal characters |

Generate the encryption key on your own computer, for example `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Save it in Vercel as a server-only sensitive value and keep a private recovery copy. Do not commit it or expose it as a `NEXT_PUBLIC_` variable. Changing or losing this key makes existing account data unreadable; changing it requires an explicit migration.

Redeploy after setting the variables. Vercel builds the installed app and website from the same code, so both gain sign-in together. For local account testing, run `npm run dev:hosted` with those variables loaded. Node.js 22+ is required for the Supabase client; Vercel and CI use supported Node versions.

## 4. Verify activation

1. Open the live app: it should show sign-in before any profile or applications.
2. Create a test user, confirm the email, save a profile and an application, then sign out.
3. Sign in on another device/browser and confirm the saved information appears.
4. Create a second test user. It must start empty and must not see the first user's information.
5. Test password reset and sign-out. Anonymous gateway calls must return an envelope with status 401.

Once these checks pass, invite other people. The user list is in Supabase → Authentication → Users. Supabase's Free plan currently includes 50,000 monthly active users and 500 MB of database storage; free projects can pause after inactivity. Stay on Free unless you deliberately choose to upgrade. See https://supabase.com/pricing.

## Data and access

- Each verified Supabase user has one encrypted data row. Row-level security permits only that user to access it. No service-role key is used.
- The server gets the owner from a token verified by Supabase. Submitted user IDs or browser state cannot select someone else's account.
- Profile, resume text, application materials and provider keys are encrypted on the application server with AES-256-GCM before storage. The app server can decrypt them to run searches and AI requests; this is not end-to-end encryption from the app owner.
- Simultaneous saves use an atomic version check. A losing write asks the user to reload instead of silently replacing another completed save.
- The browser keeps the auth session, while account profile data is read fresh from the server. Signing out unmounts loaded application state. Old browser-only data is never attached to an account automatically: Settings offers an explicit import, replacing that account's current data after confirmation.
- Account exports omit API keys and source credentials. The erase action clears saved account data, while keeping the sign-in identity. An owner can delete a sign-in identity from Authentication → Users; its data row cascades with it.

Run `npm test` for the encryption, private-row policies, save conflict, import validation and verified-identity checks. Tests use an embedded PostgreSQL instance and mocked auth HTTP replies, so they do not contact live users or create paid resources.
