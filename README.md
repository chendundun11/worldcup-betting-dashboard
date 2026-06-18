# World Cup Betting Dashboard

World Cup Betting Dashboard is a local React/Vite dashboard for pre-match football analysis. It has a public-facing match view and an internal V5 simulation workspace.

This project is for data review and entertainment reference only. It does not provide guaranteed outcomes, financial advice, or betting instructions.

## Main Entrypoints

- Public dashboard: `http://127.0.0.1:5177/`
- Internal V5 workspace: `http://127.0.0.1:5177/#internal-v4`
- Codex design workbench: `http://127.0.0.1:5177/codex-workbench.html`

## Current Engine

- `quant-score-v1` builds structured score candidates from expected goals, strength gap, odds shape, game type, risk, and over/under pressure.
- Public score output is exposed through a sanitized `publicScoreModel`; it must not include bankroll, stake, ledger, profit, or internal settlement fields.
- Strong-favorite paths can surface 4+ goal tail protection, shown on the public high-goal radar near the top of the page.
- Internal V5 uses the same quant score model, then layers staking simulation, odds overrides, settlement review, and ledger export/import.

## Commands

```bash
npm install
npm run dev
npm run local:api
npm run build
npm run lint
npm run check:quality
```

For local development, run `npm run dev` and `npm run local:api` in parallel. Vite proxies `/api` to `http://localhost:3001`; without the local API server, the app falls back to mock data but the browser console will show proxy failures.

Focused checks:

```bash
npm run check:quant
npm run check:internal
npm run check:regression
npm run check:api
npm run check:browser
npm run check:visual
npm run capture:visual
node scripts/check-copy-guard.mjs
npm audit
```

Verbose debugging:

```bash
CHECK_BET_ENGINE_VERBOSE=1 node scripts/check-bet-engine.mjs
CHECK_SNAPSHOT_VERBOSE=1 node scripts/check-snapshot-payload.mjs
CHECK_DB_VERBOSE=1 node scripts/check-db-migration.mjs
CHECK_API_VERBOSE=1 node scripts/check-snapshot-api-behavior.mjs
```

PowerShell equivalent:

```powershell
$env:CHECK_BET_ENGINE_VERBOSE='1'; node scripts/check-bet-engine.mjs
```

## Quality Gates

`npm run check:quality` currently covers:

- ESLint and production build.
- Public quant UI, public score wording, bundle splitting, and 4+ tail-score coverage.
- Internal V4/V5 engine, UI contract, staking, settlement, providers, and plan scope.
- Historical settlement display, manual lineups, V3 compatibility, onboarding, posters, share text, AI payloads, snapshot payloads, snapshot row mapping, snapshot API behavior, and DB migration safety.

Some scripts are intentionally not part of `check:quality` because they are change-scope guards and can fail when unrelated files are modified:

- `scripts/check-internal-v4-ui-guard.mjs`
- `scripts/check-odds-merge.mjs`
- `scripts/check-match-odds-integration.mjs`
- `scripts/check-match-team-form-integration.mjs`
- `scripts/check-odds-api.mjs`
- `scripts/check-team-form-api.mjs`

Run those from a clean worktree when working specifically on that area.

`scripts/check-copy-guard.mjs` is part of `npm run check:quality`; it blocks legacy user-facing score wording from returning outside dedicated guard scripts.

`npm run check:browser` is also intentionally separate because it requires a running dev or preview server. By default it checks `http://127.0.0.1:5177/`; override with `DASHBOARD_URL` when needed. It includes the interaction smoke test and the Public V5 visual guard.

`npm run capture:visual` saves local Public V5 screenshots under `.codex/visual-audits/public-v5/` for manual review.

Production preview smoke:

```bash
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
DASHBOARD_URL=http://127.0.0.1:4173/ npm run check:browser
```

## Safety Notes

- Public copy should use `候选比分` / `备选比分`, not old score wording.
- Internal V5 score-stake labels should use `候选波胆` / `保护波胆`.
- Public pages should not expose internal money or ledger language.
- Exact score candidates are scenario paths, not promises or guarantees.
