# Interactive Basketball Playbook Creator & Simulator
Build 2 plan: CONFIRMED by Build 2 Planner on October 6, 2026.

## What the app does and who it's for
This app allows high school basketball coaches (such as Coach Sarah) and team captains to visually design basketball plays on a 2D half-court canvas and animate them using state-based logic. Coach Sarah uses this the night before practice to draw up game plans or during halftime to adjust against zone vs. man-to-man defenses. Without this app, coaches struggle to communicate spatial movements using traditional static whiteboards.

## Sign-in
- Email + password sign-in and sign-up with Supabase Auth.
- GitHub OAuth sign-in.
- Persistent session handling across refreshes and sign-out function.
- Password policy enforced in Supabase: at least 8 characters, with lowercase, uppercase, and a number.

## Tables
1. **profiles**
   - `id` (uuid, primary key, references auth.users)
   - `username` (text, unique)
   - `team_name` (text)
   - `role` (text)
   - `created_at` (timestamp)

2. **plays**
   - `id` (uuid, primary key, default gen_random_uuid())
   - `user_id` (uuid, references profiles.id)
   - `play_name` (text)
   - `description` (text)
   - `formation_type` (text)
   - `animation_data` (jsonb)
   - `thumbnail_url` (text)
   - `call_sheet_url` (text)
   - `created_at` (timestamp)

## Who can see what
- **profiles**: Users can read and write only their own profile record (`auth.uid() = id`).
- **plays**: Users can select, insert, update, and delete only their own play records (`auth.uid() = user_id`).

## Buckets
- **playbook_assets**
  - **Allowed file types**: `.pdf`, `.png`, `.jpg`, `.jpeg`
  - **Max file size**: 5 MB per file
  - **Access rules**: Private bucket where users can only upload, view, and delete files inside their own user ID folder (`/playbook_assets/{user_id}/*`).

## Screens
1. **Screen 1: Sign-In / Sign-Up View**: Handles email/password registration, login, and GitHub sign-in button.
2. **Screen 2: Profile Setup Onboarding**: Prompts new users on first sign-in to choose a unique username, team name, and coaching role.
3. **Screen 3: Playbook Dashboard**: Displays saved plays with thumbnail images, search/filter controls by formation type, and download links for attached PDF call sheets.
4. **Screen 4: Playbook Editor & Simulator Canvas**: Interactive 2D basketball court for placing/moving 5 offensive and 5 defensive players, setting movement paths/passing sequences, and playing back state animations.
5. **Screen 5: Coach Account Settings**: Allows updating profile details, changing team name, and executing password changes for email users.

## Code files
- `index.html`: Contains HTML structure and styling (CSS), and loads `config.js` before `app.js`.
- `app.js`: Contains all app behavior, Supabase client operations, state management, and canvas animation logic.
- `config.js`: Stores only the Supabase URL and publishable key.

## Rules for every chat
- This app uses exactly three code files: index.html, app.js, config.js. Do not create more.
- index.html contains the HTML and CSS, and loads config.js before app.js.
- config.js contains only the Supabase URL and the publishable key.
- When you change code, name the file and give me the whole file, not a snippet.
- Change nothing I did not ask you to change.
- Never put a secret key in any file.

## Addresses
- GitHub Pages URL: to fill in

## Secrets
- GitHub client secret: in Supabase, under GitHub sign-in settings.

## Where we are right now
Planning complete, nothing built yet.

## NOT doing, on purpose
- Server-side physics calculation (Build 3).
- Real-time multiplayer collaborative drawing (Build 3).
- AI automatic defense response generation (Build 4).

## Next thing I want to add
Set up Supabase sign-in settings, then email + password sign-in.

## Change log
- October 6, 2026: Planning session with Build 2 Planner. Plan confirmed.
