# UI v1 pre-PR hardening baseline — WEGO v0.4.1

- **UI branch before integration:** `a1394c3dcccaa7bf608c0773298eaad56d3579de`
- **Integrated main:** `ec675cc7e5b9d1858ef361efd8ee059884404501`
- **Integration method:** merge of `origin/main` into the fixed Arena branch `arena/019faf17-geks2`; a separate branch cannot be created by this session.
- **Merge base before v0.4.1:** `4e6d0caa202d0946f8465c9d009ee053cd2bc207`
- **Version tuple after merge:** engine `0.4.1`, schema `5`, scenario `0.4.1`.
- **Runtime:** Node `v22.22.3`, npm `10.9.8`.

## Merge resolution

| File | Resolution |
|---|---|
| `OrderPlanningPanel.tsx` | v0.4.1 domain imports, support selector, reserve config and no textual fallback route; UI shell is subsequently restyled in follow-up work. |
| `ExecutionPanel.tsx` | v0.4.1 presentation labels and impulse constants; UI corrected to enumerate active-side orders only. |
| package metadata / lockfile | v0.4.1 versions/scripts/lockfile retained from `main`. |
| engine, migration, persistence, types, correctness tests | retained from `main` without UI rollback. |
| UI shell / renderer / rail / sheet | retained from UI branch, then compiled against v0.4.1 types. |

## Verification after merge

| Check | Result |
|---|---|
| `npm run typecheck` | passed |
| `npm run lint` | passed |
| `npm test -- --run` | passed: 18 files, 275 tests |
| `npm run build` | passed |

The current v0.4.1 package scripts also provide `test:v041` and `smoke:production`; both are required before a draft UI PR is opened.
