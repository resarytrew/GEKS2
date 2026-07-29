# Verification v0.4.1

Обязательные команды:

```powershell
npm ci
npm run typecheck
npm run lint
npm run test:v041
npm test -- --run
npm run build
```

Regression suite содержит 46 пронумерованных тестов в трёх `v041-*` файлах.
Полный acceptance day запускается через `runWegoV041AcceptanceDay` и включает
planning обеих сторон, commit, шесть импульсов, meeting combat, side-specific
support, heavy armor, HQ/engineer/bridge fixture, AAR и deterministic replay.

Локальный итоговый прогон:

- v0.4.1 regression suite: 3 файла, 46/46 тестов, 6,48 с;
- полный suite: 12 файлов, 228/228 тестов, 13,53 с;
- acceptance day seed 77: 928 мс, 106 событий, 5 контактов,
  5 combat resolutions;
- TypeScript, ESLint и production build: успешно.

CI URL фиксируется после публикации ветки.
