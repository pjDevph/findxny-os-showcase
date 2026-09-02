# Branching, environments, and CI

## Branches

| Branch | Purpose | Deploys to |
|---|---|---|
| `development` | Active development. Day-to-day work merges here. | `findxny-web` Render service (dev tier, free plan) + the `findxny-dev` Supabase project. |
| `staging` | Pre-prod verification. Merge `development` → `staging` when a batch of work is ready to test against near-production data. | `findxny-web-staging` Render service + a separate Supabase project (see `render-staging.yaml`, one-time setup required). |
| `main` | Production. Merge `staging` → `main` once staging checks out. | Vercel (production web app) + the production Supabase project via `.github/workflows/supabase-deploy.yml`. |

**Note:** `render.yaml` used to deploy the live production web app from `Dev01` — that's been corrected as part of the prod/dev split: it now deploys `development` → the dev Supabase project, and Vercel is the real production FE. `render.yaml`'s `NEXT_PUBLIC_APP_ENV` was relabeled `development` to match. The Render dashboard's `sync:false` env vars (`NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY`) still need to be manually repointed to the dev Supabase project (`findxny-dev`) if they weren't already — Render doesn't pick those up from the repo.

## Promoting a change

```
feature work → PR into development → PR development → staging → PR staging → main
```

Every PR into `main`, `staging`, or `development` runs the CI checks below (`.github/workflows/ci.yml`).

## What runs where

**Locally, via Husky (`.husky/`):**
- `pre-commit` → `lint-staged` — runs ESLint (`--fix`) on staged `apps/web` files only. Fast, catches obvious issues before they're even committed.
- `pre-push` → `npm run verify` — lint + typecheck + test for `apps/web`, full run. This is what actually blocks a `git push` if something's broken.

**In CI (`.github/workflows/ci.yml`), on every PR:**
- `verify-web` — same `lint` / `typecheck` / `test` as the local pre-push hook, run in a clean environment. This is the required status check.
- `typecheck-pos-app` — runs `apps/pos-app`'s typecheck, but `continue-on-error: true`. **`apps/pos-app` currently has ~30 pre-existing TypeScript errors** unrelated to this cleanup; this job reports them without blocking merges. Once those are fixed, drop `continue-on-error` and add it to `npm run verify` (`package.json`'s `typecheck:pos-app` script already exists for this) so it becomes a real gate.

Edge functions deploy separately via `.github/workflows/supabase-deploy.yml` on push to `main` or `staging`, targeting different Supabase projects via branch-specific secrets (`SUPABASE_PROJECT_ID_PROD`/`_STAGING`, `SUPABASE_ACCESS_TOKEN_PROD`/`_STAGING` — set these under repo Settings → Secrets and variables → Actions).

## Environment variables per environment

Set `NEXT_PUBLIC_APP_ENV` (web) / `APP_ENV` (edge functions) to `development` | `staging` | `production` in each environment's own env file / dashboard. See `apps/web/.env.example` and `supabase/.env.example` for the full list per app.

## No direct pushes — enforced via collaborator permissions, not branch protection

GitHub's branch protection (classic) and Rulesets are both hard-gated behind GitHub Pro/Team for **private** repos — confirmed twice via API (`gh api .../branches/.../protection` → 404; `gh api .../rulesets` → 403 "Upgrade to GitHub Pro or make this repository public"). `FINDXNY` (the repo owner) is a plain user account, not an org, so there's no team-plan workaround either. Making the repo public isn't appropriate for a live business system, so branch protection is off the table until the plan is upgraded.

Instead, direct pushes are blocked at the **permission** level: `pjDevph`, `Mias-Devph`, and `shaepadilla` are **Read**-only collaborators (downgraded from Write). A read-only collaborator cannot push to any branch on this repo under any circumstance — the only path in is forking the repo, pushing to the fork, and opening a PR from the fork back into `development`/`staging`/`main`. This is a real, hard block, not a convention, and costs nothing.

**Contributor flow (read-only collaborators):**
```
fork FINDXNY/FINDXNY-OS → clone your fork → branch → push to your fork
  → open PR: your-fork:branch → FINDXNY/FINDXNY-OS:development
```
CI (`ci.yml`) runs automatically on PRs from forks too — `verify-web` needs no secrets, so it works unmodified.

**What this does NOT give you:** a required/blocking status check. GitHub won't refuse the merge button on a red CI run without paid branch protection — whoever has Write/Admin (currently just `FINDXNY`) has to manually confirm CI is green before merging. So the guarantee is "nobody can bypass the PR," not "bad code physically cannot merge."

**If/when the plan is upgraded**, apply real branch protection on top of this (belt and suspenders — also gives you the required-status-check + required-review enforcement this setup can't):

```json
{
  "required_status_checks": { "strict": true, "checks": [{ "context": "verify-web" }] },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 1 },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
```
via `gh api -X PUT repos/FINDXNY/FINDXNY-OS/branches/<branch>/protection --input -` for `main`, `staging`, and `development`. At that point collaborators can go back to Write with branch protection doing the enforcement instead of the permission downgrade.

## POS app (Expo/EAS): build profiles, app identity, and OTA updates

### Build profiles and app identity

`apps/pos-app/eas.json` has three build profiles, each mapped to its own `APP_VARIANT` in `app.config.ts` — every variant gets its **own app name and package/bundle id**, so installing one never overwrites another on the same device:

| Profile | `APP_VARIANT` | App name | Android package / iOS bundle id | Update channel |
|---|---|---|---|---|
| `development` | `development` | FINDXNY (Demo) | `com.findxny426.aiopos.demo` | `development` |
| `preview` | `preview` | FINDXNY (Preview) | `com.findxny426.aiopos.preview` | `preview` |
| `production` | *(unset)* | FINDXNY | `com.findxny426.aiopos` | `production` |

**This wasn't always true.** Until 2026-07-14, `preview` didn't set `APP_VARIANT` at all, so it silently shared production's exact name/package/signing key — installing a `preview` build on a device already running `production` replaced it in place instead of installing alongside it, with no warning from `adb install` (same signature, so Android just treats it as an update). Confirmed and fixed same day (see PR #42). If you ever see this regress, check `eas.json`'s `preview.env.APP_VARIANT` first.

### OTA updates (EAS Update) vs. native builds — what each can and can't do

- **OTA (`eas update`, or the `EAS Update (preview)` GitHub Action on push to `development`) ships JS/asset changes only.** It can never add, remove, or change compiled native code — new native modules, native module linking, Kotlin/Swift/Java changes, new permissions, anything in `android/`/`ios/`. Those always require a real `eas build` and a fresh install.
- A device only receives an OTA update if it's running a build whose **channel** and **runtime version** both match the update. `runtimeVersion` is tied to the app's `version` field (`policy: "appVersion"` in `app.config.ts`) — a device on an old version, or the wrong channel (e.g. a `production`-channel device when you only published to `preview`), will silently see nothing. That's expected isolation, not a bug — check `adb shell dumpsys package <id> | grep versionName` and which build profile produced it before assuming OTA is broken.
- **`EXPO_TOKEN` was missing from this repo's GitHub Actions secrets from when the `EAS Update (preview)` workflow was first added until 2026-07-14** — every merge to `development` silently failed at the `eas-cli update` step ("An Expo user account is required to proceed"). Fixed by generating a token at https://expo.dev/settings/access-tokens and `gh secret set EXPO_TOKEN --repo FINDXNY/FINDXNY-OS`. If OTA publishes start failing again, check `gh run list --workflow="EAS Update (preview)"` for this exact failure before assuming it's a code problem — the token may have been rotated/revoked.
- Merging a PR that touches `.github/workflows/**` via `gh pr merge` can fail with `refusing to allow an OAuth App to create or update workflow ... without workflow scope` — the `gh` CLI's cached token lacks the `workflow` OAuth scope. Fix with `gh auth refresh -s workflow`, or merge that one PR manually on github.com.

### Useful commands

```bash
# What's actually linked into a native build right now (don't trust the local android/
# folder — it's gitignored/stale; EAS cloud builds always run a fresh `expo prebuild`)
npx expo-modules-autolinking resolve -p android --json

# Resolve app identity for a given variant without building
APP_VARIANT=preview npx expo config --type public

# Recent OTA publishes on a channel, with the commit message that produced each
npx eas-cli update:list --branch preview --limit 5

# Re-run a failed OTA publish after fixing EXPO_TOKEN/etc., without a new merge
gh run rerun <run-id> --repo FINDXNY/FINDXNY-OS
```
