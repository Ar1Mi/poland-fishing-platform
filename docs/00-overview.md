# 00. Обзор и глоссарий

## Что это

Łowisko — веб-платформа (PWA) с каталогом реальных водоёмов Польши.

- **Рыбак** ведёт электронный реестр уловов на любом водоёме. На подключённом водоёме покупает разрешение в приложении; на неподключённом вносит внешнее разрешение (купленное у владельца вне платформы).
- **Организация** (округ PZW, RZGW Wody Polskie, частное łowisko) подключает свои водоёмы, продаёт разрешения и задаёт правила ловли.
- **Инспектор** организации проверяет разрешение онлайн по QR-коду и сохраняет протокол контроля.
- **Суперадмин** импортирует каталог, одобряет организации и заявки на водоёмы, ведёт общие правила.

Обоснование: сегодня rejestr połowów ведётся на бумаге и отправляется владельцу водоёма до 31 января следующего года. Электронный реестр с проверкой правил полезен рыбаку с первого дня, даже если владелец водоёма не подключён.

## Вне рамок

Не реализуем без явного решения (ADR):

- выдачу karty wędkarskiej и интеграцию с реальными системами PZW / Wody Polskie;
- нативные мобильные приложения;
- бухгалтерию, фактуры VAT, выплаты организациям;
- офлайн-проверку QR инспектором (только онлайн, см. ADR-0006);
- проверку QR для внешних разрешений (инспектор смотрит бумажный документ).

## Глоссарий

| PL | RU | В коде (EN) |
| --- | --- | --- |
| zezwolenie (na amatorski połów ryb) | разрешение | `Permit` |
| zezwolenie zewnętrzne | внешнее разрешение | `ExternalPermit` |
| rodzaj zezwolenia | тип разрешения | `PermitType` |
| rejestr połowów | реестр уловов | catch register |
| połów / złowiona ryba | улов | `CatchRecord` |
| łowisko, obwód rybacki | водоём | `FishingWater` |
| użytkownik rybacki | пользователь рыбохозяйственный (владелец прав на водоём) | `externalOwnerName`, `Organization` |
| gatunek | вид рыбы | `Species` |
| gatunek chroniony | охраняемый вид | `Species.isProtected` |
| wymiar ochronny | минимальный размер | `SpeciesRule.minLengthCm` |
| okres ochronny | запретный период | `SpeciesRule.closedFrom/closedTo` |
| limit dzienny | суточный лимит | `dailyLimitCount`, `dailyLimitWeightG` |
| karta wędkarska | карта рыбака | `User.anglerCardNo` |
| Straż Rybacka / strażnik SSR | инспектор | `INSPECTOR` (роль) |
| kontrola | проверка / протокол контроля | `Inspection` |
| zgłoszenie łowiska | заявка на подключение водоёма | `WaterClaim` |
| województwo | регион (воеводство) | `region` |
| grosz | грош (1/100 zł) | `*Grosze` (суммы) |

## Карта документации

| Файл | Содержание |
| --- | --- |
| `01-requirements.md` | Роли, FR, NFR |
| `02-business-rules.md` | Правила ловли, CatchValidator |
| `03-architecture.md` | Модули, сквозные механизмы |
| `04-data-model.md` | Сущности, схема Prisma |
| `05-api.md` | Эндпоинты, ошибки |
| `06-frontend.md` | Маршруты, PWA, офлайн, i18n |
| `07-security.md` | Угрозы, RODO |
| `08-testing-and-infra.md` | Тесты, Docker, CI, деплой |
| `09-scenarios.md` | Сквозные сценарии (E2E) |
| `adr/` | Решения и их причины |
| `tasks/ROADMAP.md` | Задачи |
| `thesis-log.md` | Журнал реализации для текста диплома |
