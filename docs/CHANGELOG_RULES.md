# Правила журнала изменений

## v0.4

- Ten planned-order types now have concrete executors.
- Movement depends on terrain, roads, class, readiness, command, supply, fuel
  and time of day.
- Meeting engagements and prepared attacks resolve through shared combat rules.
- Losses distribute across formations; ammunition, retreat and advance mutate
  authoritative state.
- Conditional reactions, active reserves, temporary HQ initiative, engineer
  work and explainable supply are implemented.
- Six impulses end in an AAR and a one-command transition to the next day.
- Saves migrate to schema 4 with explicit warnings.

Версия использует `MAJOR.MINOR.PATCH`.

- `MAJOR`: несовместимая схема сохранения или принципиально новая модель.
- `MINOR`: новые правила, команды, фазы или сценарные возможности с
  миграцией.
- `PATCH`: исправления, не меняющие ожидаемую модель сохранения.

Каждая запись должна отдельно перечислять:

- engine/rules;
- scenario/OOB/history;
- UI/renderer;
- persistence/API;
- tests and verification;
- migration/compatibility.

Изменение исторической уверенности содержит `sourceId`, старую и новую
метку и основание. Балансировочное изменение не маскируется как
«историческое исправление». Изменение формулы требует теста на старый
дефект и, если меняется replay, повышения `engineVersion`.

## v0.3.0

- Добавлено двустороннее WEGO-планирование, импульсы, контакты и реакции.
- CP и карты сделаны транзакционными; общие рёбра и мосты симметричны.
- HQ стали сущностями карты; исправлена базовая принадлежность 3-го и
  12-го механизированных корпусов.
- Переработаны бой, контроль гекса, снабжение, окружение и scoring.
- Добавлены версии, idempotency, миграция сохранений и development API.
- Добавлен машиночитаемый исторический реестр и уровни уверенности.
