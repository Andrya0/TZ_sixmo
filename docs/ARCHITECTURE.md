# Архитектура

## L0 — Agent Contract Layer

- `skill/skill.yaml`
- `skill/input.schema.json`
- `src/index.ts`

Отвечает за вызов из агента, валидацию и единый JSON-контракт.

## L1 — Application Orchestration Layer

- `src/app/sixmoSkill.ts`

Отвечает за жизненный цикл use case: принять вход, поднять браузер, запустить workflow, вернуть типизированный результат.

## L2 — Workflow Intelligence Layer

- `src/core/workflow/formRunner.ts`
- `src/core/workflow/stepDetector.ts`

Отвечает за:

- определение текущего шага;
- выбор полей, которые видимы именно на этом шаге;
- переходы `next/submit`;
- финальную верификацию.

## L3 — Semantic Interaction Layer

- `src/core/selectors/semanticLocator.ts`
- `src/core/selectors/fileUpload.ts`

Это ключевой уровень устойчивости. Он не опирается на один CSS-selector, а использует:

- label;
- placeholder;
- role/name;
- aria-label;
- name/id/data-testid;
- текст контейнера;
- fallback scoring по совокупности признаков.

Из-за этого перестановка полей между шагами не ломает сценарий.

## L4 — Resilience & Observability Layer

- `src/core/resilience/retry.ts`
- `src/core/resilience/artifacts.ts`

Отвечает за retry и диагностику:

- скриншоты каждого шага;
- HTML финальной страницы;
- Playwright trace.

## L5 — Infrastructure Layer

- `src/core/browser/session.ts`

Изолирует браузерную инфраструктуру и Playwright runtime.
