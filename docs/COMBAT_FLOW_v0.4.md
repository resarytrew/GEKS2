# Combat flow v0.4

Correctness patch не меняет CRT. `CombatModifier.applied` означает, что
модификатор уже включён в strength/ratio и UI не должен применять его повторно.
`sourceUnitIds` указывает источник. `expectedRange` является оценочным
presentation-диапазоном, а не вероятностью результата.

1. Create a contact from a prepared attack, a route blockage, or simultaneous
   movement.
2. Determine attacker and defender, including committed reserves and support.
3. Build strengths once through `buildCombatModel`.
4. Draw one seeded d6 value and resolve it through `resolveCombatCell`.
5. Apply the heavy-armor penetration cap when relevant.
6. Distribute step losses; remove eliminated formations from stacks.
7. Spend ammunition.
8. Search and execute every required retreat.
9. Apply disruption, delay, loss-threshold reactions and order status changes.
10. Advance an eligible formation, spend its fuel, and change control.
11. Resolve exposed headquarters and recompute supply and command.
12. Store the resolution and append contact/combat events.

The legacy debug command uses the same CRT function. The regular WEGO path is
the authoritative gameplay flow.
