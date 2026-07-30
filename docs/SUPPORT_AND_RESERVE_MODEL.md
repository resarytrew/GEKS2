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

Active union намеренно не содержит `friendly_retreat`, `meeting_engagement` и
`objective_threatened`: authoritative реализации этих правил пока нет.
Migration удаляет такие legacy triggers с warning; если список опустел,
назначается безопасный fallback `friendly_contact`. UI использует
`SUPPORTED_RESERVE_TRIGGER_CONDITIONS` и не показывает будущие значения.
