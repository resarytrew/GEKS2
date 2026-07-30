# Contact resolution model v0.4.1

`ContactState` хранит отдельные participant/support/reserve arrays для attacker
и defender. Один unit не может занимать две роли; сторона поддержки проверяется
инвариантами после каждой команды.

Все новые пути — meeting engagement, вход в занятый гекс, prepared/hasty
attack, blocked route и reserve commitment — используют side-specific поля.
`createSideSpecificContact` создаёт новые контакты; legacy aliases не являются
authoritative источником боевой логики.

A contact is a real unresolved game object, not a UI marker. Route collision,
enemy occupation, a prepared attack, or simultaneous entry creates a
`ContactState`. Every ready contact is resolved during the same impulse.

Meeting engagements select the acting attacker deterministically from formation
quality, organization, order tempo, HQ initiative and the scenario initiative
side. Prepared and hasty attacks keep their declared attacker.

All contacts call the shared `buildCombatModel` and the single canonical CRT in
`rules.ts`. There is no WEGO-only combat table. The model accounts for terrain,
posture, order type, support, supply, command, ammunition and heavy armor.

Losses are allocated deterministically across eligible combat formations.
Headquarters are never used as ordinary step-loss recipients. Combat consumes
ammunition from attackers, defenders and support. A retreat uses an explicit
fallback when valid, otherwise a multi-hex search that rejects enemy occupancy,
enemy ZOC, water and illegal stacking. A failed retreat causes an additional
step loss.

Successful results can advance an eligible attacker into the vacated hex,
consume fuel and change control. An unfavorable result delays the attacking
route; a prepared attack becomes terminal after its actual combat. Each contact
stores a `CombatResolution`, links it by `resolutionId`, and emits combat,
retreat, advance, ammunition and control events.

Инварианты проверяют наличие и различие сторон, принадлежность participant,
support и reserve своей стороне, отсутствие role overlap, а также корректные
ссылки `supportUsage` на существующие unit и contact.
