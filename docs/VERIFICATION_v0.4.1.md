# Verification v0.4.1

Обязательные команды:

```powershell
npm ci
npm run typecheck
npm run lint
npm run test:v041
npm test -- --run
npm run build
npm run smoke:production
```

Final regression suite содержит 84 теста в пяти `v041-*` файлах: исходные 46,
28 hardening contracts и 10 full acceptance checks.

Flow A выполняет planning/commit обеих сторон, configured impulse count,
validated meeting engagement, side-specific support, расход боеприпасов, AAR и
переход к следующему planning turn.

Flow B проверяет validated bridge demolition, атомарный fallback, единственное
введение резерва, HQ capture/advance, future CP, завершение дня, save,
restore и deterministic replay hash.

Локальный итоговый прогон:

- v0.4.1 suite: 5 файлов, 84/84 теста, 8,48 с;
- полный suite: 14 файлов, 266/266 тестов, 16,80 с;
- TypeScript, ESLint и production build: успешно;
- production smoke: `/`, `/play`, `/api/health` — HTTP 200,
  `engine=ready`, `persistence=local_only`; процесс завершён;
- `npm audit --omit=dev`: 0 vulnerabilities.

GitHub Actions для implementation commit `accd8ef`:

- [push run 30486867974](https://github.com/resarytrew/GEKS2/actions/runs/30486867974) —
  успешно;
- [pull request run 30486906594](https://github.com/resarytrew/GEKS2/actions/runs/30486906594) —
  успешно.

Final hardening:

- [push run 30510099735](https://github.com/resarytrew/GEKS2/actions/runs/30510099735);
- [PR merge-commit run 30510101995](https://github.com/resarytrew/GEKS2/actions/runs/30510101995) —
  весь pipeline, включая production smoke, успешен.
