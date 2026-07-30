# Final hardening v0.4.1

Дата baseline: 2026-07-30.

## Исходное состояние этапа

- Репозиторий: `https://github.com/resarytrew/GEKS2`
- Ветка: `codex/wego-correctness-v041`
- SHA: `53387f5d748297571b546667b37a7739797aadfc`
- Node.js: `v24.16.0`
- npm: `11.13.0`
- PR: [#2](https://github.com/resarytrew/GEKS2/pull/2), draft,
  `MERGEABLE` / `CLEAN`, предыдущие GitHub Actions успешны.

## Чистый baseline

Перед проверкой каталог `node_modules` был удалён, затем зависимости
восстановлены командой `npm ci`.

| Проверка | Результат |
| --- | --- |
| `npm ci` | успешно, 421 пакет |
| `npm run typecheck` | успешно |
| `npm run lint` | успешно |
| `npm run test:v041` | успешно: 3 файла, 46 тестов |
| `npm test -- --run` | успешно: 12 файлов, 228 тестов |
| `npm run build` | успешно |

## Оставшиеся проблемы до hardening

- `loss_threshold` остаётся частью активного `ReactionCondition`.
- Тип резерва обещает три неподдерживаемых trigger conditions.
- Последний из шести импульсов местами задан числом `5`.
- Запасной маршрут не имеет единой полной проверки перед применением.
- Acceptance coverage не содержит отдельного reactions/persistence flow.
- Не все пути создания контактов используют единый side-specific factory.
- Инварианты не полностью проверяют стороны ролей и ссылки support usage.
- Требуются дополнительные проверки CP stacking и границ AAR.
- Нет воспроизводимого production smoke script.
- 13 уязвимостей зависимостей не классифицированы по production/dev риску.

## Реализованное hardening

- Active `ReactionCondition` больше не содержит `loss_threshold`; legacy type
  существует только внутри persistence boundary.
- Active reserve triggers сокращены до `friendly_contact` и
  `enemy_breakthrough`; другие значения мигрируются с warning и безопасным
  fallback.
- `EXECUTION_IMPULSES` задаёт labels, count, last и night semantics.
- `validateFallbackRoute` проверяет весь маршрут до мутации и повторно при
  срабатывании реакции.
- Новые контакты создаются через `createSideSpecificContact`; инварианты
  проверяют стороны, роли и ссылки support usage.
- Добавлены Flow A movement/combat и Flow B reactions/persistence.
- Добавлен CI-compatible `npm run smoke:production`.
- Dependency audit отделяет чистый production tree от 13 dev-only findings.

## Локальная проверка после реализации

| Проверка | Результат |
| --- | --- |
| `npm run typecheck` | успешно |
| `npm run lint` | успешно |
| `npm run test:v041` | 5 файлов, 84 теста |
| `npm test -- --run` | 14 файлов, 266 тестов |
| `npm run build` | успешно |
| `npm run smoke:production` | `/`, `/play`, `/api/health`: HTTP 200 |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `npm audit` | 13 dev-only findings |

Implementation SHA: `2d22bf3f31801d7183928827aa9bf69144cf3c0f`.

GitHub Actions:

- [push run 30510099735](https://github.com/resarytrew/GEKS2/actions/runs/30510099735);
- [PR merge-commit run 30510101995](https://github.com/resarytrew/GEKS2/actions/runs/30510101995) —
  все шаги, включая production smoke, успешны.
