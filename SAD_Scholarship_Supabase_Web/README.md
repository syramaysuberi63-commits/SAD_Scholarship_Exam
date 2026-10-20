# Scholarship Monitoring System (Static Supabase version)

This project uses **HTML, CSS, JavaScript, Supabase Auth, Supabase PostgreSQL, and GitHub Pages**. It does **not** use Node.js, Express, or a server backend.

## 1. Configure Supabase
1. Create/open your Supabase project.
2. Open **SQL Editor → New query**.
3. Paste and run `supabase/schema.sql`.
4. Open **Project Settings → API** (or Connect). Copy the Project URL and the **publishable key** (or legacy anon key).
5. Open **`config.js`** in the project folder. Replace `https://YOUR_PROJECT_REF.supabase.co` with your Supabase Project URL and replace `YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY` with the publishable key (or legacy anon key).
6. Save `config.js`. Never paste a `service_role` or secret key into frontend JavaScript.

## 2. Create a staff login
For security, staff accounts must be created by the project owner, not from public scholar registration.
1. In Supabase, go to **Authentication → Users → Add user**. Enter the staff email and a password; confirm the user if your dashboard provides that option.
2. Copy the new user's UUID.
3. In SQL Editor, run the following after replacing the four values. The `program_id` must be NULL for staff.

```sql
insert into public.profiles (id, student_id, full_name, email, role, program_id)
values (
  'PASTE_AUTH_USER_UUID_HERE',
  null,
  'Scholarship Staff',
  'staff@example.com',
  'staff',
  null
);
```

Use the same email in the profile as in Authentication → Users. You may choose another staff email/password; this example is not a pre-created login.

## 3. Create scholar accounts
Open the website and select **Scholar registration**. Choose a program. If Supabase email confirmation is enabled, confirm the email first, then log in. A database trigger creates the scholar profile automatically.

## 4. Open the site
For quick testing, open `index.html` in a browser with internet access. For GitHub Pages, push these files to a repository and enable **Settings → Pages** for the main branch/root. GitHub Pages serves static files; Supabase handles authentication and data.

## Important notes
- There are no built-in working demo credentials. You must create the staff user in Supabase and register at least one scholar.
- Only the Supabase Project URL and publishable/anon key belong in `config.js`.
- If login reports invalid credentials, use **Forgot your password?** to reset an existing account. Password recovery redirects back to the website, so add the deployed website URL under **Authentication → URL Configuration → Redirect URLs** in Supabase. Password recovery may not work when opening the page directly as a `file://` URL; use the deployed site or a local web server.
- If login succeeds but no dashboard appears, check that a matching row exists in `public.profiles` for that user's Auth UUID.
- Only scholar accounts can submit scholarship records. If you see a row-level security error, confirm that you are signed in as a scholar (staff accounts cannot submit), then run the latest `supabase/schema.sql` in the Supabase SQL Editor to update the submission policy.
- Evidence reference is a text reference only; this starter does not upload files to Supabase Storage.
- This is a student project starter. Test all required test cases before submission.
