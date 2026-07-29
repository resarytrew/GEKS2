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
