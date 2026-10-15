# Dependency security baseline remediation
Restore the required dependency audit gate in a separate reviewable work unit before merging the GetStock hotfix.
Delivery strategy: `ask-on-risk`; forecast: under 150 authored changed lines.

## Specs

1. **S1** — “dale autorizado continua”
2. **S2** — “dale haz el merge a main con el pr etc”
3. **S3** — “No desplegar a producción.”
4. **S4** — “No mezclar todavía el cambio de retries, propagación de trace ID ni cambios del ERP; dejarlos como seguimientos separados.”
5. **S5** — “ahora volvió a ocurrir otra vez, así que ya apliquemos el PR”
6. **S6** — “veamos si esto nos va a servir para el ML Picking Web”

## Tasks

- [x] **T1** — S1, S3-S4 — Inline: reproduce `pnpm audit --audit-level high`, apply the minimum dependency/tooling remediation, run focused dependency checks and the applicable suite. Commit: `2fdc84e`.
- [x] **T2** — S1, S3-S4 — Verify: independently review the high-risk dependency change and record verdicts for every spec. Commit: N/A.
- [ ] **T3** — S1-S3 — Delivery: publish a separate approved issue and PR for the dependency remediation, wait for required checks, and merge it without deploying manually. Commit: pending from T1.
- [ ] **T4** — S2-S5 — Delivery: refresh PR #18 after the baseline is green, wait for required checks, and merge the GetStock hotfix without mixing excluded follow-ups. Commit: `c0ee22f`.
- [x] **T5** — S6 — Explore: locate the external ML Picking repositories after explicit path authorization and map whether they consume FSC `GET /v1/stock/:sku`; propose a separate minimal adjustment only if repository evidence requires one. Commit: N/A.

## Log

- **L1** — “dale autorizado continua”
- **L2** — “dale haz el merge a main con el pr etc”
- **L3** — PR #18 is blocked by `deps-security-baseline`: 13 advisories total, including critical `proxy-addr` and high `brace-expansion`/`braces` findings unrelated to the GetStock diff.
- **L4** — RED: `pnpm audit --audit-level high` exited 1 with 13 findings (1 critical, 3 high). GREEN: it exited 0 with only 2 low and 6 moderate findings. Dependency policy, lockfile policy, TypeScript build, and corrected isolated suite passed (99/99). `tsx v4.23.15` runs; the dev-server smoke was unavailable because this macOS host lacks `timeout`.
- **L5** — “hola ... mira dejamoes el pr pendiente... acabo de revisar y ahora veo que si consultamos stock hacia falaballe y ajustamos ...https://erp.dyshopnow.cl/modules/falabella/picking/3257297307”
- **L6** — “Hola, creo que fue una intermitencia, no sé, pero mira, ahora volvió a ocurrir otra vez, así que ya apliquemos el PR y también veamos si esto nos va a servir para el ML Picking Web”
- **L7** — Production recurrence confirmed at 2026-10-15 19:49 UTC: repeated HTTP 502 responses from unchanged revision `dys-api-fsc-00066-fv2` for SKUs `1608012993` and `4229765558`. Screenshot `/Users/dyanez/Documents/captures/mlpickingweb.png` shows ML Picking reporting `Stock Falabella no disponible: failed to fetch falabella stock` for SKU `1608012993`.
- **L8** — Independent correction verification passed S1, S3, and S4: both frozen installs, pnpm/npm high-severity audits, dependency policies, build, deterministic 99/99 suite, and local `tsx watch` health smoke passed. The verifier's accidental untracked `health-response.json` was removed; the repository returned clean. Moderate advisories remain below the configured high-severity gate.
- **L9** — Authorized ML Picking exploration found no direct Seller Center signing in `ml-picking-web`. The path is `ml-picking-web` → `api-ml-order` → `dys-erp-bff` → `dys-api-fsc GET /v1/stock/:sku`. PR #18 fixes the failing read boundary used by the screenshot; no ML Picking code adjustment is indicated. Production recovery still requires the normal FSC deployment after merge and end-to-end verification; retries, trace propagation, and ERP changes remain separate follow-ups.
