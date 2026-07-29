# Support and reserve model v0.4.1

`getEligibleSupportUnits(state, side, targetHexId, supportType, impulse)` —
единственный selector поддержки. Он проверяет сторону, существование, тип,
дальность, боеприпасы, command/supply state, активный приказ и журнал
`supportUsage`.

Дальность: artillery — 2 гекса, heavy AT — 1, air — без географического
ограничения. Одна часть используется один раз за импульс, кроме явного trait
`multiple_support`. Боеприпасы расходуются только после фактического включения
в `CombatModel`.

Резерв поддерживает `friendly_contact` и `enemy_breakthrough`. Обычный контакт
не считается прорывом. Сортировка: `targetPriority`, расстояние, опасность,
стабильный `contact.id`. После ввода резерв становится participant одной
стороны. После окна создаётся `RESERVE_NOT_COMMITTED`, приказ завершается.
