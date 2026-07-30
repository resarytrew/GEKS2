# Validated movement intents

Поток исполнения:

```text
PlannedOrder
→ evaluateMovementStep
→ ValidatedMovementIntent
→ conflict detection
→ bridge reaction
→ movement/contact resolution
```

`evaluateMovementStep` проверяет общий исходный гекс группы, смежность,
проходимость ребра, мост, accumulated movement budget, индивидуальное топливо и
stacking. Он возвращает стоимость, fuel map, `canEnter`, `stopAfterEntry` и
точную blocking reason.

Meeting engagement сравнивает только intents с `canEnter: true`. Исполнитель
повторяет тот же расчёт перед транзакционным перемещением всего стека. Если
проверку не проходит одна часть, позиции и ресурсы всей группы не меняются.

Bridge demolition получает только уже валидированный crossing intent. После
изменения состояния моста связанный запасной маршрут проверяется заново:
origin группы, гексы, смежность и текущее состояние рёбер. Невалидный fallback
порождает `REACTION_FAILED` и не применяется частично.
