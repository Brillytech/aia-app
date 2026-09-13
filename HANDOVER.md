# LASU SCHOLAR — COMPLETE DEVELOPMENT HANDOVER

**Repository:** `Brillytech/aia-app` (branch `master`)
**Document generated:** 2026-09-13, by direct inspection of the working tree at commit `c51c36e`
**Verification state at generation:** `tsc` 1 error (known baseline) · `expo lint` 56 problems (19 errors, 37 warnings) · `npm run build:web` succeeds · working tree clean · `HEAD == origin/master`

> **How this document was produced.** Every claim below was read out of the actual files, or measured by running code, at the commit named above. Where something could not be confirmed from the repository it is labelled **[NEEDS VERIFICATION]** rather than guessed. Three sections in the requested outline described things that turned out not to match the repository — the admin console (§12), environment variables (§19), and the "planned migration to a web PWA" (§25). Those sections explain what is actually true instead of answering the question as posed.

---

## TABLE OF CONTENTS

| § | Section | Status summary |
|---|---|---|
| 1 | Project overview and purpose | — |
| 2 | Technology stack | — |
| 3 | Folder and file structure | — |
| 4 | Routes and pages | 20 routes |
| 5 | Major features implemented | — |
| 6 | Authentication and onboarding | Complete, 2 known gaps |
| 7 | User profile logic | Complete |
| 8 | Dashboard logic and data | Complete, 1 known inaccuracy |
| 9 | Study Mode | Complete, largest screen |
| 10 | Practice Mode | Complete |
| 11 | Exam Mode | Complete |
| 12 | Admin Console | **Not in this repository** |
| 13 | Supabase schema, queries, RLS | Partially verifiable |
| 14 | Business rules and conditional logic | — |
| 15 | Academic periods / schools / levels | Complete |
| 16 | Notifications, XP, progress, goals, analytics | **Push NOT built** |
| 17 | Reusable services, hooks, components | — |
| 18 | Dependencies | — |
| 19 | Environment variables | **None exist — see section** |
| 20 | Deployment | Complete |
| 21 | Currently working features | — |
| 22 | Known bugs and unresolved issues | 14 items |
| 23 | Recent fixes | — |
| 24 | Features that must not be broken | **Read before editing** |
| 25 | The RN → PWA migration | **Already complete** |
| 26 | What can be reused | — |
| 27 | Native-only code | — |
| 28 | Recommended order of work | — |
| 29 | Exact next steps | — |
| — | Instructions for the next AI coding assistant | **Read this** |

---

## 1. PROJECT OVERVIEW AND PURPOSE

LASU Scholar is a study application for students of **Lagos State University (LASU)** and the **LASU College of Medicine (LASUCOM)**, published by AIA•ACADEMY.

It is a **live, deployed Progressive Web App**. Students sign in, complete an academic profile (school → faculty → department → level), and are then shown only the courses their department and level are running in the current academic period. From there they can:

- **Study** — read course materials, work through written/theory questions, and revise with flashcards
- **Practice** — untimed, topic-scoped question sessions with confidence tracking
- **Exam** — timed, course-wide CBT simulation
- Track XP, daily goals, streaks, a weekly analytics report, and a leaderboard

The app is phone-first in its design language but runs as a responsive web app with a distinct desktop layout above 1024px.

Content (courses, topics, questions, materials, notifications) is **authored elsewhere** — in a separate admin application — and read by this app from Supabase. This repository contains only the student-facing client.

---

## 2. CURRENT TECHNOLOGY STACK

Read from [package.json](package.json) and [app.json](app.json).

| Layer | Choice | Version |
|---|---|---|
| Framework | Expo (SDK 56) | `expo ^56.0.8` |
| UI runtime | React | `19.2.3` |
| Native runtime | React Native | `0.85.3` |
| Web runtime | react-native-web | `~0.21.0` |
| Routing | expo-router (file-based) | `~56.2.8` |
| Backend | Supabase (Postgres + Auth + Storage) | `@supabase/supabase-js ^2.106.2` |
| Animation | react-native-reanimated | `4.3.1` |
| Vector graphics | react-native-svg | `15.15.0` |
| Local storage | `@react-native-async-storage/async-storage` | `^2.2.0` |
| Maths rendering | katex | `^0.18.7` |
| HTML sanitising | dompurify | `^3.4.15` |
| Service worker | workbox-build (dev dep) | `^7.4.1` |
| Language | TypeScript | `~6.0.3` |
| Linting | eslint + eslint-config-expo | `^9.0.0` |
| Hosting | Vercel | see [vercel.json](vercel.json) |

**Two Expo experiments are enabled** in [app.json](app.json) and both materially affect how you must write code:

```json
"experiments": { "typedRoutes": true, "reactCompiler": true }
```

- **React Compiler is ON.** The linter enforces rules that ordinary React does not — notably `react-hooks/set-state-in-effect` (you may not call `setState` synchronously as the first act of an effect) and `react-hooks/immutability`. Several existing patterns in the codebase exist specifically to satisfy it; see §24.
- **Typed routes are ON.** Many `router.push()` calls carry an `as any` cast because the generated route union does not include dynamically-built hrefs.

**Web output is `"single"`** — a single-page application. All routing is client-side; Vercel rewrites every non-asset path to `/index.html` (see §20).

---

## 3. COMPLETE FOLDER AND FILE STRUCTURE

```
aia-app/
├── app.json                     Expo config (typedRoutes, reactCompiler, web single-page)
├── vercel.json                  Build command, output dir, cache headers, SPA rewrites
├── package.json                 Deps + the build:web pipeline
├── tsconfig.json
├── eslint.config.js
├── AGENTS.md / CLAUDE.md        Project instruction files (CLAUDE.md just imports AGENTS.md)
├── README.md                    ⚠ still the untouched create-expo-app boilerplate
│
├── lib/
│   └── supabase.ts              ⚠ Supabase client — URL + anon key HARDCODED (see §19)
│
├── public/                      Copied verbatim into dist/
│   ├── index.html               HTML shell (manifest link, theme-color, icons)
│   ├── manifest.json            PWA manifest
│   └── icon-*.png
│
├── scripts/
│   ├── build-sw.mjs             Workbox generateSW → dist/sw.js
│   ├── stamp-build.mjs          Writes <meta name="build-id"> into dist/index.html
│   ├── sync-katex.js            postinstall — copies KaTeX css/fonts into public/
│   └── reset-project.js         Expo scaffold script, unused
│
├── supabase/
│   ├── .temp/                   Machine-local CLI state (cli-latest is untracked)
│   └── migrations/              7 files — hardening only, NOT the base schema (§13)
│
└── src/
    ├── app/                     ← expo-router: every file here is a ROUTE
    │   ├── _layout.tsx          Root layout: column cap, popups, PWA banners, theme chrome
    │   ├── index.tsx            "/" → redirects to /auth/login
    │   ├── auth/
    │   │   ├── login.tsx        Email+password and Google OAuth
    │   │   ├── signup.tsx
    │   │   ├── callback.tsx     OAuth landing
    │   │   ├── forgot-password.tsx
    │   │   └── reset-password.tsx
    │   ├── complete-profile.tsx One-time academic profile capture
    │   ├── (tabs)/
    │   │   ├── _layout.tsx      Tab navigator; swaps TabBar ⇄ SideNav at 1024px
    │   │   ├── dashboard.tsx    2489 lines
    │   │   ├── study.tsx        4368 lines  ← largest file in the project
    │   │   ├── practice.tsx     2232 lines
    │   │   ├── exam.tsx         2729 lines
    │   │   └── profile.tsx      1306 lines  (href: null — reachable, not a tab)
    │   ├── edit-profile.tsx
    │   ├── settings.tsx
    │   ├── leaderboard.tsx
    │   ├── notifications.tsx
    │   ├── weekly-report.tsx
    │   ├── premium.tsx          Preview only — purchases not connected
    │   ├── aia-tutorial.tsx     Placeholder page
    │   └── past-questions.tsx   Placeholder page
    │
    ├── pwa/
    │   ├── useServiceWorker.ts  Registration, update detection, build-id logging
    │   ├── useInstallPrompt.ts  beforeinstallprompt + iOS manual instructions
    │   └── buildId.ts           Reads the <meta name="build-id">
    │
    ├── ui/                      ~60 presentational components + design tokens
    │   ├── tokens.ts            spacing / layout / radius / type / elevation / colour utils
    │   ├── layout/
    │   │   ├── breakpoints.ts   useBreakpoint, useIsDesktop, useContentInset
    │   │   ├── SplitPane.tsx    Two-column primitive that stacks below its breakpoint
    │   │   └── measure.ts
    │   └── … (see §17)
    │
    ├── theme.ts                 light/dark themes, category colours, useThemeMode()
    ├── session.ts               THE auth-state reader — use this, not getUser()
    ├── notify.ts                Notification prefs, targeting query, popup queue
    ├── studyReminder.ts         Two-window daily study nudge
    ├── weeklyReport.ts          Weekly analytics aggregation + Monday offer
    ├── days.ts                  Local-timezone day/week helpers
    ├── screen-time.ts           useScreenTime() — writes user_activity_logs
    ├── username.ts              Username validation + availability
    ├── auth-redirect.ts         Redirect URLs + routeAfterAuth()
    ├── premium.ts               Plan data + a deliberately non-functional purchase stub
    ├── courses.ts               Alphabetical course sorting
    ├── theoryScore.ts           Self-marked theory scoring maths
    └── onboarding.ts            Storage key for the paused onboarding carousel
```

**There is no `src/components/` directory and no data-access layer.** All Supabase queries live inside the screen components that use them. This is the single most important structural fact about this codebase — see §24 and §28.

---

## 4. EVERY ROUTE AND WHAT IT DOES

expo-router maps files in `src/app/` to URLs. `(tabs)` is a layout group and does not appear in the URL.

| Route | File | What it does |
|---|---|---|
| `/` | [index.tsx](src/app/index.tsx) | Unconditional `<Redirect href="/auth/login" />`. The four-slide onboarding carousel that used to live here is paused (kept in git at `81c9018`). |
| `/auth/login` | [login.tsx](src/app/auth/login.tsx) | Email+password via `signInWithPassword`, and Google via `signInWithOAuth`. On success calls `routeAfterAuth()`. **Contains no session check at all** — see §22.1. |
| `/auth/signup` | [signup.tsx](src/app/auth/signup.tsx) | `supabase.auth.signUp` with `emailRedirectTo`. If a session comes back → `/complete-profile`; otherwise shows "Check Your Email" and sends the user to login. |
| `/auth/callback` | [callback.tsx](src/app/auth/callback.tsx) | Google OAuth landing. Waits for `getSession()` (the client parses tokens out of the URL itself via `detectSessionInUrl`), then routes on. Falls back to `/auth/login` after 1.5s. |
| `/auth/forgot-password` | [forgot-password.tsx](src/app/auth/forgot-password.tsx) | Sends a reset email pointed at `/auth/reset-password`. |
| `/auth/reset-password` | [reset-password.tsx](src/app/auth/reset-password.tsx) | Sets a new password via `updateUser`. |
| `/complete-profile` | [complete-profile.tsx](src/app/complete-profile.tsx) | One-time capture of full name, username, school, faculty, department, level. Writes the profile row and sets `profile_completed`. Gate for the whole app. |
| `/dashboard` | [(tabs)/dashboard.tsx](src/app/(tabs)/dashboard.tsx) | Home. Greeting, continue-learning hero, daily goal rings, course rail, recommended materials, weekly stats, leaderboard preview, account rows. |
| `/study` | [(tabs)/study.tsx](src/app/(tabs)/study.tsx) | Course → topic → one of three modes (materials / questions / cards). Mode is a URL param. Includes the in-app material viewer. |
| `/practice` | [(tabs)/practice.tsx](src/app/(tabs)/practice.tsx) | Untimed topic-scoped practice with confidence ratings, resumable sessions, result + review. |
| `/exam` | [(tabs)/exam.tsx](src/app/(tabs)/exam.tsx) | Timed course-wide CBT with a question navigator, auto-submit, result + breakdown. |
| `/profile` | [(tabs)/profile.tsx](src/app/(tabs)/profile.tsx) | Identity block, 4 stat tiles, weekly-report link, support rows, review submission, sign out. `href: null` — inside the tab navigator but not shown as a tab. |
| `/edit-profile` | [edit-profile.tsx](src/app/edit-profile.tsx) | Edits name/username. School/department/level are read-only ("Managed by admin support"). |
| `/settings` | [settings.tsx](src/app/settings.tsx) | Theme, notification toggles, account rows, support links, privacy, sign out. |
| `/leaderboard` | [leaderboard.tsx](src/app/leaderboard.tsx) | Weekly / monthly / all-time XP ranking with a podium. Currently computed **client-side** from `xp_events`. |
| `/notifications` | [notifications.tsx](src/app/notifications.tsx) | Persistent notification list + per-category preference toggles. |
| `/weekly-report` | [weekly-report.tsx](src/app/weekly-report.tsx) | Analytics page: donut by mode, 7-day bar chart, 6 stat tiles, top courses. This week / last week toggle. |
| `/premium` | [premium.tsx](src/app/premium.tsx) | Plan comparison. **Purchases are not connected** — `purchasePlan()` always returns `{ ok: false }`. |
| `/aia-tutorial` | [aia-tutorial.tsx](src/app/aia-tutorial.tsx) | Placeholder ("coming soon"). Reached from the raised centre nav button. |
| `/past-questions` | [past-questions.tsx](src/app/past-questions.tsx) | Placeholder ("coming soon"). |

---

## 5. MAJOR FEATURES ALREADY IMPLEMENTED

**Completed and in production**

- Email/password and Google OAuth authentication, password reset
- Academic profile capture and the period-gated course catalogue
- Study mode: materials viewer, written/theory questions, grid/table questions, flashcards
- Practice mode with confidence tracking and resumable sessions
- Exam mode with timer, navigator, auto-submit and breakdown
- XP, daily goals, daily streak, weekly statistics
- Leaderboard (weekly / monthly / all-time)
- Weekly report analytics page
- In-app notification list with per-category preferences
- In-the-moment popup layer (weekly report offer, external announcements, study nudge)
- Light/dark theming with PWA chrome that follows it
- PWA: installable, offline app shell, update-available banner, build-id stamping
- Desktop layout: sidebar nav, split panes on 7 screens
- Avatar upload to Supabase Storage
- Result share cards (image) and PDF summary printing

**Partially completed**

- **Leaderboard scaling** — DB functions `leaderboard()`, `my_leaderboard_rank()`, `username_available()` are written, applied and correctly permissioned, but **nothing in the client calls them**. The screen still aggregates client-side.
- **Desktop layout** — `SplitPane` is adopted on dashboard, study, profile, edit-profile, notifications, premium, settings. Practice, exam and weekly-report are not desktop-adapted.
- **Loading states** — content-matching skeletons exist on profile, study, leaderboard, notifications, weekly-report. Dashboard, exam, practice, edit-profile and complete-profile still use page-level spinners.
- **Notification triggers** — all three in-app triggers can only raise a *popup*. None can write a row to the `notifications` table (§16).
- **Profile read lockdown** — the migration is written but blocked (§13).

**Not built**

- Premium purchases (UI is a preview only)
- AIA Tutorial, Past Questions (placeholder pages)
- Push notifications (everything is in-app)
- The onboarding carousel (paused, recoverable from git)

---

## 6. AUTHENTICATION AND ONBOARDING FLOW

**Files:** [lib/supabase.ts](lib/supabase.ts), [src/session.ts](src/session.ts), [src/auth-redirect.ts](src/auth-redirect.ts), [src/app/auth/](src/app/auth/), [src/app/complete-profile.tsx](src/app/complete-profile.tsx)
**Tables:** `auth.users` (Supabase-managed), `profiles`

### Client configuration

```ts
createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,   // parses OAuth/reset tokens out of the URL on web
    flowType: 'implicit',       // deliberately NOT pkce — see below
  },
})
```

`flowType: 'implicit'` is a **deliberate choice, documented in the file**: PKCE stores a code verifier on the device that began the flow, which breaks the common case of opening a password-reset email on a different device. Do not "upgrade" this to PKCE without solving that.

### The flow

```
/  →  /auth/login
         ├── password  →  signInWithPassword  ──┐
         └── Google    →  signInWithOAuth       │
                              ↓                 │
                       /auth/callback  ─────────┤
                                                ↓
                                        routeAfterAuth(userId)
                                                ↓
                             reads profiles.profile_completed
                                    ┌───────────┴───────────┐
                              true  ↓                       ↓  false/null
                           /dashboard                /complete-profile
```

`routeAfterAuth()` ([auth-redirect.ts:47](src/auth-redirect.ts#L47)) is the single decision point. It reads exactly one column.

### Redirect URLs

`authRedirectTo()` builds an absolute URL from `window.location.origin` on web, falling back to the `aiaapp://` scheme on native. The three destinations are `/auth/callback`, `/auth/login` (email confirmation) and `/auth/reset-password`.

### `src/session.ts` — read this before touching any auth code

This module exists because of a production bug. The app called `supabase.auth.getUser()` in 28 places and 27 of them discarded the error. `getUser()` makes a **network round-trip**, so an unreachable server returned `user === null`, indistinguishable from being signed out — and six screens then redirected a signed-in student to the login page.

```ts
export type SessionState =
  | { status: "signed-in"; session: Session; user: User }
  | { status: "signed-out" }
  | { status: "unavailable"; reason: string };
```

- **`readSession()`** — three-way answer, with one 700ms retry on `unavailable`. **Anything that redirects must use this and check the status.**
- **`sessionUser()`** — convenience returning `User | null`, deliberately flattening "signed out" and "cannot tell". Only for callers that just need an id to filter their own rows.

`getSession()` answers from local storage; RLS is what actually protects data, server-side, on every request. Trusting storage for "app or login screen" is not a weakening.

**Risk when modifying:** reintroducing `getUser()` anywhere in a render or redirect path reopens the spurious-logout bug. Grep for it before shipping.

### Onboarding

The carousel is paused. [src/onboarding.ts](src/onboarding.ts) and `DevOnboardingReset.tsx` are kept but unreferenced so restoring it is a revert, not a rewrite.

---

## 7. USER PROFILE LOGIC

**Files:** [complete-profile.tsx](src/app/complete-profile.tsx), [(tabs)/profile.tsx](src/app/(tabs)/profile.tsx), [edit-profile.tsx](src/app/edit-profile.tsx), [src/username.ts](src/username.ts)
**Tables:** `profiles` · **Storage bucket:** `profile-pictures`

### Profile creation

`complete-profile.tsx` writes the row with `role: "student"` hardcoded and `faculty` forced to `"College of Medicine"` when the school is LASUCOM. It is the gate for the whole app: `profile_completed` false or null sends the user back here on every sign-in.

### Username rules

[src/username.ts](src/username.ts):

- 3–20 characters, `^[a-zA-Z0-9][a-zA-Z0-9._]*$`
- No repeated dots/underscores, cannot end with one
- Leading `@` is stripped by `normalizeUsername()`
- `useUsernameAvailability()` debounces 450ms and guards against out-of-order responses with a ticket counter
- DB-side: a **unique index on `lower(username)`** where the value is non-blank ([backend_hardening.sql](supabase/migrations/20260818111249_backend_hardening.sql)), and `isDuplicateUsernameError()` catches the `23505` violation as the real backstop

> **This file is what blocks the profiles read lockdown.** `isUsernameTaken()` runs `.from("profiles").ilike("username", …)` across **other users' rows**. The `username_available()` RPC already exists to replace it but is not called. See §13 and §29.

### Editing

`edit-profile.tsx` lets a student change name and username only. School, faculty, department and level are read-only with the footer "Managed by admin support to keep your course access correct" — because those four fields decide which courses the student can see.

### Avatar upload

[profile.tsx:245](src/app/(tabs)/profile.tsx#L245). Picks via `expo-image-picker`, fetches the URI as a **Blob** (not base64 — `expo-file-system` is a no-op shim on web and `readAsStringAsync` throws there), uploads to `profile-pictures/{user.id}/avatar-{timestamp}.{ext}`, then writes the public URL to `profiles.avatar_url`.

Content type comes from `asset.mimeType` first, `blob.type` second — an earlier version sniffed the filename, which is absent from web `blob:` URIs, so every upload was mislabelled `.jpg`.

**Risk when modifying:** this is one of the few genuinely cross-platform paths. Changing the fetch-as-blob approach will break web, native, or both.

---

## 8. DASHBOARD LOGIC AND DATA SOURCES

**File:** [(tabs)/dashboard.tsx](src/app/(tabs)/dashboard.tsx) — 2489 lines, 11 async loaders, ~18 `useState`
**Tables:** `profiles`, `courses`, `course_shares`, `app_period_controls`, `topics`, `materials`, `user_progress`, `user_topic_progress`, `user_goals`, `user_activity_logs`, `xp_events`, `practice_attempts`, `exam_attempts`, `practice_answers`, `exam_answers`, `notifications`

### Loaders

| Function | Line | Purpose |
|---|---|---|
| `loadDashboard()` | 333 | Orchestrates everything on focus |
| `updateDailyStreak()` | 467 | ⚠ see below |
| `fetchUserGoals()` | 508 | Reads `user_goals`, seeds defaults |
| `saveUserGoals()` | 545 | Upserts goal targets |
| `fetchLiveLearning()` | 595 | The period-gated course query (§15) |
| `fetchCompletedTopics()` | 754 | From `user_topic_progress` |
| `fetchRecommendedMaterials()` | 801 | From `materials` |
| `fetchDailyProgress()` | 847 | Today's questions / topics / materials vs goals |
| `fetchLearningStats()` | 980 | Weekly aggregates |
| `fetchUnreadNotifications()` | 1069 | Head count on `notifications` |

### ⚠ The daily streak is not a study streak

`updateDailyStreak()` is called from `loadDashboard()` at [line 379](src/app/(tabs)/dashboard.tsx#L379) with **no gate on activity of any kind**:

```ts
const nextStreak = lastDate === yesterday ? currentStreak + 1 : 1;
await supabase.from("profiles").update({ daily_streak: nextStreak, last_streak_date: today })
```

Opening the dashboard increments it. `profiles.daily_streak` therefore measures **app opens**, not study days, and that number is displayed to students today.

[src/weeklyReport.ts](src/weeklyReport.ts) deliberately does **not** use this column — it recomputes a streak from `user_activity_logs`, and says so in its header comment. Any new feature showing a streak should do the same.

**Risk when modifying:** this write happens on every dashboard load, so it is also a write-amplification source. Fixing it is a data-semantics change; existing `daily_streak` values are already inflated and will not self-correct.

### Desktop

`DASHBOARD_SPLIT = 1240` — dashboard splits into two columns at its own breakpoint, not the global 1024.

---

## 9. STUDY MODE

**File:** [(tabs)/study.tsx](src/app/(tabs)/study.tsx) — **4368 lines, the largest file in the project**
**Tables:** `profiles`, `app_period_controls`, `courses`, `course_shares`, `topics`, `materials`, `questions`, `theory_questions`, `grid_questions`, `user_progress`, `user_topic_progress`, `user_goals`

### Structure

Course → topic → one of three modes:

```ts
const MODES: StudyMode[] = ["materials", "questions", "cards"];
```

The selected mode is a **URL parameter**, not component state (`router.setParams({ mode })`). The file documents why: it makes Android back and browser back work and lets a link point at a mode. Real nested routes would require lifting the theory and grid systems' eight state atoms out of the screen — a refactor, not a navigation change.

### Render functions

The screen is already decomposed into ~20 render functions, which is what makes its two-pane desktop layout possible without a rewrite:

`renderHeader` · `renderSearchBox` · `renderCourseFixedTop` · `renderCourseList(mode)` · `renderTopicList` · `renderFormatSwitch` · `renderQuestions` · `renderTheoryMode` · `renderQuestionMode` · `renderMaterials` · `renderCardBrowser` · `renderQuickCards` · `renderMaterialViewer` · `renderActiveContent` · `renderModeRule` · plus four skeleton renderers

### Content types

- **Materials** — rendered in [MaterialFrame.tsx](src/ui/MaterialFrame.tsx), a sandboxed `<iframe>` (`allow-scripts allow-same-origin allow-popups allow-forms`, `referrerPolicy: no-referrer`), taking either a `src` URL or `srcDoc` HTML, with a 4-second "still loading" state
- **Questions** — MCQ from `questions`
- **Theory questions** — from `theory_questions`, self-marked, scored by [theoryScore.ts](src/theoryScore.ts)
- **Grid/table questions** — from `grid_questions`, rendered by [GridQuestion.tsx](src/ui/GridQuestion.tsx), matched with the same trim-and-collapse rule the admin side grades by
- **Flashcards** — card browser and quick-cards

### Theory scoring

[theoryScore.ts](src/theoryScore.ts): self-check ratings `missed`/`partly`/`got` → 0/3/5 out of 5. `DEFAULT_MARKS = 5` when a question carries none. `scoreTopic()` returns earned/possible split by `self` vs `auto` source.

**Risk when modifying:** this is the largest and most stateful file in the project, it carries the one pre-existing `tsc` error (line 3290), and its mode-as-URL-param design is load-bearing for browser back. Change it in small pieces and re-check both the phone and the ≥1024px layout.

---

## 10. PRACTICE MODE

**File:** [(tabs)/practice.tsx](src/app/(tabs)/practice.tsx) — 2232 lines
**Tables:** `profiles`, `app_period_controls`, `courses`, `course_shares`, `topics`, `questions`, `practice_attempts`, `practice_answers`, `user_progress`, `user_activity_logs`, `xp_events`

### Screen state machine

```ts
type Screen = "courses" | "topics" | "setup" | "confirm" | "engine"
            | "loadingRetry" | "result" | "review";
```

### Distinctive features

- **Confidence tracking** — every answer carries `low` / `medium` / `high`. Feeds `confidence_accuracy`, `confidence_answered` and `high_confidence_wrong` on `practice_attempts`.
- **Resumable sessions** — the in-progress session is written to AsyncStorage under `lasu_scholar_practice_session` and offered back on return.
- **Flag and save** per question.

### XP formula ([practice.tsx:256](src/app/(tabs)/practice.tsx#L256))

```ts
correct * 10
  + (total > 0 ? 20 : 0)                                        // completion
  + (pct >= 90 ? 50 : pct >= 75 ? 30 : pct >= 50 ? 10 : 0)      // accuracy
  + (confAcc >= 80 ? 15 : confAcc >= 60 ? 8 : 0)                // confidence
  - (confidentWrong * 2)                                         // penalty
// floored at 0
```

### Data flow on submit

```
finishPractice()
  → savePracticeAttempt()       insert practice_attempts (+ practice_answers)
  → updateProgress()            insert user_progress  (records ANSWERED, not session size)
  → xp_events insert
  → useScreenTime flushes       insert user_activity_logs
```

`updateProgress()` carries a comment recording a fixed bug: it records **answered** questions, not `questions.length`. Recording the session size meant skipping every question still logged a full session's work and deflated profile accuracy.

---

## 11. EXAM MODE

**File:** [(tabs)/exam.tsx](src/app/(tabs)/exam.tsx) — 2729 lines
**Tables:** same as practice, plus `exam_attempts` and `exam_answers`

### Differences from practice

- **Timed** — default 60 minutes, `secondsLeft` countdown, auto-submit at zero
- **Course-wide**, not topic-scoped
- **Question navigator** — currently a `<Modal>` (`ExamNavigator`, ~line 1709) taking pure data props
- **No confidence tracking**
- Result includes a breakdown table and a shareable score card

### XP formula ([exam.tsx:247](src/app/(tabs)/exam.tsx#L247))

```ts
correct * 12
  + (total > 0 ? 35 : 0)                                                   // completion
  + (pct >= 80 ? 80 : pct >= 70 ? 55 : pct >= 60 ? 35 : pct >= 50 ? 15 : 0) // grade
// floored at 0
```

Exam XP is deliberately higher-weighted than practice.

**Risk when modifying:** the timer, auto-submit and navigator interact. A timed assessment is the one screen where a mid-session regression loses a student's real work.

---

## 12. ADMIN CONSOLE — NOT IN THIS REPOSITORY

**There is no admin console in this codebase.** Searching the entire source tree for admin functionality returns only comments *referring* to a separate application. The only git remote is `https://github.com/Brillytech/aia-app.git`.

What can be stated from evidence in this repo:

- A separate admin application exists and is the author of courses, topics, questions, materials and notifications. [notifications.tsx:106](src/app/notifications.tsx#L106) notes that `action_url` "is written by the admin app"; [GridQuestion.tsx:52](src/ui/GridQuestion.tsx#L52) matches answers "exactly as the admin side grades it".
- `profiles.role` holds `'student'` and `'super_admin'`. Per [profiles_write_lockdown.sql](supabase/migrations/20260911194400_profiles_write_lockdown.sql), at the time that migration was drafted the live table had **15 student rows and 2 super_admin rows**.
- That migration defines `public.is_admin()` matching `role in ('admin', 'super_admin')` and notes "the admin repo is the only plausible user of a cross-row update".

**[NEEDS VERIFICATION]** — every actual feature of the admin console. Do not infer its behaviour from this repository.

---

## 13. SUPABASE TABLES, COLUMNS, RELATIONSHIPS, QUERIES AND RLS

### ⚠ The base schema is not version-controlled here

`supabase/migrations/` contains **7 files, and only one `create table` statement** (`notification_reads`). Every other table — `profiles`, `courses`, `topics`, `questions`, `materials`, all the attempt/answer/progress tables — was created outside this repository, presumably through the Supabase dashboard or the admin repo.

**Consequence:** you cannot reconstruct the schema from this repo, and a fresh Supabase project cannot be provisioned from these migrations. Column types, nullability, defaults, foreign keys and indexes are **[NEEDS VERIFICATION]** against the live database.

### Tables the client touches (21)

Harvested mechanically from every `.from()` call. *Column lists are the names the client references, not the full schema*, and the harvester reads a fixed window after each call so a few names may be attributed to an adjacent query — treat them as a strong guide, not a contract.

| Table | Ops | Key columns referenced | Used by |
|---|---|---|---|
| `profiles` | select, update, upsert | id, username, full_name, avatar_url, email, school, faculty, department, level, role, profile_completed, daily_streak, last_streak_date, daily_questions_goal, daily_topics_goal, daily_materials_goal, xp_earned, accuracy_percent | 11 files |
| `courses` | select | id, code, title, semester, status, school, faculty, department, level, academic_period_id, course_icon, course_color | dashboard, study, practice, exam |
| `course_shares` | select | school, faculty, department, level, academic_period_id + embedded `courses(...)` | dashboard, study, practice, exam |
| `app_period_controls` | select | school, department, level, live_period_id | dashboard, study, practice, exam |
| `topics` | select | id, course_id, title | dashboard, study, practice |
| `materials` | select | (filters: course_id, topic_id, position, created_at) | dashboard, study |
| `questions` | select | id, course_id, topic_id, question, option_a–e, correct_answer, explanation | study, practice, exam |
| `theory_questions` | select | (filters: course_id, topic_id, position) | study |
| `grid_questions` | select | (filters: course_id, topic_id, position) | study |
| `practice_attempts` | insert, select | user_id, course_id, topic_id, score_percent, correct_answers, wrong_answers, unanswered, time_used_seconds, xp_earned, confidence_accuracy, confidence_answered, high_confidence_wrong | practice, dashboard, weeklyReport |
| `practice_answers` | insert, select | user_id, question/selected_answer, created_at | practice, dashboard, studyReminder, weeklyReport |
| `exam_attempts` | insert, select | user_id, course_id, score_percent, correct_answers, wrong_answers, unanswered, total_questions, time_used_seconds, xp_earned | exam, dashboard, weeklyReport |
| `exam_answers` | insert, select | user_id, selected_answer, created_at | exam, dashboard, studyReminder, weeklyReport |
| `user_progress` | select, insert, upsert, delete | user_id, course_id, topic_id, mode, score_percent, accuracy_percent, questions_studied, questions_correct, materials_opened, duration_seconds | 5 screens |
| `user_topic_progress` | select, upsert | user_id, course_id, topic_id, completed, completed_at, progress_percent | dashboard, study, studyReminder, weeklyReport |
| `user_goals` | select, upsert | user_id, daily_questions_goal, daily_topics_goal, daily_materials_goal, updated_at | dashboard, study, studyReminder |
| `user_activity_logs` | insert, select | user_id, mode, course_id, topic_id, duration_seconds, week_start, created_at | 7 files |
| `xp_events` | insert, select | user_id, xp, mode, source, source_id, week_start, created_at, description | 6 files |
| `notifications` | select, update | id, user_id, title, message, type, is_read, action_url, created_at + **is_published, expires_at, target_school, target_faculty, target_department, target_level, target_role** | dashboard, notifications, notify |
| `notification_reads` | select, upsert | user_id, notification_id, read_at | notifications |
| `app_reviews` | insert | user_id, display_name, department, level, rating, review, status | profile |

The seven bold `notifications` columns appear only inside `.or()` filter strings, which is why they are easy to miss when grepping.

**Storage:** one bucket, `profile-pictures`, public-read, path `{user_id}/avatar-{timestamp}.{ext}`.

### Database functions (all in migrations, all applied per project records)

| Function | Purpose | Grants |
|---|---|---|
| `leaderboard_totals(text, timestamptz)` | Internal aggregation over `xp_events` | revoked from public, anon **and authenticated** |
| `leaderboard(text, timestamptz, int, int)` | Ranked page of the leaderboard | `authenticated` only |
| `my_leaderboard_rank(text, timestamptz)` | The caller's own rank | `authenticated` only |
| `username_available(text)` | Availability check without reading other rows | `authenticated` only |
| `is_admin()` | `role in ('admin','super_admin')` for the caller | `authenticated` only |

All are `security definer` with `set search_path = public, pg_temp`.

> **⚠ A permissions trap that already bit this project once.** Supabase grants `EXECUTE` on new functions to `anon`, `authenticated` and `service_role` **by name**, via DEFAULT PRIVILEGES. `revoke ... from public` therefore closes **nothing**. Four functions shipped callable by `anon`, two of them returning real data, before this was caught. Every function must explicitly `revoke ... from public, anon`. [20260911194300_default_privileges_functions.sql](supabase/migrations/20260911194300_default_privileges_functions.sql) changes the default so future functions are not born open.

### RLS

Confirmed from migrations:

- `notification_reads` — RLS enabled, three own-row policies (select/insert/delete on `auth.uid() = user_id`)
- `profiles` — the **write** lockdown replaces a policy literally named "Allow admins update profile roles" that was scoped `{public}` with `qual: true`, i.e. everyone. It adds own-row insert/update, an admin-only update policy, and a `profiles_guard_role()` trigger forcing `role = 'student'` on non-admin inserts.

**[NEEDS VERIFICATION] — RLS on every other table.** A `pg_policies` audit query was written for this and its output has never been collected. Until it is, the RLS posture of `courses`, `questions`, `materials`, all attempt/answer/progress tables, `notifications` and `app_reviews` is **unknown**. Remember that permissive policies OR together, so a single `qual: true` policy defeats every careful one beside it.

### Migration status (per project records — re-verify against the live DB)

| File | Status |
|---|---|
| `20260818111249_backend_hardening.sql` | Applied |
| `20260911155128_leaderboard_ranking.sql` | **Applied** |
| `20260911160200_username_available.sql` | **Applied** |
| `20260911160922_leaderboard_grants_fix.sql` | **Applied** |
| `20260911194300_default_privileges_functions.sql` | Written, **not run** — safe to run |
| `20260911194400_profiles_write_lockdown.sql` | Written, **not run** — safe to run |
| `20260911194500_profiles_read_lockdown.sql` | Written, **DO NOT RUN YET** |

**Why the read lockdown is blocked:** it restricts `profiles` SELECT to own-row + admin. Two client paths read other users' rows today — `isUsernameTaken()` in [username.ts](src/username.ts), and the client-side leaderboard in [leaderboard.tsx](src/app/leaderboard.tsx). Running it before those switch to `username_available()` and `leaderboard()` will break both.

---

## 14. IMPORTANT BUSINESS RULES AND CONDITIONAL LOGIC

1. **Profile gate.** `profiles.profile_completed` decides `/dashboard` vs `/complete-profile` on every sign-in.
2. **Course visibility is period-gated.** No `live_period_id` for the student's (school, department, level) → **zero courses**, shown as an empty state, not an error.
3. **LASUCOM has one faculty.** `school === "LASUCOM"` ⇒ faculty is forced to `"College of Medicine"` and is not asked for.
4. **LASU filters by faculty; LASUCOM does not.** `if (school === "LASU" && faculty) query.eq("faculty", faculty)`.
5. **Course status.** `(course.status || "active") === "active"` — a null status counts as active.
6. **Courses are deduped by id** across owned + shared, then sorted alphabetically by `"{code} {title}"` with numeric collation.
7. **Practice records answered questions, not session size.**
8. **Practice XP penalises confident wrong answers** (−2 each); exam XP has no confidence term.
9. **Screen time is only logged above 5 seconds** and flushes every 60s (`MIN_LOGGED_SECONDS`, `FLUSH_INTERVAL_MS`).
10. **Only one popup per app open**, ordered by rarity: weekly report → external announcement → study nudge ([_layout.tsx](src/app/_layout.tsx)).
11. **Popups are cleared on sign-out and on any `/auth` route** — they carry real personal numbers and must never sit over a login form.
12. **The weekly report offer is keyed by week, not timestamp** — stored value is the Monday it was offered for.
13. **An empty week is never offered.** A report reading "0 minutes, 0 questions" is the app talking to itself.
14. **A failed read is not an empty result.** `maybeOfferWeeklyReport()` and `isDayEmpty()` both return "not empty / don't fire" when the query errors.
15. **Study nudges: two windows a day, once each.** 09:00–12:00 and 16:00–21:00, only for users active within 7 days, only when the day is genuinely empty.
16. **Notification `action_url` is allow-listed**, never followed blindly — `ROUTES` in [notify.ts:356](src/notify.ts#L356). A row pointing anywhere else gets no button.
17. **Notification targeting**: a row matches when each `target_*` column is NULL or equals the student's value. NULL `is_published`/`expires_at` count as published/never-expiring so pre-existing rows keep showing.
18. **Theory default marks = 5** when a question carries none.
19. **Week starts Monday** ([days.ts](src/days.ts)) — but see §22.4 for the `week_start` column, which disagrees.

---

## 15. ACADEMIC PERIODS, SCHOOLS, FACULTIES, DEPARTMENTS, LEVELS, SEMESTERS

### Schools

Exactly two, hardcoded in [complete-profile.tsx](src/app/complete-profile.tsx): **`LASU`** and **`LASUCOM`**.

### Faculties (LASU only) — 11

Arts · Communication and Media Studies · Education · Engineering · Environmental Sciences · Law · Management Sciences · Science · Social Sciences · Computing and Information Technology · School of Agriculture · School of Library, Archival and Information Science · School of Transport and Logistics

LASUCOM has a single implicit faculty, `"College of Medicine"`.

### Departments

Roughly 90 across the LASU faculties (e.g. Arts: Arabic, CRS, English, French, History and International Studies, Islamic Studies, Linguistics, Music, Peace Studies, Philosophy, Portuguese/English, Theatre Arts, Yoruba). LASUCOM has 9: Dentistry, Medical Laboratory Science, Medicine and Surgery, Nursing, Pharmacy, Pharmacology, Physiology, Physiotherapy, Radiography and Radiation Science.

**This list is a hardcoded constant in a single screen file**, not a database table. Adding a department is a code change and a redeploy.

### Levels

```ts
const LASU_LEVELS    = [{ label: "100 Level", value: "100L" }];
const LASUCOM_LEVELS = [{ label: "100 Level", value: "100L" },
                        { label: "200 Level", value: "200L" }];
```

**LASU currently supports 100 Level only.** This is a live product constraint, not an oversight.

### Academic periods — how course visibility actually resolves

```
profiles(school, department, level)
        ↓
app_period_controls  WHERE school=? AND department=? AND level=?
        ↓
   live_period_id            ── null ⇒ show NO courses (empty state)
        ↓
 ┌──────┴───────────────────────────────────┐
 │ owned: courses                            │  shared: course_shares
 │   school/department/level/academic_period │    same four filters,
 │   + faculty  (LASU only)                  │    embedded courses(...)
 └──────┬───────────────────────────────────┘
        ↓
  dedupe by course.id  →  filter status === 'active'  →  sort alphabetically
```

This identical block is implemented **four separate times** — in [dashboard.tsx:595](src/app/(tabs)/dashboard.tsx#L595), [study.tsx:1000](src/app/(tabs)/study.tsx#L1000), [practice.tsx:471](src/app/(tabs)/practice.tsx#L471) and [exam.tsx:364](src/app/(tabs)/exam.tsx#L364). **Any change to course visibility must be made in all four.** This is the single highest-value extraction candidate in the codebase (§28).

### Semesters and blocks

`semester` is selected in all four course queries and typed on every `Course` type — and is **never filtered on and never displayed**. It is dead data in the client today.

**[NEEDS VERIFICATION]** — the "block" concept. Searching the source for a block/rotation concept returns nothing. If LASUCOM organises teaching in blocks rather than semesters, that rule does not exist in this client.

---

## 16. NOTIFICATIONS, XP, PROGRESS, GOALS, ANALYTICS, ACTIVITY TRACKING

### Notifications

**Files:** [src/notify.ts](src/notify.ts), [src/app/notifications.tsx](src/app/notifications.tsx), [src/app/_layout.tsx](src/app/_layout.tsx), [src/ui/AlertModal.tsx](src/ui/AlertModal.tsx)
**Tables:** `notifications`, `notification_reads`, `profiles`

Everything is **in-app**. There are no push notifications and no service-worker `push` handler.

**Five preference categories**, stored in AsyncStorage under `lasu_scholar_notification_preferences` (device-local, not synced):

`study_reminders` · `practice_streaks` · `material_updates` · `weekly_report` · `activity_updates`

**Two surfaces:**

1. **The list** (`/notifications`) — `fetchNotifications()` runs one targeting query (§14.17) and returns up to 50 rows.
2. **The popup** — an external-store queue in `notify.ts` exposed through `useSyncExternalStore`, rendered by the root layout as an `AlertModal`. `showPopup()` checks the preference toggle before queueing and returns whether it showed anything.

Watermark: `lasu_scholar_popup_watermark` records the newest row already seen, and **initialises to "now" on first run** so a new user is not greeted with a backlog.

### Triggers writing real list rows — `notify_me()`

Until 2026-09-13 all three in-app triggers could only raise a **popup**: miss it and it was gone, because the client had no insert path into `public.notifications` and should not be given a blanket one (that would let any authenticated user address a notification to anyone, or broadcast to everyone).

[20260913120000_notify_me.sql](supabase/migrations/20260913120000_notify_me.sql) closes this. `notify_me(p_type, p_title, p_message, p_action_url, p_dedupe_hours)` is `SECURITY DEFINER` and can write exactly one shape of row — a personal notification, for the caller, of a known type. **The caller never names the recipient; `auth.uid()` does.** It validates the type against the same five categories the client can render, requires a non-blank title and message, and returns `(id, created_at)`.

The function builds its INSERT dynamically for one specific reason: the base schema is not in this repo, and `fetchNotifications()` requires `is_published` to be null-or-true. A column defaulting to `false` would have made every self-written row **invisible** — working in the database and absent from the screen. So `is_published` and `is_read` are set explicitly *when those columns exist*.

Client side, in [notify.ts](src/notify.ts):

```ts
notifyMe({ type, title, message, actionUrl, dedupeHours }): Promise<NotifyResult>
notifyAndPopup(row, popup): Promise<boolean>     // the entry point triggers use
```

`NotifyResult` is three-way, the same shape and for the same reason as `readSession`:

| Status | Meaning | What the caller does |
|---|---|---|
| `written` | Row is in the list | Show the popup |
| `duplicate` | Dedupe window swallowed it | Stay quiet |
| `unavailable` | RPC missing or errored | **Show the popup anyway** |

That third branch matters: **if the migration has not been run, behaviour degrades to exactly what the app did before** — popup-only — rather than to silence.

**Preferences are deliberately not checked before writing.** A toggle governs being *interrupted*, not whether the record exists. `fetchNotifications` has never filtered on preferences, so admin rows of muted categories already appear in the list; a student who re-enables a category should find its history intact rather than a gap. `showPopup` remains the single place a toggle is consulted.

**The double-fire trap, and how it is closed.** A trigger that calls `notifyAndPopup` has already shown its popup *and* written the row. Without a guard, the next app open would find that row sitting above the popup watermark and show the identical message a second time. The fix is a small ledger of this device's own notification ids (`lasu_scholar_self_notifications`, capped at 20) which `popExternalNotification()` skips over. It deliberately does **not** simply advance the watermark past the new row — an admin announcement that arrived between the old watermark and the self-written row would have been skipped and lost forever. The scan now fetches 10 rows, advances the watermark to the newest (preserving the existing "one popup, not nine" rule) and pops the newest row it did not write itself.

Dedupe windows in use: study reminder **4h** (shorter than the 4-hour gap between the morning and afternoon windows, so it can never suppress the afternoon nudge); weekly report **144h** (six days — one Monday cannot write twice, next Monday is never suppressed).

### Push notifications — NOT BUILT

**There are no push notifications.** Verified: no `push` or `notificationclick` handler in the generated service worker, no `PushManager` subscription anywhere, no VAPID key, no subscriptions table. Everything described above is **in-app only** and can reach a student solely while they have the app open.

This is the honest limitation of the whole system today, and [studyReminder.ts](src/studyReminder.ts) says so in its own header: *"Without device push nothing can reach a student who is not in the app, so this can only fire once they have already come back — by which point reminding them to come back is moot."*

**Nothing has been shipped toward push on purpose.** A "Enable push notifications" toggle that cannot deliver a push would repeat the exact mistake this project already corrected once — the removed *Exam alerts* category "promised warnings about exams the app has no way to know about… an offer it could never keep". The toggle should appear in the same change that makes it work, not before.

**What building it actually requires — four parts, only one of which is client code:**

1. **A VAPID keypair.** Public key ships in the client bundle; **the private key must live in Supabase secrets and must never enter this repository.** Generate with `npx web-push generate-vapid-keys`.
2. **A `push_subscriptions` table** — `(user_id, endpoint unique, p256dh, auth, user_agent, created_at)` with RLS restricting every row to `auth.uid() = user_id`, plus a delete path for expired endpoints.
3. **A sender.** A Supabase Edge Function holding the private key, signing Web Push requests. This is the part that does not exist in any form and cannot be written from this repository. It is also where `notify_me()` becomes useful twice over — the same row that lands in the list is what the sender pushes.
4. **Client code** — `Notification.requestPermission()`, `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`, storing the subscription, and `push` / `notificationclick` handlers. The handlers cannot go in [build-sw.mjs](scripts/build-sw.mjs) as it stands, because `generateSW` produces the whole worker — it would need `injectManifest` and a hand-written source worker instead. **That is a real change to the service worker build and must be done carefully**; the current worker's `skipWaiting: false` behaviour and its `NetworkOnly` rule for Supabase must survive it.

**Platform constraint to plan around:** on iOS, Web Push works only from Safari 16.4+ **and only when the PWA has been added to the home screen**. A browser-tab user on iPhone cannot receive push at all. Since a large share of this audience is on iPhone, the install banner in [_layout.tsx](src/app/_layout.tsx) stops being a nicety and becomes a prerequisite.

**[NEEDS VERIFICATION]** — whether the Supabase project is on a plan that permits Edge Functions, and whether the admin app already has any push infrastructure of its own.

### XP

`xp_events` rows are inserted on practice and exam completion, carrying `xp`, `mode`, `source`, `source_id`, `week_start` and `created_at`. Formulas are in §10 and §11. The leaderboard and the weekly report both aggregate this table.

### Progress

- `user_progress` — per course/topic/mode session records
- `user_topic_progress` — topic completion (`completed`, `completed_at`, `progress_percent`)

### Goals

`user_goals` holds three daily targets: `daily_questions_goal`, `daily_topics_goal`, `daily_materials_goal`. Defaults are seeded by `ensureDefaultGoals()`. The dashboard renders them as progress rings against today's counts. `profiles` also carries the same three column names — **[NEEDS VERIFICATION]** which is authoritative.

### Analytics — the weekly report

**File:** [src/weeklyReport.ts](src/weeklyReport.ts) → [src/app/weekly-report.tsx](src/app/weekly-report.tsx)

`loadWeeklyReport(userId, offset)` runs seven parallel queries (activity logs, practice/exam answer counts, practice/exam scores, XP, completed topics) and returns minutes by day and by mode, questions answered, mean accuracy, XP, a recomputed streak, topics completed, top courses, session count, best day, and the previous period's minutes for comparison.

The page renders an SVG donut (`<Circle>` with `strokeDasharray`/`strokeDashoffset`, rotated −90°), a 7-day bar chart, six stat tiles and a top-courses list, with a **This week / Last week** toggle and a full content-matching skeleton.

One query covers the chart, last week's comparison **and** the streak — the same rows sliced three ways.

### Activity tracking

[src/screen-time.ts](src/screen-time.ts) — `useScreenTime(mode, courseId, topicId)` is mounted by study, practice and exam. It starts a timer on focus, flushes every 60s and on blur/background, discards anything under 5 seconds, and inserts into `user_activity_logs`. Course and topic ids are validated against a UUID regex first, so a non-UUID id becomes `null` rather than a failed insert.

---

## 17. REUSABLE SERVICES, HOOKS, COMPONENTS AND UTILITIES

### Services and hooks (`src/`)

| Module | Exports | Notes |
|---|---|---|
| [session.ts](src/session.ts) | `readSession`, `sessionUser`, `SessionState` | **The auth reader.** Never use `getUser()`. |
| [notify.ts](src/notify.ts) | `fetchNotifications`, `showPopup`, `dismissPopup`, `clearPopups`, `useNotificationPopup`, `popExternalNotification`, `readPreferences`, `preferenceForType`, `iconForType`, `colorForType` | Popup queue is an external store |
| [days.ts](src/days.ts) | `localDayKey`, `startOfLocalDay`, `startOfLocalWeek`, `localWeekDays` | **Local timezone.** Monday-based weeks. |
| [weeklyReport.ts](src/weeklyReport.ts) | `loadWeeklyReport`, `maybeOfferWeeklyReport`, `MODE_COLOR`, `MODE_LABEL` | |
| [studyReminder.ts](src/studyReminder.ts) | `maybeNudgeStudy` | Two windows/day |
| [screen-time.ts](src/screen-time.ts) | `useScreenTime` | |
| [username.ts](src/username.ts) | `normalizeUsername`, `usernameFormatError`, `isUsernameTaken`, `useUsernameAvailability`, `isDuplicateUsernameError` | |
| [auth-redirect.ts](src/auth-redirect.ts) | `authRedirectTo`, `AUTH_REDIRECTS`, `routeAfterAuth` | |
| [theme.ts](src/theme.ts) | `useThemeMode`, `getTheme`, `lightTheme`, `darkTheme`, `category`, `medal`, `saveTheme` | |
| [theoryScore.ts](src/theoryScore.ts) | `scoreTopic`, `ratingFraction`, `marksFor`, `earnedFor`, `formatMarks` | Pure functions |
| [courses.ts](src/courses.ts) | `sortCoursesAlphabetically`, `courseCode` | |
| [premium.ts](src/premium.ts) | `usePremium`, `PLANS`, `PREMIUM_FEATURES`, `purchasePlan` | Purchase stub |
| [pwa/useServiceWorker.ts](src/pwa/useServiceWorker.ts) | `useServiceWorker` | Registration + update detection |
| [pwa/useInstallPrompt.ts](src/pwa/useInstallPrompt.ts) | `useInstallPrompt` | `beforeinstallprompt`, iOS fallback |

### Layout primitives (`src/ui/layout/`)

- **`breakpoints.ts`** — `DESKTOP_MIN_WIDTH = 1024`, `useBreakpoint(min)` (per-screen), `useIsDesktop()` (app-wide), `useContentInset()`
- **`SplitPane.tsx`** — renders `main` then `side` stacked below the breakpoint, side-by-side above. Below the breakpoint it produces **the same tree in the same order as before** — the mobile branch is the existing code path, not a new one.

### Design tokens

[src/ui/tokens.ts](src/ui/tokens.ts) — `spacing`, `layout` (incl. `screenGutter`, `tabBarInset = 150`), `radius`, `weight`, `type` scale, `motion`, `elevation(level, shadowColor)`, `shade()`, `withAlpha()`, `noFocusRing`.

### Component library (`src/ui/`, ~60 files)

**Navigation/chrome:** `TabBar` (phone, absolute, raised centre button), `SideNav` (desktop, ~240px), `PageHeader`, `Screen`, `Wordmark`, `AppBanner`
**Content:** `Card`, `Surface`, `List` (`ListRow`/`ListSection`/`dividerInset`), `Rows`, `Folder`, `CourseFolder`, `CourseRail`, `CourseTile`, `CourseWell`, `IconPlate`, `FolderIcon`
**Questions:** `QuestionShell`, `GridQuestion`, `TheoryQuestion`, `TheoryResults`, `ReviewPager`, `RichText` (KaTeX + DOMPurify)
**Feedback:** `AlertModal` (also the popup surface), `Skeleton` (`SkeletonBar`, `SkeletonSlot`), `ProgressRing`, `Score`, `Stat`, `HintBadge`, `UsernameStatusHint`
**Input:** `Button`, `Field`, `AuthField`, `Stepper`, `Segmented`
**Other:** `MaterialFrame`, `ModeSheet`, `ResultShareCard`, `Avatar`, `Premium`, `haptics`, `share-file`, `print-html`, `subject`, `density`, `motion`, `useCollapse`, `useThemeChrome`

**Standing project rule:** new screens get a **content-matching skeleton**, not a spinner, reusing `SkeletonBar`/`SkeletonSlot` and the shared sweep driver.

---

## 18. IMPORTANT DEPENDENCIES AND WHAT EACH IS FOR

| Package | Used for |
|---|---|
| `expo`, `expo-router` | Framework and file-based routing |
| `react-native-web` | Renders the RN component tree to DOM — this is what makes the PWA possible |
| `@supabase/supabase-js` | Auth, Postgres queries, Storage |
| `@react-native-async-storage/async-storage` | localStorage wrapper: session, theme, prefs, watermark, resumable practice session |
| `react-native-reanimated` (+ `react-native-worklets`) | Animations, spring transitions |
| `react-native-svg` | Donut chart, progress rings, score dials |
| `@expo/vector-icons` | MaterialCommunityIcons throughout |
| `katex` + `scripts/sync-katex.js` | Maths rendering in `RichText` |
| `dompurify` | Sanitises admin-authored HTML before rendering |
| `react-native-view-shot` | Captures the result share card as an image |
| `expo-print` | PDF summaries |
| `expo-sharing` | Share sheet (native); web falls back to download |
| `expo-image-picker` | Avatar selection |
| `expo-haptics` | Tactile feedback (no-op on web) |
| `expo-screen-capture` | Screenshot prevention — **currently commented out**, "enable when ready for production" |
| `expo-web-browser`, `expo-auth-session` | OAuth browser flow |
| `react-native-safe-area-context` | Notch/home-indicator insets |
| `workbox-build` (dev) | Generates `dist/sw.js` |
| `supabase` (dev) | Supabase CLI |
| `@expo/ngrok` | Tunnelling for device testing |

**Present but effectively unused:** `react-native-webview` (web uses `MaterialFrame`'s iframe), `lottie-react-native` / `@lottiefiles/dotlottie-react`, `expo-glass-effect`, `expo-symbols`, `expo-device`, `base64-arraybuffer` (the avatar path dropped it), `buffer`.

---

## 19. ENVIRONMENT VARIABLES — THERE ARE NONE

**This project uses no environment variables at all.** Searching the entire source tree for `process.env`, `EXPO_PUBLIC_*` and `Constants.expoConfig.extra` returns **zero matches**.

The Supabase URL and anon key are **hardcoded literals** in [lib/supabase.ts](lib/supabase.ts), which is tracked in git.

To be precise about the risk, because it is easy to overstate and easy to dismiss:

- The **anon key is designed to be public.** It ships in the JavaScript bundle of every Supabase web app. It is not a secret, and Row-Level Security is what actually protects data. Its presence in git is not a credential leak.
- What *is* a real problem: **there is no way to change the project or key without a code change and a redeploy**, there is no staging/production separation, and there is no place for a genuine secret to live if one is ever needed. Nothing structurally prevents the next person from adding a service-role key beside it — which *would* be a critical leak.

**The only `.env` file present** is `.env.local`, gitignored, containing one Vercel CLI variable:

```
VERCEL_OIDC_TOKEN      # names only — value not reproduced
```

**Recommended (not yet done):** move to `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`, set in Vercel's project settings, read via `process.env`. Note the `EXPO_PUBLIC_` prefix is required for the value to reach the client bundle.

**Never** put the Supabase **service-role key**, database password, or any admin credential into this repository or this client. There is no server-side code here to use one safely.

---

## 20. DEPLOYMENT PROCESS

**Host:** Vercel · **Repo:** `Brillytech/aia-app` · **Production branch:** `master`

### Build

[vercel.json](vercel.json):

```json
{ "buildCommand": "npm run build:web", "outputDirectory": "dist" }
```

```
npm run build:web
  = expo export -p web                    → dist/ (SPA bundle)
 && node ./scripts/stamp-build.mjs dist   → injects <meta name="build-id">
 && node ./scripts/build-sw.mjs dist      → Workbox generateSW → dist/sw.js
```

Order matters and is documented in the scripts: the stamp must land **before** the service worker hashes `index.html`, or the precached shell's revision would not match its contents.

### The build id

`stamp-build.mjs` writes `<meta name="build-id" content="<short-sha> <UTC time>Z">`, appending `+` when `git status --porcelain` is non-empty, and now **prints the dirty paths to the build log**. `getBuildId()` reads it back; `useServiceWorker` logs it. This exists because "is the browser running my change?" has cost multiple rounds of investigation — once against a build that had never been pushed.

### Cache headers

`sw.js`, `index.html` and `manifest.json` are served `public, max-age=0, must-revalidate`. Hashed assets under `_expo/` are immutable by default.

### SPA rewrite

```
"source": "/((?!_expo/|assets/|.*[.]).*)"  →  "/index.html"
```

### Service worker ([scripts/build-sw.mjs](scripts/build-sw.mjs))

- Precaches `index.html`, `manifest.json`, `_expo/static/js/**`, icons, the MaterialCommunityIcons font, KaTeX css/fonts (~31 files, ~5.2 MB)
- `skipWaiting: false`, `clientsClaim: false` — **a new build never takes over a page mid-session**; the user reloads via the "New version available" banner
- `navigateFallback: "/index.html"` with a denylist for `_expo/`, `assets/` and anything with a file extension
- **All Supabase requests are `NetworkOnly`** — no API response is ever cached. Same for any cross-origin request.
- Fonts and images: `CacheFirst`, 30-day expiry

### Verifying a deploy

Push to `master`, wait ~60s, then confirm the live site serves the expected commit by reading the `build-id` meta tag. Do not assume a push reached the browser — this project has been burned by exactly that.

---

## 21. CURRENT WORKING FEATURES

Verified present and wired end-to-end at `c51c36e`:

✅ Email/password + Google sign-in, signup, password reset
✅ Profile completion gate, edit profile, avatar upload
✅ Period-gated course catalogue (owned + shared)
✅ Study: materials viewer, MCQ, theory (self-marked), grid/table questions, flashcards
✅ Practice: confidence tracking, resumable sessions, results, review
✅ Exam: timer, navigator, auto-submit, breakdown, share card
✅ XP, daily goals, weekly stats, leaderboard (3 ranges)
✅ Weekly report with donut, bar chart, stat tiles, week toggle
✅ Notification list, preferences, popup layer
✅ Study reminders (2 windows), weekly report offer
✅ Light/dark theme incl. PWA status-bar chrome
✅ PWA install prompt, offline shell, update banner, build-id stamping
✅ Desktop sidebar + split panes on 7 screens
✅ PDF summaries, share cards

---

## 22. KNOWN BUGS AND UNRESOLVED ISSUES

Ordered roughly by user impact.

**22.1 — A signed-in user opening the app lands on the login page.**
[index.tsx](src/app/index.tsx) redirects to `/auth/login` unconditionally, and [login.tsx](src/app/auth/login.tsx) contains **no session check whatsoever** (verified: no `useEffect`, no `getSession`). Confirmed by reading both files.

**22.2 — `profiles.daily_streak` counts app opens, not study days.** §8. Live and visible to students. Existing values are already inflated.

**22.3 — Signup does not detect an existing account.** Supabase returns success with no session for an already-registered confirmed email (enumeration protection). [signup.tsx:128](src/app/auth/signup.tsx#L128) shows "Check Your Email" regardless, so a returning user gets a confirmation instruction for an account that already exists.

**22.4 — `week_start` is written one day early.** **Measured, not inferred.** `getWeekStartDateKey()` in [screen-time.ts](src/screen-time.ts) computes a local Monday then calls `toISOString()`, which converts to UTC. At UTC+1 (Nigeria):

```
2026-09-16T12:00 local  →  week_start = 2026-09-13  (Sunday)
                           days.ts local Monday = 2026-09-14
```

It is internally consistent, so grouping by `week_start` still works. But it disagrees with `days.ts` by one day, and `leaderboard()` filters on `week_start >= p_since`. Any comparison against a locally-computed Monday will be wrong. The same UTC pattern is duplicated in `getWeekStartIso()`/`getWeekStartDateKey()` inside dashboard, practice and exam.

**22.5 — Nothing calls the leaderboard RPCs.** `leaderboard()`, `my_leaderboard_rank()` and `username_available()` are applied and correctly permissioned; the client still aggregates `xp_events` in the browser. This will not scale to thousands of students and it blocks the profiles read lockdown.

**22.6 — RLS posture is unknown for most tables.** §13. The `pg_policies` audit has never been run. Four tables have already been found exposed to `anon` one at a time.

**22.7 — Two safe migrations are unapplied.** `20260911194300` and `20260911194400`.

**22.8 — Page-level spinners remain** on dashboard, exam, practice, edit-profile and complete-profile, against the standing skeleton rule. *(Explicitly deferred by the project owner as its own pass — not urgent, but on the list.)*

**22.9 — The period-gated course query is duplicated four times.** §15.

**22.10 — No push notifications.** §16. In-app only; nothing can reach a student who does not open the app. Deliberately not started rather than half-shipped.

**22.10b — `notify_me()` is written but NOT YET RUN.** [20260913120000_notify_me.sql](supabase/migrations/20260913120000_notify_me.sql) must be executed in the Supabase SQL editor. Until it is, `notifyMe()` returns `unavailable` and the triggers stay popup-only — which is exactly the previous behaviour, so nothing is broken by the delay. **This is the first task (§29).**

**22.11 — `semester` is fetched everywhere and never used.** §15.

**22.12 — One pre-existing `tsc` error.**
`src/app/(tabs)/study.tsx(3290,11): error TS2322` — a handler typed `(nextHardCardIds?: string[]) => void` assigned where `(event: GestureResponderEvent) => void` is expected. **This is the baseline. Do not "fix" it incidentally** — it is the reference point for confirming you introduced no new errors.

**22.13 — `expo lint` baseline: 56 problems (19 errors, 37 warnings).** Mostly unused imports and `react-hooks/exhaustive-deps`. One warning (`'category' is defined but never used` in practice.tsx) will disappear when the held streak commit lands.

**22.14 — `README.md` is still the untouched create-expo-app boilerplate.**

**Also outstanding:** the Premium screen advertises plans that cannot be bought; `expo-screen-capture` protection is commented out; a test account `pwa-probe-…@gmail.com` needs deleting; `src/practiceStreak.ts` (on the held branch) duplicates `localDayKey` from `days.ts`.

---

## 23. RECENT FIXES ALREADY MADE

Most recent first.

| Commit | What it fixed |
|---|---|
| *(uncommitted at generation)* | **`notify_me()` migration + client writer** — in-app triggers can now write real notification rows, with dedupe and a double-fire guard. §16 |
| `c51c36e` | Build-dirty marker now names the paths it found in the build log |
| `d0c8fbb` | Untracked `supabase/.temp/cli-latest`, which had made `git status` permanently dirty and the build-id's `+` marker meaningless |
| `1a0d14f` | Rebuilt the weekly report as a real analytics page (donut, chart, tiles, week toggle); Profile skeleton replaces its spinner |
| `3f88250` | Weekly report reachable from Profile |
| `99f76e1` | Removed Profile's Performance bars (Practice Average silently mirrored Accuracy; Exam Average printed 0% for "no exams") |
| `b9b6fbb` | **Stopped treating an unreachable auth server as a signed-out user** — 28 `getUser()` calls → `session.ts`. §6 |
| `96865f7` | Study reminders (two windows) and the weekly report page |
| `e40dfc2` | Notification popup layer; first preference toggle that actually gates |
| `a281aed` | Dropped "Exam alerts", added "Activity & updates", skeletoned the load |
| `e868c6d` | Notification taps go somewhere real, or offer no button at all |
| `4c0a6d2` | **Stopped changes silently not reaching the browser** — build-id stamping, SW update detection |
| `d52d1b7` | Profiles lockdown drafted; stopped new functions being born open |
| `c69eed3` | **Closed four functions that shipped callable by `anon`**, two returning real data |
| `7956010` | Leaderboard: fixed every row reading "LASU Scholar" (a non-existent column made PostgREST reject the whole select with 42703); skeletons replaced the spinner |

**Held back, not on `master`:** branch `streak-hold` (`a4bf540`, "Congratulate a practice streak, derived from the sessions themselves"). It is waiting on a two-day real-usage test. When it lands it needs two edits: its `celebrateStreak()` still uses the old `getUser()` pattern and must move to `sessionUser()`, and `src/practiceStreak.ts` should fold its local `localDayKey` into [days.ts](src/days.ts).

---

## 24. FEATURES THAT MUST NOT BE BROKEN

These are **standing project constraints**, stated repeatedly by the project owner across the whole project. Treat them as hard requirements.

1. **Data fetching, business logic, auth and Supabase queries are frozen** unless the task is explicitly about them. This rule has not moved for the life of the project.
2. **Navigation structure and routing are frozen.** The *visual* nav chrome may change; the underlying routing and navigator state may not.
3. **What each screen functionally does must not change** as a side effect of a UI task.
4. **Mobile is proven and must not regress.** The bar is "guarantee mobile is unaffected", not "probably fine". The established technique: capture the rendered DOM at 390px before and after; any non-empty diff is a regression. This is why `SplitPane` and `useContentInset` return `null` below their breakpoint — `[styles.scroll, null]` flattens to exactly `styles.scroll`, so phone markup is *identical*, not merely equivalent.
5. **Any comparison or diff tool must self-test.** It must prove it can detect a known planted difference before its "no change" result is trusted. This project has repeatedly caught probes that reported success while silently comparing nothing.
6. **Default to content-matching skeletons, not spinners,** on every new or edited page.
7. **Never reintroduce `supabase.auth.getUser()`** in a render or redirect path. §6.
8. **Never let a popup carrying personal data sit over an auth screen.** Both `clearPopups()` triggers in `_layout.tsx` exist because a weekly report offer was once left over the login form.
9. **A failed query is not an empty result.** Do not let an error path silently mean "nothing to show".
10. **Do not run `20260911194500_profiles_read_lockdown.sql`** until the client stops reading other users' profile rows. §13.
11. **React Compiler rules are enforced.** No synchronous `setState` as the first act of an effect; prefer `useSyncExternalStore` for external stores.
12. **Line endings are mixed within single files** (`_layout.tsx` has LF in JSX and CRLF in styles). Match the surrounding lines; do not normalise a whole file.

---

## 25. THE MIGRATION FROM REACT NATIVE/EXPO TO A RESPONSIVE WEB PWA

**This migration is already complete.** The application is deployed and live as a PWA on Vercel today. If you were handed this project expecting to plan or perform that migration, that framing is out of date.

What was done:

- Expo's web target (`react-native-web`) produces the production bundle; `app.json` sets `web.output: "single"` (SPA)
- A real PWA manifest, installability, and an iOS fallback instruction banner
- A Workbox service worker precaching the app shell, with `NetworkOnly` for all Supabase traffic
- An update-available banner (`skipWaiting: false` — no mid-session takeover)
- Build-id stamping so a deploy can be verified in the browser
- Web-safe replacements for native APIs (§27)
- A desktop layout: sidebar navigation above 1024px, split panes on 7 screens

**The native app is frozen but still in the tree.** `Platform.OS === "web"` guards every desktop branch specifically so native can never enter a code path that has not been run there. iOS/Android builds are not being produced.

### What actually remains: the desktop experience

A design document for this exists outside the repo at
`C:\Users\HP\.claude\plans\before-we-start-any-glistening-treehouse.md`.

**Done:** `breakpoints.ts`, `SplitPane`, `SideNav`, `tabBarPosition: 'left'`, the `contentInset` conversion; split layouts on dashboard, study, profile, edit-profile, notifications, premium, settings.

**Not done:**
- Exam's question navigator is still a `<Modal>` — the plan is a persistent right rail above 1024px (same props, Modal wrapper dropped)
- Keyboard shortcuts during an exam (`1–4`, arrows, `F`, `Enter`), scoped to the active question only
- Exam/practice setup and results screens do not use the extra width
- `weekly-report.tsx` has no desktop adaptation at all
- `CourseRail` is still a horizontal scroll rail on desktop; the plan is a wrapped grid

**Deliberately unchanged:** the active question screen stays a narrow centred column at every width. Long question text across 1400px hurts comprehension, and a timed test is the one place where less chrome is the feature.

---

## 26. WHAT CAN BE REUSED

Essentially all of it — this is a working product, not a prototype.

- **Every screen, component and service** listed in §17
- **The design token system** (`tokens.ts`, `theme.ts`) — one source for spacing, type, radius, elevation, category colour
- **The layout primitives** — `SplitPane`, `useBreakpoint`, `useContentInset`: the pattern for adding responsive behaviour without touching the phone path
- **`session.ts`** — the correct auth-state reader
- **`days.ts`** — the correct local-timezone helpers (prefer these over the four duplicated UTC week helpers)
- **`theoryScore.ts`, `courses.ts`** — pure, testable, no dependencies
- **The skeleton system** — `SkeletonBar`/`SkeletonSlot` plus the shared sweep driver
- **The PWA layer** — `useServiceWorker`, `useInstallPrompt`, `buildId`, and both build scripts
- **The migrations** as the pattern for future DB work, especially the explicit `revoke ... from public, anon`

---

## 27. WHAT IS NATIVE-ONLY AND MUST BE REPLACED

Most of this has **already been handled**. Listed for awareness, not as a work queue.

| API | Status on web |
|---|---|
| `expo-haptics` | ✅ Wrapped in [ui/haptics.ts](src/ui/haptics.ts) — returns early when `Platform.OS === "web"` |
| `expo-file-system` | ⚠ **A no-op shim on web** — the whole module is `documentDirectory = null` with no methods. `readAsStringAsync` throws. The avatar path was rewritten to `fetch(uri).blob()` to avoid it. **Do not reintroduce it on a web path.** |
| `expo-image-picker` | ✅ Works on web, but returns a `blob:` URI with **no filename** — never sniff the extension from the URI; use `asset.mimeType` |
| `react-native-webview` | ✅ Replaced on web by [MaterialFrame.tsx](src/ui/MaterialFrame.tsx), a sandboxed `<iframe>` via `createElement` |
| `expo-sharing` | ⚠ Native share sheet; web falls back to download via [ui/share-file.ts](src/ui/share-file.ts) |
| `expo-print` | ⚠ Web uses [ui/print-html.ts](src/ui/print-html.ts) |
| `expo-screen-capture` | ❌ No web equivalent. **Currently commented out everywhere** ("enable when app is ready for production") |
| `AppState` | ⚠ Maps to visibility on web; used by `useScreenTime` |
| `KeyboardAvoidingView` | ⚠ `behavior={Platform.OS === "ios" ? "padding" : undefined}` — inert on web |
| `react-native-view-shot` | ✅ Works on web for the share card |
| Safe-area insets | ✅ `react-native-safe-area-context` resolves to zero on desktop |

**No CSS Grid, no CSS media queries.** react-native-web exposes neither through RN styles. All responsive behaviour is flexbox driven by JS breakpoints reading `useWindowDimensions`, which resolves **after hydration** rather than in CSS. Bear that in mind for any layout that must be correct on first paint.

---

## 28. RECOMMENDED ORDER OF WORK

Sequenced so that each step unblocks the next and nothing lands on an unverified foundation.

**Phase 1 — Close the security loop (highest value, lowest risk)**

1. Run the `pg_policies` audit across every table and collect the output. Nothing else in this phase is trustworthy without it.
2. Apply `20260911194300_default_privileges_functions.sql` and `20260911194400_profiles_write_lockdown.sql` (both safe today).
3. Switch `isUsernameTaken()` → `username_available()` RPC.
4. Switch the leaderboard → `leaderboard()` / `my_leaderboard_rank()` RPCs. *(Also fixes §22.5 scaling.)*
5. Only then apply `20260911194500_profiles_read_lockdown.sql`.

**Phase 2 — Correctness bugs users can see**

6. Session check on `/` and `/auth/login` (§22.1).
7. Signup duplicate-account detection (§22.3).
8. `daily_streak` — gate on real activity, or replace the displayed number with the recomputed one from `weeklyReport.ts` (§22.2).
9. Unify `week_start` on `days.ts` and remove the four UTC duplicates (§22.4). **Verify what already exists in the column before changing what is written to it.**

**Phase 3 — Structure (only after Phase 2 has settled)**

10. Extract the four-times-duplicated period-gated course query into one module (§15). The single highest-value refactor available, and the prerequisite for any future data layer.
11. Page-level skeletons for dashboard, exam, practice, edit-profile (§22.8).

**Phase 4 — Desktop completion**

12. Exam navigator as a persistent rail; exam keyboard shortcuts.
13. `weekly-report.tsx` desktop layout; `CourseRail` grid.

**Phase 5 — Features**

14. **Push notifications** — the four parts in §16. The client half is meaningless without the Edge Function sender, so do not ship a toggle until it can deliver. *(`notify_me()` itself is now built; it only needs running.)*
15. Land `streak-hold` with its two required edits (§23).
16. Weekly Report "this week / all time" toggle with honest empty states.
17. Premium purchases; AIA Tutorial; Past Questions.

---

## 29. EXACT NEXT STEPS

**Current stopping point**

`master` is at `c51c36e` on the remote. **The working tree carries uncommitted notification work** — the `notify_me()` migration, its client writer, and the two triggers rewired to use it (§16) — plus this document. `tsc` shows exactly 1 error (the known `study.tsx:3290` baseline) and `expo lint` shows 56 problems (19 errors, 37 warnings) — both are the reference baselines, not new breakage. One commit is deliberately held on branch `streak-hold` pending a two-day real-usage test.

No code is half-finished: `tsc`, `expo lint` and `npm run build:web` were all run against these changes and all sit at baseline. What is outstanding is the **SQL, which has not been executed** — so the new code is live-safe but inert until it is.

**First task to continue from**

> **1. Run [`20260913120000_notify_me.sql`](supabase/migrations/20260913120000_notify_me.sql) in the Supabase SQL editor.**
>
> Paste the whole file and run it. It is additive — one function, one index, no table or policy is altered. Until it runs, the three in-app triggers stay popup-only (their previous behaviour), so nothing is broken by waiting, but nothing new is gained either.
>
> Then verify it end to end: open the app during a study-reminder window (09:00–12:00 or 16:00–21:00) on a day with no activity, and confirm the nudge appears **both** as a popup **and** as a row in `/notifications` — and that reopening the app does **not** show the same popup twice.
>
> **2. Run the `pg_policies` audit across every table in the Supabase project and report the output.**

This is first because it is genuinely blocking and because four tables have already been found exposed to the `anon` role one at a time. Until the full policy list is known, any other database change is being made on an unverified foundation.

```sql
select schemaname, tablename, policyname, permissive, roles, cmd,
       qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Read the result with two things in mind: **permissive policies OR together**, so one policy with `qual: true` defeats every careful policy beside it; and check the `roles` column for `anon` or `public` on any table holding user data.

Once that output exists, proceed with Phase 1 of §28 in order.

---

## INSTRUCTIONS FOR THE NEXT AI CODING ASSISTANT

**Read this handover in full, and inspect the actual uploaded code, before you edit anything.** This document is accurate as of commit `c51c36e`, but the code is the source of truth. Open the files you are about to change and read them first. Where this document says **[NEEDS VERIFICATION]**, verify it — do not fill the gap with an assumption.

**Preserve existing functionality.** This is a live application with real students using it. Every screen listed in §21 works today. Your changes must leave all of them working.

**Avoid unnecessary rewrites.** The codebase is large (`study.tsx` alone is 4,368 lines) and heavily commented with the reasoning behind non-obvious decisions. When you find something surprising, read the comment above it before changing it — most of the odd-looking code is odd because of a specific bug it fixed. Rewriting a working screen because you would have structured it differently is not an improvement.

**Keep the current UI and business logic unless you are explicitly instructed otherwise.** The frozen constraints in §24 are not suggestions. In particular: data fetching, auth, Supabase queries, and routing structure are off-limits unless the task is about them.

**Make changes in small, testable stages.** One concern per change. Verify each stage before starting the next. Do not bundle a refactor into a bug fix.

**Provide complete replacement files when asked for them** — the whole file, not a fragment with "… rest unchanged …".

**Clearly list every file you changed** at the end of each piece of work, with a one-line description of what changed in each.

**Never expose Supabase secrets.** The anon key in [lib/supabase.ts](lib/supabase.ts) is public by design and protected by RLS — leave it as it is unless you are asked to move it to an environment variable. **Never** add a service-role key, database password, or any admin credential to this repository; there is no server-side code here that could use one safely. Do not print secret values into logs, commit messages or chat.

**Run or recommend the appropriate checks after every change:**

```bash
npx tsc --noEmit      # expect EXACTLY 1 error (study.tsx:3290). More = you broke something.
npx expo lint         # baseline: 56 problems (19 errors, 37 warnings)
npm run build:web     # must succeed
```

If you cannot run them, say so plainly and tell the user exactly what to run.

**Two habits this project expects, learned the hard way:**

1. **Measure, do not assert.** "Built and verified" once meant work that had never been pushed. Confirm a deploy actually reached the browser by reading the `build-id` meta tag, not by trusting that a push happened.
2. **Any tool you use to compare, diff or check something must prove it can detect a known difference first.** Plant a difference, confirm the tool sees it, then trust its "no change" result. Several probes in this project's history reported success while silently comparing nothing.

**When something cannot be confirmed, say so.** An honest "I could not reproduce this" is worth more here than a confident guess.
