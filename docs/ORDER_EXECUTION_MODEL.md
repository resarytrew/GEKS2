# Order execution model v0.4.1

Маршрутный шаг транзакционен: весь стек проверяется на общий исходный гекс,
ребро, бюджет, топливо и stacking до перемещения первой части. Источником
расчёта является `evaluateMovementStep`.

The normal game mode is a deterministic six-impulse WEGO day. Both sides create
hidden `PlannedOrder` records and pay command costs when committing their plans.
The engine then calls `executePlannedOrder` for every eligible order in priority
and stable ID order.

Implemented executors:

- `march`: route movement with the highest tempo, fatigue, terrain cost, fuel
  use, control changes, ZOC stops, and contact policy.
- `advance`: cautious route movement that creates a hasty attack on contact.
- `prepared_attack`: validates target proximity and ammunition, waits for named
  formations when requested, and creates a prepared combat contact.
- `defend`: builds defensive posture over three impulses and then completes.
- `delay`: maintains a level-two delaying posture and affects enemy tempo after
  combat; it remains active rather than completing without contact.
- `withdraw`: follows an explicit route with reduced organization loss.
- `reserve`: commits eligible formations to a detected friendly contact inside
  its radius and time window.
- `recover`: restores organization and fatigue according to supply and command.
- `prepare_demolition`: requires an engineer and two impulses on a shared bridge
  edge.
- `build_pontoon`: requires an engineer, two uninterrupted impulses, a river
  edge, and no usable permanent bridge.

Movement receives a fractional budget each impulse. The budget depends on
movement class, printed movement, order tempo, organization, supply, command,
night, terrain, roads, railways, rivers, ZOC and carry-over. Motorized and
tracked units pay fuel for every crossed edge and cannot move when fuel is
exhausted.

Orders can be delayed by command reliability, dependencies, route blockage,
fuel, engineering interruption, or combat. Status changes and their reasons
are emitted as events and appear in the execution panel and AAR.
