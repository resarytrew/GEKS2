# Известные ограничения v0.4.1

- Multiplayer transport is still an adapter rather than a hosted authoritative
  service; hot-seat is the supported mode.
- The Raseiniai fixture reuses the full campaign map rather than a cropped map.
- Supply capacity is represented by route state and distance; competing
  formation-by-formation throughput allocation remains future work.
- Opponent intelligence is contact-based; there is no probabilistic fog model.
- Acceptance fixture uses representative existing formations as artillery and
  heavy-AT test assets; it is not a playable historical scenario.
- Legacy `loss_threshold` reactions are removed with a migration warning.
- Reserve triggers `friendly_retreat`, `meeting_engagement` and
  `objective_threatened` are planned, not active v0.4.1 rules.
- `npm audit --omit=dev` is clean. Thirteen findings remain in dev-only ESLint
  and drizzle-kit dependency chains; see `DEPENDENCY_AUDIT_v0.4.1.md`.
- Production smoke proves a local server only; no external deployment has been
  created or verified.

- Нет точной архивной карты театра: география, дороги, железные дороги,
  болота, реки, мосты и координаты частей реконструированы.
- OOB не прошёл полную сверку до полка/батальона по первичным документам.
- Воздушная война представлена ограниченными модификаторами, без полной
  модели аэродромов, вылетов, потерь и ПВО.
- Нет полной железнодорожной логистики, перегрузки колеи, ремонта пути и
  эшелонов.
- Нет production multiplayer, защищённой серверной авторизации,
  matchmaking и anti-cheat.
- Нет турнирной платформы, рейтингов, арбитража и подписанных replay.
- Нет teacher mode, учебных сценарных заметок и инструментов занятия.
- Полный исторический сценарий 22 июня — 9 июля не завершён контентно и
  не откалиброван серией массовых прогонов.
- AI-противник отсутствует; основной режим — локальный hotseat.
- Доступность и мобильная компоновка требуют отдельного аудита.
- PostgreSQL-маршруты хранения являются заготовкой и не заменяют
  authoritative multiplayer backend.

Эти ограничения не скрываются UI или документацией. Любое устранение
ограничения требует тестов, источников (если затронута история) и записи в
changelog.
