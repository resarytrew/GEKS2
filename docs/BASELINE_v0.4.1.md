# Baseline v0.4.1

Дата проверки: 2026-07-30.

## Исходная ревизия

- Репозиторий: `https://github.com/resarytrew/GEKS2`
- Ветка-источник: `origin/main`
- Commit: `4e6d0caa202d0946f8465c9d009ee053cd2bc207`
- Node.js: `v24.16.0`
- npm: `11.13.0`

## Результаты обязательных проверок

| Проверка | Результат |
| --- | --- |
| `npm ci` | успешно; установлено 421 package |
| `npm run typecheck` | успешно |
| `npm run lint` | успешно |
| `npm test -- --run` | успешно: 9 test files, 182 tests |
| `npm run build` | успешно; маршруты `/`, `/play` и API собраны |

`npm audit` сообщает о 13 известных проблемах сторонних зависимостей
(4 moderate, 9 high). Принудительное обновление с breaking changes не входит в
correctness patch.

## Подтверждённые дефекты v0.4

- `ContactState` хранит обе стороны в `entityIds`, а поддержку и резерв — в
  общих `supportIds`/`reserveIds`. `resolveContact` затем объединяет поддержку и
  резерв, поэтому строгой принадлежности ролей стороне нет.
- Meeting engagement строится из `nextMovementIntent` до проверки бюджета,
  топлива, ребра, моста и stacking.
- Route validation сравнивает начало маршрута только с первой частью приказа;
  исполнитель также выравнивает прогресс по ведущей части.
- Reserve executor не применяет `triggerConditions`, добавляет резерв и в
  `reserveIds`, и в `entityIds`, а `indexOf() === -1` поднимает
  неприоритетные цели выше приоритетных.
- Support validation проверяет только существование, сторону и уничтожение; нет
  единого контроля дальности, боеприпасов и использования в импульсе.
- Loss tolerance и `loss_threshold` одновременно участвуют в остановке приказа.
- `temp_initiative` начисляет CP при применении карты, но planning обновляет HQ
  без единого расчёта активных временных эффектов.
- AAR формирует `damagedUnits` из всех соединений неполного состава, а не из
  событий потерь текущих суток.

## Предполагаемый объём изменений

- `src/engine/types.ts`
- `src/engine/wego.ts`
- `src/engine/order-execution.ts`
- `src/engine/wego-combat.ts`
- `src/engine/combat.ts`
- `src/engine/invariants.ts`
- `src/engine/after-action.ts`
- `src/engine/persistence.ts`
- `src/engine/engine.ts`
- `src/engine/rules.ts`
- `src/engine/index.ts`
- `src/engine/__tests__/v041-*.test.ts`
- `src/scenarios/baltic-1941/scenario.ts`
- `src/scenarios/baltic-1941/wego-v041-acceptance.ts`
- `src/store/gameStore.ts`
- `src/components/OrderPlanningPanel.tsx`
- `src/components/ExecutionPanel.tsx`
- `src/components/Modals.tsx`
- `README.md` и перечисленные документы v0.4/v0.4.1.
