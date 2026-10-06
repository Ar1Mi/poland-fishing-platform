---
paths:
  - "apps/web/src/**/*.{ts,tsx}"
---

# Frontend (React)

- Код по фичам: `features/<name>/{pages,components,hooks,api}`; общее — в `shared/`.
- Никаких строк интерфейса в JSX: только `t('feature.component.key')`. Новый ключ — сразу в `pl`; `en`/`ru` можно оставить на этап локализации.
- Ошибки API показываются как `t('errors.' + code)`; новый `ErrorCode` — новый ключ.
- Данные сервера — только через TanStack Query и типизированный клиент (`pnpm gen:api` после изменения API). Никакого `fetch` в компонентах.
- Формы — React Hook Form + Zod-схема из `@lowisko/shared`, если она есть.
- Access-токен — только в памяти; ничего чувствительного в `localStorage`.
- Проверка улова на клиенте — только `validateCatch` из `@lowisko/shared`, не своя копия логики.
- Mobile-first: цели нажатия ≥ 44 px, работа одной рукой; проверяй экран на ширине 375 px.
- Доступность: семантические элементы, `label` у полей, видимый фокус, контраст AA.
- Даты/числа — `Intl` с текущим языком, часовой пояс `Europe/Warsaw`.
