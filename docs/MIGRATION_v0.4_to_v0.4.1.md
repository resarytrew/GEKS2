# Migration v0.4 → v0.4.1

Версии повышены до `schemaVersion: 5`, `engineVersion: 0.4.1` и
`scenarioVersion: 0.4.1`.

Сохранение остаётся журналом команд. При загрузке v0.4 команды нормализуются и
воспроизводятся новым движком, поэтому созданные ими контакты сразу получают
side-specific роли. Устаревшие `loss_threshold` reactions удаляются с
предупреждением: их семантика перенесена в `order.lossTolerance`.

`loss_threshold` существует только в `LegacyReactionCondition` внутри
persistence boundary и отсутствует в active `ReactionCondition`. Повторная
миграция уже очищенного save не создаёт warning повторно и не изменяет
`lossTolerance` приказа.

Неоднозначная поддержка старого snapshot не угадывается: `normalizeContactState`
распределяет legacy IDs только по фактической стороне существующей части и
удаляет пересечения ролей. Неизвестные unit IDs не попадают в поддержку.
Повреждённый command log, отсутствующий seed и неподдерживаемый сценарий
возвращают `INVALID_SAVE`/`UNSUPPORTED_SCHEMA`.

Replay сохраняет исходный порядок оставшихся команд. Результат рассчитывается
правилами v0.4.1, что явно отражается в migration warning.

Legacy reserve triggers `friendly_retreat`, `meeting_engagement` и
`objective_threatened` удаляются с перечисляющим warning. Если после очистки
не осталось ни одного условия, используется `friendly_contact`; повторная
миграция идемпотентна.
