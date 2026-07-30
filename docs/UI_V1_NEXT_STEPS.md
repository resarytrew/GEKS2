# Baltic Front 1941 — план дальнейших улучшений UI v1.0

**Статус:** план после интеграции WEGO v0.4  
**Текущий ориентир:** `arena/019faf17-geks2` после интеграции UI v1.0 с v0.4.

## Цель следующей серии работ

Довести «Оперативную карту, 1941» от интегрированной визуальной оболочки до проверяемого игрового интерфейса: с ясным WEGO-циклом, доступным управлением на desktop/tablet/mobile, наблюдаемым Canvas renderer и детерминированной браузерной приёмкой.

Принцип: **сначала чистые presentation selectors, тесты и доступность; затем сложные renderer-изменения; только после этого — новый renderer abstraction.** Игровые расчёты остаются в engine.

---

## Этап A — стабилизация UI-контрактов и компонентные тесты

**Приоритет: P0**

### Работы

1. Добавить отдельный presentation selector для главного фазового действия:
   - `getPrimaryPhaseAction(state)`;
   - единая подпись, команда, disabled-state и причина;
   - убрать оставшееся дублирование phase-переходов из UI-компонентов.
2. Выделить `OperationalSheet` tabs в небольшой контролируемый компонент или hook:
   - сохранение выбранной вкладки в пределах открытого листа;
   - автоматическое предложение вкладки «Обстановка» при execution без принудительного переключения;
   - не сбрасывать вкладку при сворачивании desktop-листа.
3. Добавить DOM/component test infrastructure только при необходимости:
   - React Testing Library + jsdom;
   - тесты ToolRail, OperationalSheet, вкладок, карты приказов и keyboard navigation.
4. Ввести общие `data-testid` лишь для критических интерактивных областей, не для декоративной разметки.

### Acceptance

- Состояния tabs, collapse и phase action покрыты тестами.
- `Esc` закрывает sheet/modal до очистки карты.
- Все icon-only controls имеют accessible name.
- Нет новой логики правил во frontend.

---

## Этап B — планировщик и исполнение WEGO

**Приоритет: P0**

### Работы

1. Полностью привести `OrderPlanningPanel` к стилю оперативного листа:
   - убрать оставшиеся тёмные web-form поверхности;
   - укрупнить текст и touch-targets;
   - визуально отделить обязательные поля от дополнительных;
   - показывать выбранные части названиями и краткими каунтерами.
2. Перенести технические свободные поля гексов и частей на карту/списки, где это позволяет engine:
   - цель выбирается картой;
   - dependent/support units выбираются списком названий;
   - edge bridge остаётся направлением, а не числом.
3. Развить `ExecutionPanel`:
   - показывать authoritative `impulseReports`;
   - локализовать события, контакты и статусы;
   - вывести фактические delayed/failed orders;
   - не синтезировать время, причины и модификаторы.
4. Интегрировать настоящий `DailyAfterActionReport` в штабной лист:
   - отдельные вкладки/секции AAR;
   - только engine-provided contacts, fights, supply, orders, bridges, control and score data;
   - переход к следующему дню из одного primary action.

### Acceptance

- Все десять исполняемых типов приказа остаются доступны в planner.
- Execution использует `IMPULSE_LABELS.length`, а не literal.
- AAR не пересчитывается в React и не раскрывает hidden information.
- Raseiniai WEGO fixture проходит планирование → 6 импульсов → AAR → next day.

---

## Этап C — Canvas: слои, маршруты и карта

**Приоритет: P1**

### Работы

1. Разделить отрисовку на явные функции/слои:
   - static geography;
   - operational overlay;
   - entities;
   - interaction overlay.
2. Вынести committed order routes из static geography cache:
   - обновлять при изменении плана без рендеринга terrain;
   - сохранять скрытие планов другой стороны.
3. Доработать `orderRouteStyle`:
   - стрелочные наконечники только для реальных route/target данных;
   - оборонительные, резервные и инженерные знаки только когда соответствующие поля существуют;
   - delayed/failed/completed patterns.
4. Реки:
   - сначала добавить чистый normalizer уникальных речных граней и unit tests;
   - затем строить связные сегменты только при сохранении дискретной реконструктивной географии;
   - мосты должны отрисовываться поверх речного сегмента.
5. Честный viewport work:
   - вариант 1: кэшировать результат `filterVisibleHexIds` между static и dynamic pass;
   - вариант 2: перейти на axial viewport bounds / spatial index;
   - измерить до и после на полной карте.
6. Добавить DOM/Canvas legend: «Игровая географическая реконструкция» и активные слои без декоративных floating cards.

### Acceptance

- committed routes всегда поверх terrain;
- opponent routes отсутствуют;
- один shared river edge не рисуется дважды;
- максимум 3 каунтера в стеке;
- HQ и supply states различимы формой;
- документация не заявляет culling, если существует full-map scan.

---

## Этап D — responsive и accessibility

**Приоритет: P1**

### Работы

1. Завершить mobile contextual sheet:
   - явная кнопка collapse из peek;
   - focus trap для full-screen состояния;
   - безопасное закрытие по `Esc`;
   - full-screen orders/card/log sheets;
   - touch targets не менее 44×44 px.
2. Tablet landscape:
   - проверить 1024×768 и 1280×720;
   - определить минимальную ширину раскрытого листа;
   - обеспечить читаемую фазовую ленту без горизонтальной перегрузки.
3. Контраст и масштаб:
   - automated contrast review ключевых paper/rail/text комбинаций;
   - проверить 125% и 200% browser zoom;
   - добавить high-contrast stylesheet только после проверки реальной необходимости.
4. Keyboard:
   - `M`, `L`, `O`, `S`, `F`, `Esc`;
   - `F` реализовать только вместе с безопасным camera-centering API;
   - не перехватывать ввод, browser shortcuts и contenteditable.

### Acceptance

- mobile не повторяет desktop sidebar;
- все критические действия доступны с клавиатуры;
- reduced motion не содержит постоянной анимации;
- состояние не передаётся только цветом.

---

## Этап E — browser acceptance и screenshots

**Приоритет: P1**

### Работы

1. Добавить Playwright с dev-server lifecycle.
2. Создать детерминированный browser fixture на Raseiniai WEGO Test.
3. Добавить acceptance flow:
   - новая партия/fixture;
   - Germany planning;
   - commit;
   - handoff;
   - USSR planning;
   - execution;
   - contact/combat where deterministic fixture supports it;
   - AAR;
   - next day;
   - save/restore.
4. Снимать screenshots в `artifacts/ui-v1-integration/`:
   - scenario dossier;
   - planner;
   - collapsed/expanded sheet;
   - handoff;
   - execution;
   - combat;
   - AAR;
   - tablet;
   - mobile.

### Acceptance

- screenshots создаются тестом, а не вручную;
- screenshots используют deterministic seed;
- screenshots не содержат opponent private plan/hand;
- browser tests не заменяют engine test suite.

---

## Этап F — presentation mode и исторические поверхности

**Приоритет: P2, зависит от engine**

### Работы

1. Сначала добавить engine-backed redacted presentation selector.
2. Только после этого добавить `/play?mode=presentation`:
   - дата, фаза, импульс, счёт, публичные контакты и карта;
   - скрыты планы, hands, reactions, private reserves и private combat data.
3. Добавить scenario data contracts для:
   - короткого пролога;
   - operational areas;
   - директив;
   - источников.
4. Показывать директивы только когда они связаны с реальными GameEvent/GameCommand.

### Acceptance

- presentation mode не реализуется чистым CSS;
- документы не имитируют архивные источники;
- немецкая сторона подаётся документально и нейтрально;
- никакие игровые решения не добавляются без engine command.

---

## Не начинать в этой серии

- PixiJS migration;
- новый игровой renderer без `GameRenderer` abstraction;
- AI-generated архивные изображения;
- декоративные карты/директивы без model данных;
- массовое переименование engine API;
- перенос игровых формул в React.

## Рекомендуемый порядок commits

1. `test: add operational UI component coverage`
2. `feat: derive primary phase action from WEGO state`
3. `feat: refine planner and execution sheet presentation`
4. `feat: integrate engine-backed after-action report`
5. `fix: isolate operational canvas overlay layer`
6. `fix: normalize unique river edge rendering`
7. `perf: cache or index viewport-visible hexes`
8. `feat: complete mobile operational sheet interactions`
9. `test: add Playwright WEGO acceptance flow`
10. `docs: publish UI v1 acceptance evidence`
