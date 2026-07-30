# Baltic Front 1941 — v0.4.1 WEGO Correctness Patch

Детерминированный оперативный варгейм-прототип о первых днях боёв в
Прибалтике летом 1941 года. Основной режим — локальный hotseat с одновременным
планированием приказов обеих сторон и поимпульсным исполнением.

Проект сознательно разделяет исторические источники и игровые реконструкции.
География — реконструкция, а не точная архивная карта. Точные координаты
частей, характеристики, стоимость приказов и эффекты карточек являются
элементами модели, если явно не указано иное.

## Локальный запуск

Требуются Node.js 20+ и npm.

```powershell
npm install
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000). Для проверки
production-сборки:

```powershell
npm run build
npm run smoke:production
```

Smoke script временно запускает production server на `127.0.0.1:3100`,
проверяет `/`, `/play`, `/api/health` и обязательно завершает процесс. Это
локальная и CI-проверка; production deployment этим не создаётся.

PostgreSQL для одиночной локальной партии не нужен: сохранения записываются в
`localStorage` браузера и проходят ту же миграцию/replay. `DATABASE_URL`
требуется только для дополнительного серверного хранения матчей.

## Контроль качества

```powershell
npm run typecheck
npm run lint
npm run test:v041
npm test -- --run
npm run build
npm run smoke:production
```

Тесты покрывают транзакционное списание командных очков, общий статус рёбер,
правила мостов, бой, очки, HQ, командную цепочку, снабжение, окружение,
двустороннее планирование, скрытие приказов, импульсы, реакции,
детерминированный replay, idempotency и миграцию сохранений.

## Как играть

1. Германская сторона планирует маршруты и фиксирует план.
2. Экран передачи хода скрывает её приказы.
3. Советская сторона планирует и фиксирует свой план.
4. Исполнение идёт синхронными импульсами; встречные контакты и реакции
   разрешаются по детерминированным правилам.
5. После снабжения и завершения суток обновляются цели и очки.

Старый последовательный цикл сохранён только как режим `legacy_debug`.

## Архитектура и правила

- [Архитектура](docs/ARCHITECTURE.md)
- [Правила ядра](docs/GAME_RULES_CORE.md)
- [Модель WEGO](docs/WEGO_EXECUTION_MODEL.md)
- [Историко-редакционная хартия](docs/HISTORICAL_EDITORIAL_CHARTER.md)
- [Реестр источников](docs/SOURCE_REGISTRY.md)
- [Политика уверенности данных](docs/DATA_CONFIDENCE_POLICY.md)
- [Миграция v0.2 → v0.3](docs/MIGRATION_v0.2_to_v0.3.md)
- [Известные ограничения](docs/KNOWN_LIMITATIONS.md)

## Development API

`POST /api/engine/command` — локальный авторитетный адаптер. Он принимает
сохранение/журнал команд и одну команду с обязательными `commandId` и
`expectedVersion`. Сторона должна совпадать с заголовком `x-match-side`.
Переданные клиентом результаты, события, счёт или готовое состояние
отклоняются. В production маршрут требует `LOCAL_MATCH_TOKEN` и заголовок
`x-local-match-token`; полноценным multiplayer-сервером этот адаптер не
является.

Версии сохранения: `schemaVersion: 5`, `engineVersion: 0.4.1`,
`scenarioVersion: 0.4.1`. В v0.4.1 контакты разделены по сторонам,
движение проходит через validated intents, а поддержка и резервы учитываются
строго один раз.
Активно поддерживаются только reserve triggers `friendly_contact` и
`enemy_breakthrough`; остальные legacy-значения удаляются миграцией.

## Документация v0.4

- [Исполнение приказов](docs/ORDER_EXECUTION_MODEL.md)
- [Разрешение контактов](docs/CONTACT_RESOLUTION_MODEL.md)
- [Поток боя](docs/COMBAT_FLOW_v0.4.md)
- [After Action Report](docs/AFTER_ACTION_REPORT.md)
- [Миграция v0.3 → v0.4](docs/MIGRATION_v0.3_to_v0.4.md)
- [Проверка v0.4](docs/VERIFICATION_v0.4.md)
- [Final hardening v0.4.1](docs/FINAL_HARDENING_v0.4.1.md)
- [Dependency audit v0.4.1](docs/DEPENDENCY_AUDIT_v0.4.1.md)
