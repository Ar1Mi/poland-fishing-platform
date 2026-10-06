---
paths:
  - "apps/api/src/**/*.ts"
---

# Backend (NestJS)

- Структура модуля: `modules/<name>/{<name>.module.ts, <name>.controller.ts, <name>.service.ts, dto/, <name>.service.spec.ts}`.
- Контроллер тонкий: разбор запроса, guards, вызов сервиса. Бизнес-логика — в сервисе или в `packages/shared`.
- Модуль не обращается к таблицам чужого модуля через Prisma — только через экспортированный сервис этого модуля.
- Каждый DTO — `class-validator` + `@ApiProperty()`. Ответы описаны DTO-классами для Swagger.
- Бизнес-ошибка — `throw new DomainError(ErrorCode.X, details)`; не бросай `HttpException` с текстом.
- Маршруты `/orgs/:orgId/*` всегда с `@UseGuards(OrgScopeGuard)` и `@Roles(...)`; запросы к БД фильтруют по `organizationId`.
- Маршруты `/me/*` берут `userId` только из `@CurrentUser()`, никогда из параметров.
- Текущее время — только `ClockService.now()`, не `new Date()` (тестируемость).
- Несколько связанных записей — в `prisma.$transaction`.
- Действия админов (аннулирование, решения по claim, правила, блокировки) пишутся в AuditLog.
- Логи через `PinoLogger`; не логируй пароли, токены, тела уведомлений P24 целиком.
