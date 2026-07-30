# Dependency audit v0.4.1

Дата: 2026-07-30.

## Результат

- `npm audit --omit=dev`: **0 production vulnerabilities**.
- `npm audit`: **13 dev-only findings** — 4 moderate, 9 high.
- `npm audit fix --force` не применялся.
- После безопасных patch/minor updates итоговые числа audit не изменились:
  уязвимые версии остаются внутри зафиксированных dependency chains
  `drizzle-kit` и ESLint.

Production bundle и production smoke не запускают `drizzle-kit`, ESLint,
`minimatch` или вложенный dev server `esbuild`.

## Классификация

| Package | Severity | Direct | Scope | Уязвимый путь используется | Безопасный patch/minor fix | Решение |
| --- | --- | --- | --- | --- | --- | --- |
| `drizzle-kit` | moderate | да | dev | Только schema/migration CLI; не production runtime | Нет; audit предлагает несовместимый downgrade `0.18.1` | Отложить до отдельного обновления DB tooling |
| `@esbuild-kit/esm-loader` | moderate | нет | dev | Загружается старым CLI path `drizzle-kit` | Нет независимо от `drizzle-kit` | Остаточный dev-риск принят |
| `@esbuild-kit/core-utils` | moderate | нет | dev | То же | Нет независимо от `drizzle-kit` | Остаточный dev-риск принят |
| `esbuild` | moderate | нет | dev | Уязвимость касается dev server; проект его через этот path не публикует | Нет; audit требует смены `drizzle-kit` | Не запускать этот dev server на недоверенной сети |
| `eslint` | high | да | dev/CI | Локальный lint и CI на repository-controlled patterns | Нет; исправление требует ESLint 10 | Отложить major upgrade |
| `eslint-config-next` | high | да | dev/CI | Только lint | Patch `16.2.12` применён, advisory chain остаётся | Отложить upstream/major fix |
| `@eslint/config-array` | high | нет | dev/CI | Только lint | Нет в текущем ESLint 9 chain | Остаточный dev-риск принят |
| `@eslint/eslintrc` | high | нет | dev/CI | Только lint | Нет в текущем ESLint 9 chain | Остаточный dev-риск принят |
| `eslint-plugin-import` | high | нет | dev/CI | Только lint | Audit не предлагает безопасный direct update | Следить за Next ESLint preset |
| `eslint-plugin-jsx-a11y` | high | нет | dev/CI | Только lint | Нет независимо от preset | Следить за Next ESLint preset |
| `eslint-plugin-react` | high | нет | dev/CI | Только lint | Нет независимо от preset | Следить за Next ESLint preset |
| `minimatch` | high | нет | dev/CI | Обрабатывает repository-controlled lint globs | Нет без ESLint/preset major transition | Не передавать недоверенные glob expressions |
| `brace-expansion` | high | нет | dev/CI | Достижим только через `minimatch` во время lint | Нет без ESLint/preset major transition | Остаточный dev-риск принят |

## Применённые безопасные обновления

| Package | Было | Стало |
| --- | ---: | ---: |
| `dotenv` | 17.3.1 | 17.4.2 |
| `pg` | 8.20.0 | 8.22.0 |
| `react` | 19.2.6 | 19.2.8 |
| `react-dom` | 19.2.6 | 19.2.8 |
| `@tailwindcss/postcss` | 4.1.17 | 4.3.3 |
| `tailwindcss` | 4.1.17 | 4.3.3 |
| `postcss` | 8.5.18 | 8.5.25 |
| `@types/pg` | 8.18.0 | 8.20.0 |
| `@types/react` | 19.2.14 | 19.2.17 |
| `eslint-config-next` | 16.2.6 | 16.2.12 |

Не обновлялись из-за major-version transition: `eslint` 9 → 10,
TypeScript 5 → 7 и `@types/node` 22 → 26.

## Остаточный риск

Остаточный риск ограничен локальными и CI dev tools. Он не равен нулю:
злонамеренный repository input или публикация старого `esbuild` dev server
может активировать advisory path. До отдельного toolchain upgrade следует
использовать только доверенные lint patterns, не публиковать dev tooling и
сохранять `npm audit --omit=dev` обязательной release-проверкой.
