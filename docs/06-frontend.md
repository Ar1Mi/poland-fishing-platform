# 06. Frontend и PWA

Одно SPA для всех ролей. Офлайн нужен только рыбаку (запись улова, показ QR).

## Библиотеки

| Задача | Библиотека |
| --- | --- |
| Маршрутизация | React Router (data router) |
| Серверное состояние | TanStack Query |
| Формы | React Hook Form + Zod (схемы из `packages/shared`) |
| UI | Tailwind CSS + shadcn/ui |
| Карта | react-leaflet + OSM-тайлы, кластеризация маркеров |
| PWA | vite-plugin-pwa (Workbox) |
| Локальная БД | Dexie (IndexedDB) |
| QR | qrcode.react |
| i18n | react-i18next, namespaces по фичам |
| API-клиент | `openapi-typescript` + `openapi-fetch` |

## Маршруты

| Путь | Роль | Экран |
| --- | --- | --- |
| `/` | все | Карта каталога + поиск |
| `/waters/:id` | все | Карточка водоёма, типы разрешений, правила |
| `/login`, `/register`, `/verify-email`, `/reset-password` | гость | Аккаунт |
| `/verify/:token` | все | Проверка разрешения (QR) |
| `/me/permits`, `/me/permits/:id` | рыбак | Разрешения, QR на весь экран |
| `/buy/:permitTypeId` | рыбак | Покупка, выбор даты |
| `/payment/return` | рыбак | Ожидание подтверждения (опрос API) |
| `/me/external-permits` | рыбак | Внешние разрешения |
| `/catch/new` | рыбак | Запись улова (офлайн) |
| `/me/catches` | рыбак | Реестр, статусы синхронизации |
| `/me/profile` | рыбак | Профиль, язык, RODO |
| `/org/:orgId/...` | ORG_ADMIN / INSPECTOR | Водоёмы, claim, типы, правила, разрешения, члены, статистика, протоколы |
| `/admin/...` | суперадмин | Организации, claim, импорт, общие правила, виды |

Защита маршрутов — по ролям из `/me` и `/me/orgs`; сервер всё равно проверяет доступ сам.

## Офлайн

Таблицы Dexie:

| Таблица | Содержимое |
| --- | --- |
| `permits` | Активные и будущие разрешения (платформенные и внешние) + `qrToken` |
| `rules` | Эффективные правила по `permitId` (из `/offline-bundle`) |
| `species`, `waters` | Справочники для формы улова (водоёмы — только из разрешений) |
| `catchQueue` | Уловы: `clientId`, данные, `status: PENDING_SYNC / ACCEPTED / REJECTED`, `violations` |

Поток:

1. После оплаты и при каждом открытии онлайн — обновить `permits`/`rules` из `/offline-bundle`.
2. Форма улова вызывает `validateCatch` из `packages/shared` и сразу показывает нарушения.
3. Запись → `catchQueue` со статусом `PENDING_SYNC`.
4. Синхронизация: при событии `online`, при открытии приложения и по кнопке «Синхронизировать» — пакетами по 50 на `/catches/sync`.
5. Ответ обновляет статусы; `REJECTED` показываются с переведённой причиной.

Background Sync API не используется: его нет в Safari/iOS.

Workbox: app shell и статика — precache; `/api/v1/waters`, `/species` — StaleWhileRevalidate; остальное API — NetworkOnly (данные кэшируются в Dexie, а не в Service Worker). Тайлы карты — CacheFirst с лимитом 500 записей.

## i18n

- Языки `pl` (по умолчанию), `en`, `ru`; файлы `src/shared/i18n/locales/{lng}/{ns}.json`.
- Никаких строк в JSX — только `t('catch.form.length')`. Ключи — `feature.component.element`.
- Ошибки API переводятся по `code`: `t('errors.' + code)`.
- До этапа локализации допустимо заполнять только `pl`; пропущенные ключи в `en`/`ru` подхватывает fallback на `pl`.
- Даты и числа — `Intl` с локалью пользователя, часовой пояс `Europe/Warsaw`.

## UI-принципы

Цвета, типографика, отступы и компоненты — в `10-design-system.md`.

- Mobile-first: основной сценарий — телефон на берегу, одной рукой, на солнце. Крупные цели нажатия (≥ 44 px), высокий контраст.
- Форма улова ≤ 3 шагов (NFR-06): последние вид и водоём подставляются по умолчанию.
- QR — на весь экран, с подсказкой увеличить яркость и номером разрешения текстом.
