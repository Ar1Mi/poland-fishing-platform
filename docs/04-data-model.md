# 04. Модель данных

Центр модели — `FishingWater` из каталога: водоём существует без организации. Улов ссылается **ровно на одно** разрешение: платформенное (`Permit`) или внешнее (`ExternalPermit`).

## Соглашения

- PK — UUID (`@default(uuid())`), время — `@db.Timestamptz(3)`, UTC.
- Деньги — `Int` в грошах; поле с суффиксом `Grosze`.
- Даты без времени (`validFrom`, `birthDate`) — `@db.Date`.
- Okres ochronny — строки `MM-DD`.
- Таблицы организации содержат `organizationId`; доступ — только через `OrgScopeGuard`.
- Токены (refresh, email, приглашения) хранятся только как SHA-256 хеш.
- Ограничения, которых нет в Prisma (CHECK, частичные индексы), добавляются SQL-ом в файле миграции и перечислены ниже.

## Схема `schema.prisma`

Копия `apps/api/prisma/schema.prisma` (T-04): при изменении схемы обновляй оба места. 18 моделей, 15 enum; enum продублированы в `packages/shared/src/enums.ts`, совпадение проверяет `apps/api/src/database/enums.spec.ts`.

**Версия Prisma — 7.10.0** (зафиксирована в `apps/api/package.json`; ветка 8.x не используется). В Prisma 7:

- строка подключения не пишется в `schema.prisma` — она в `apps/api/prisma.config.ts` (`datasource.url = env('DATABASE_URL')`);
- генератор `prisma-client` с обязательным `output`;
- `PrismaClient` создаётся с драйвер-адаптером `@prisma/adapter-pg`;
- клиент генерируется как CommonJS (`moduleFormat = "cjs"`) с импортами без расширения (`importFileExtension = ""`) — так его загружают и Nest, и Jest (включая `globalSetup`). Сгенерированный код не коммитится, его создаёт `postinstall` (`prisma generate`).

```prisma
// Source of truth: docs/04-data-model.md. Enums are mirrored in packages/shared/src/enums.ts
// (src/database/enums.spec.ts compares them).

generator client {
  provider            = "prisma-client"
  output              = "../src/generated/prisma"
  moduleFormat        = "cjs" // the API is built as CommonJS
  // Extensionless relative imports: Jest resolves them without a module mapper,
  // including in globalSetup, which bypasses Jest's resolver.
  importFileExtension = ""
}

// The connection URL is in prisma.config.ts (Prisma 7).
datasource db {
  provider = "postgresql"
}

// ---------- Пользователи и организации ----------

model User {
  id              String    @id @default(uuid()) @db.Uuid
  email           String    @unique
  emailVerifiedAt DateTime? @db.Timestamptz(3)
  passwordHash    String
  firstName       String
  lastName        String
  birthDate       DateTime  @db.Date
  anglerCardNo    String?
  locale          Locale    @default(pl)
  isSuperAdmin    Boolean   @default(false)
  deletedAt       DateTime? @db.Timestamptz(3) // RODO: анонимизация
  createdAt       DateTime  @default(now()) @db.Timestamptz(3)
  updatedAt       DateTime  @updatedAt @db.Timestamptz(3)

  memberships     Membership[]
  permits         Permit[]
  externalPermits ExternalPermit[]
  catches         CatchRecord[]
  inspections     Inspection[]     @relation("InspectorInspections")
  refreshTokens   RefreshToken[]
  oneTimeTokens   OneTimeToken[]
}

enum Locale {
  pl
  en
  ru
}

model RefreshToken {
  id        String    @id @default(uuid()) @db.Uuid
  userId    String    @db.Uuid
  familyId  String    @db.Uuid // ротация: повторное использование отзывает всю семью
  tokenHash String    @unique
  expiresAt DateTime  @db.Timestamptz(3)
  revokedAt DateTime? @db.Timestamptz(3)
  createdAt DateTime  @default(now()) @db.Timestamptz(3)
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model OneTimeToken {
  id        String              @id @default(uuid()) @db.Uuid
  userId    String              @db.Uuid
  purpose   OneTimeTokenPurpose
  tokenHash String              @unique
  expiresAt DateTime            @db.Timestamptz(3)
  usedAt    DateTime?           @db.Timestamptz(3)
  user      User                @relation(fields: [userId], references: [id], onDelete: Cascade)
}

enum OneTimeTokenPurpose {
  EMAIL_VERIFICATION
  PASSWORD_RESET
}

model Organization {
  id            String             @id @default(uuid()) @db.Uuid
  name          String
  nip           String             @unique
  kind          OrganizationKind
  status        OrganizationStatus @default(PENDING)
  contactEmail  String
  p24MerchantId String? // в sandbox один аккаунт платформы
  createdAt     DateTime           @default(now()) @db.Timestamptz(3)
  updatedAt     DateTime           @updatedAt @db.Timestamptz(3)

  memberships Membership[]
  invitations Invitation[]
  waters      FishingWater[]
  claims      WaterClaim[]
  permitTypes PermitType[]
  rules       SpeciesRule[]
}

enum OrganizationKind {
  PZW
  RZGW
  PRIVATE
}

enum OrganizationStatus {
  PENDING
  ACTIVE
  BLOCKED
}

model Membership {
  id             String       @id @default(uuid()) @db.Uuid
  userId         String       @db.Uuid
  organizationId String       @db.Uuid
  role           OrgRole
  createdAt      DateTime     @default(now()) @db.Timestamptz(3)
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([userId, organizationId, role])
  @@index([organizationId])
}

enum OrgRole {
  ORG_ADMIN
  INSPECTOR
}

model Invitation {
  id             String       @id @default(uuid()) @db.Uuid
  organizationId String       @db.Uuid
  email          String
  role           OrgRole
  tokenHash      String       @unique
  expiresAt      DateTime     @db.Timestamptz(3)
  acceptedAt     DateTime?    @db.Timestamptz(3)
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
}

// ---------- Каталог ----------

model FishingWater {
  id                String      @id @default(uuid()) @db.Uuid
  name              String
  type              WaterType
  region            String // województwo, напр. "mazowieckie"
  lat               Float?
  lng               Float?
  description       String?
  status            WaterStatus @default(UNCLAIMED)
  organizationId    String?     @db.Uuid
  externalOwnerName String? // użytkownik rybacki для неподключённых
  externalInfoUrl   String?
  source            WaterSource
  sourceRef         String // идентификатор в источнике (номер obwodu и т.п.)
  isPublished       Boolean     @default(true) // false — предложение рыбака на модерации
  createdAt         DateTime    @default(now()) @db.Timestamptz(3)
  updatedAt         DateTime    @updatedAt @db.Timestamptz(3)

  organization    Organization?    @relation(fields: [organizationId], references: [id])
  claims          WaterClaim[]
  permitTypes     PermitType[]
  externalPermits ExternalPermit[]
  rules           SpeciesRule[]
  catches         CatchRecord[]

  @@unique([source, sourceRef])
  @@index([status, region])
  @@index([organizationId])
}

enum WaterType {
  LAKE
  RIVER
  RESERVOIR
  POND
  CANAL
}

enum WaterStatus {
  UNCLAIMED
  CONNECTED
}

enum WaterSource {
  RZGW
  PZW
  OSM
  USER
  MANUAL
}

model WaterClaim {
  id             String       @id @default(uuid()) @db.Uuid
  fishingWaterId String       @db.Uuid
  organizationId String       @db.Uuid
  status         ClaimStatus  @default(PENDING)
  proofFileKey   String
  comment        String?
  reviewedById   String?      @db.Uuid
  reviewedAt     DateTime?    @db.Timestamptz(3)
  createdAt      DateTime     @default(now()) @db.Timestamptz(3)
  water          FishingWater @relation(fields: [fishingWaterId], references: [id])
  organization   Organization @relation(fields: [organizationId], references: [id])

  @@index([status])
}

enum ClaimStatus {
  PENDING
  APPROVED
  REJECTED
}

model GeocodeCache {
  query     String   @id
  lat       Float?
  lng       Float?
  raw       Json?
  createdAt DateTime @default(now()) @db.Timestamptz(3)
}

// ---------- Разрешения и оплата ----------

model PermitType {
  id             String         @id @default(uuid()) @db.Uuid
  organizationId String         @db.Uuid
  name           String
  durationDays   Int
  priceGrosze    Int
  discountKind   DiscountKind   @default(NONE)
  isActive       Boolean        @default(true)
  createdAt      DateTime       @default(now()) @db.Timestamptz(3)
  organization   Organization   @relation(fields: [organizationId], references: [id])
  waters         FishingWater[]
  permits        Permit[]

  @@index([organizationId])
}

enum DiscountKind {
  NONE
  JUNIOR
  SENIOR
}

model Permit {
  id              String        @id @default(uuid()) @db.Uuid
  number          String        @unique // напр. ZW-2026-000123
  userId          String        @db.Uuid
  permitTypeId    String        @db.Uuid
  validFrom       DateTime      @db.Date
  validTo         DateTime      @db.Date
  status          PermitStatus  @default(PENDING_PAYMENT)
  pricePaidGrosze Int
  revokedAt       DateTime?     @db.Timestamptz(3)
  revokeReason    String?
  createdAt       DateTime      @default(now()) @db.Timestamptz(3)
  user            User          @relation(fields: [userId], references: [id])
  permitType      PermitType    @relation(fields: [permitTypeId], references: [id])
  payments        Payment[]
  catches         CatchRecord[]
  inspections     Inspection[]

  @@index([userId, validTo])
}

/// Хранимые статусы. SCHEDULED/ACTIVE/EXPIRED вычисляются из дат (ADR-0005).
enum PermitStatus {
  PENDING_PAYMENT
  PAID
  CANCELLED
  REVOKED
}

model ExternalPermit {
  id         String         @id @default(uuid()) @db.Uuid
  userId     String         @db.Uuid
  issuerName String
  number     String?
  validFrom  DateTime       @db.Date
  validTo    DateTime       @db.Date
  photoKey   String?
  createdAt  DateTime       @default(now()) @db.Timestamptz(3)
  user       User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  waters     FishingWater[]
  catches    CatchRecord[]

  @@index([userId, validTo])
}

model Payment {
  id              String              @id @default(uuid()) @db.Uuid
  permitId        String              @db.Uuid
  provider        PaymentProviderKind
  sessionId       String              @unique // наш идентификатор сессии, передаётся в P24
  providerOrderId String? // orderId из уведомления P24
  amountGrosze    Int
  status          PaymentStatus       @default(PENDING)
  rawNotification Json?
  createdAt       DateTime            @default(now()) @db.Timestamptz(3)
  updatedAt       DateTime            @updatedAt @db.Timestamptz(3)
  permit          Permit              @relation(fields: [permitId], references: [id])
}

enum PaymentProviderKind {
  P24
  FAKE
}

enum PaymentStatus {
  PENDING
  SUCCEEDED
  FAILED
}

// ---------- Правила и реестр ----------

model Species {
  id          String        @id @default(uuid()) @db.Uuid
  latinName   String        @unique
  namePl      String
  nameEn      String
  nameRu      String
  isProtected Boolean       @default(false)
  rules       SpeciesRule[]
  catches     CatchRecord[]
}

/// Общее правило: organizationId = null и fishingWaterId = null.
model SpeciesRule {
  id                String        @id @default(uuid()) @db.Uuid
  speciesId         String        @db.Uuid
  organizationId    String?       @db.Uuid
  fishingWaterId    String?       @db.Uuid
  minLengthCm       Int?
  closedFrom        String? // MM-DD
  closedTo          String? // MM-DD
  dailyLimitCount   Int?
  dailyLimitWeightG Int?
  createdAt         DateTime      @default(now()) @db.Timestamptz(3)
  updatedAt         DateTime      @updatedAt @db.Timestamptz(3)
  species           Species       @relation(fields: [speciesId], references: [id])
  // Cascade, not the default SET NULL: a rule that lost its level would silently widen
  // (an organization rule would become a general one).
  organization      Organization? @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  water             FishingWater? @relation(fields: [fishingWaterId], references: [id], onDelete: Cascade)

  @@index([speciesId])
}

model CatchRecord {
  id               String          @id @default(uuid()) @db.Uuid
  clientId         String          @unique @db.Uuid // генерируется на устройстве
  userId           String          @db.Uuid
  permitId         String?         @db.Uuid
  externalPermitId String?         @db.Uuid
  fishingWaterId   String          @db.Uuid
  speciesId        String          @db.Uuid
  caughtAt         DateTime        @db.Timestamptz(3)
  lengthCm         Int
  weightG          Int?
  kept             Boolean
  lat              Float?
  lng              Float?
  photoKey         String?
  syncStatus       CatchSyncStatus
  violations       Json? // RuleViolation[] при REJECTED
  createdAt        DateTime        @default(now()) @db.Timestamptz(3)
  updatedAt        DateTime        @updatedAt @db.Timestamptz(3)
  user             User            @relation(fields: [userId], references: [id])
  permit           Permit?         @relation(fields: [permitId], references: [id])
  // Restrict, not SET NULL: catch_exactly_one_permit would reject the orphan anyway.
  externalPermit   ExternalPermit? @relation(fields: [externalPermitId], references: [id], onDelete: Restrict)
  water            FishingWater    @relation(fields: [fishingWaterId], references: [id])
  species          Species         @relation(fields: [speciesId], references: [id])

  @@index([userId, caughtAt])
  @@index([permitId])
}

enum CatchSyncStatus {
  ACCEPTED
  REJECTED
}

// ---------- Контроль и аудит ----------

model Inspection {
  id          String           @id @default(uuid()) @db.Uuid
  inspectorId String           @db.Uuid
  permitId    String           @db.Uuid
  performedAt DateTime         @default(now()) @db.Timestamptz(3)
  result      InspectionResult
  notes       String?
  lat         Float?
  lng         Float?
  inspector   User             @relation("InspectorInspections", fields: [inspectorId], references: [id])
  permit      Permit           @relation(fields: [permitId], references: [id])

  @@index([permitId])
}

enum InspectionResult {
  OK
  VIOLATION
}

model AuditLog {
  id        String   @id @default(uuid()) @db.Uuid
  actorId   String?  @db.Uuid
  action    String // напр. PERMIT_REVOKED
  entity    String
  entityId  String
  diff      Json?
  createdAt DateTime @default(now()) @db.Timestamptz(3)

  @@index([entity, entityId])
}
```

## SQL-ограничения в миграциях

```sql
-- улов ссылается ровно на одно разрешение
ALTER TABLE "CatchRecord" ADD CONSTRAINT catch_exactly_one_permit
  CHECK ((("permitId" IS NOT NULL)::int + ("externalPermitId" IS NOT NULL)::int) = 1);

-- водоёмное правило требует организации
ALTER TABLE "SpeciesRule" ADD CONSTRAINT rule_water_requires_org
  CHECK ("fishingWaterId" IS NULL OR "organizationId" IS NOT NULL);

-- формат MM-DD и парность периода
ALTER TABLE "SpeciesRule" ADD CONSTRAINT rule_closed_period
  CHECK (("closedFrom" IS NULL) = ("closedTo" IS NULL)
     AND ("closedFrom" IS NULL OR "closedFrom" ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$')
     AND ("closedTo"   IS NULL OR "closedTo"   ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'));

-- подключённый водоём имеет организацию
ALTER TABLE "FishingWater" ADD CONSTRAINT water_connected_has_org
  CHECK ("status" = 'UNCLAIMED' OR "organizationId" IS NOT NULL);

ALTER TABLE "Permit" ADD CONSTRAINT permit_dates CHECK ("validTo" >= "validFrom");
ALTER TABLE "PermitType" ADD CONSTRAINT permit_type_positive CHECK ("durationDays" > 0 AND "priceGrosze" >= 0);

-- одно общее правило на вид (правил организации и водоёма может быть несколько — они сливаются в самое строгое)
CREATE UNIQUE INDEX rule_one_general ON "SpeciesRule" ("speciesId") WHERE "organizationId" IS NULL AND "fishingWaterId" IS NULL;

-- одна активная заявка на водоём от организации
CREATE UNIQUE INDEX claim_one_pending ON "WaterClaim" ("fishingWaterId", "organizationId") WHERE "status" = 'PENDING';
```

Все ограничения — в `apps/api/prisma/migrations/20261018095038_init/migration.sql`, каждое проверено тестом `apps/api/test/database-constraints.e2e-spec.ts`. `rule_closed_period` проверяет только форму `MM-DD`: несуществующий день месяца (`02-30`) отсекает валидация входа API правил (T-16).

Удаление (`onDelete`), отличное от умолчаний Prisma:

- `SpeciesRule.organization`, `SpeciesRule.water` — `Cascade`. Умолчание `SET NULL` молча расширяло бы правило: правило удалённой организации стало бы общим для всей страны, правило удалённого водоёма — правилом всей организации.
- `CatchRecord.externalPermit` — `Restrict`: внешнее разрешение с уловами удалить нельзя (при `SET NULL` удаление упало бы на `catch_exactly_one_permit` с непонятной ошибкой).

## Номер разрешения

`ZW-{YYYY}-{000001}`: своя последовательность PostgreSQL на каждый год (`permit_number_2026`, …). Её создаёт при первом номере года SQL-функция `next_permit_number(year)` из той же миграции; создание защищено `pg_advisory_xact_lock`, поэтому одновременные первые покупки года не падают на `CREATE SEQUENCE`. Блокировка берётся только пока последовательности нет. И блокировка, и новая последовательность живут до конца транзакции вызывающего кода: если первый номер года взят внутри транзакции покупки, остальные первые покупки года ждут её завершения (`apps/api/test/permit-number.e2e-spec.ts`). Поэтому в T-13 номер берётся в короткой транзакции записи разрешения, без HTTP-запросов к P24 внутри неё.

Функция выполняет DDL во время работы приложения: роли приложения нужно право `CREATE` на схему `public`. С PostgreSQL 15 у `PUBLIC` его нет — приложение должно подключаться владельцем БД (как в `docker-compose.yml`); учесть при деплое (T-30). Год — по дате `Europe/Warsaw` (`PermitNumberService`, `ClockService`). Номер больше 999999 не обрезается (7 цифр). Пропуски номеров (откат транзакции) допустимы.

## Ключевые решения (для текста диплома)

- Деньги в грошах (`Int`) — нет ошибок округления float.
- `clientId` с устройства + unique — повторная синхронизация идемпотентна.
- `MM-DD` для okresu ochronnego — период повторяется ежегодно и может переходить через Новый год.
- Три уровня `SpeciesRule` в одной таблице — уровень определяется заполненностью внешних ключей.
- `source + sourceRef` unique — повторный импорт обновляет, а не дублирует.
- Фильтр `bbox` (`lat`/`lng`) — без индекса (решение T-10). Каталог Mazowsza — порядка 10³ строк, всей страны — 10⁴: последовательный просмотр таблицы — единицы миллисекунд. B-tree по `(lat, lng)` сужал бы только по первому столбцу; настоящий пространственный индекс (GiST по точке) — вместе с ADR о серверной кластеризации, если каталог перерастёт `WATERS_LIST_LIMIT`.
- `GeocodeCache.query` — запрос в нижнем регистре со схлопнутыми пробелами; «не найдено» тоже кэшируется (`lat`/`lng` = null), ошибки геокодера — нет.
- Одобрение claim — одна транзакция: `WaterClaim.APPROVED` + `FishingWater.organizationId` + `CONNECTED`; другие PENDING-заявки на этот водоём → `REJECTED`; запись в `AuditLog` — в той же транзакции. Первым меняется водоём (условный `UPDATE … WHERE status = 'UNCLAIMED'`): второе одновременное одобрение ждёт его блокировку и видит `CONNECTED`, а не уходит в deadlock на строках заявок. Каждое изменение статуса заявки тоже условное (`WHERE status = 'PENDING'`). Подача заявки читает водоём с `SELECT … FOR SHARE` в своей транзакции: эта блокировка конфликтует с `UPDATE` одобрения, поэтому либо одобрение ждёт вставку и отклоняет новую заявку вместе с остальными, либо подача ждёт одобрение и видит `CONNECTED` (обычное чтение пропускало бы заявку после одобрения, и она оставалась бы `PENDING` у подключённого водоёма; FK-проверка вставки берёт `KEY SHARE`, совместимый с `UPDATE` без смены ключа). Одобряется только заявка `ACTIVE`-организации. `proofFileKey` — ключ `StorageService` (`claims/<uuid>.<ext>`), MIME документа выводится из расширения.
- Условия проданного типа разрешения (срок, льгота, водоёмы) не меняются, а сам тип не удаляется — только снимается с продажи (`isActive = false`): водоёмы типа задают, что покрывает проданное разрешение (BR-01). Изменение и удаление сначала берут строку `PermitType` через `SELECT … FOR UPDATE`, затем считают разрешения. `FOR UPDATE` конфликтует с `KEY SHARE`, который FK-проверка вставки `Permit` берёт на строке типа: продажа либо закоммичена раньше и будет посчитана, либо ждёт изменения. Обычный `UPDATE` (`FOR NO KEY UPDATE`) с `KEY SHARE` совместим и продажу не остановил бы (проверено тестом: без блокировки изменение водоёмов проходит во время продажи, удаление падает 500 на FK). Связи с водоёмами (`_FishingWaterToPermitType`) удаляются вместе с типом каскадом.
- Номер разрешения — последовательность PostgreSQL на год: `ZW-{YYYY}-{000001}` (см. «Номер разрешения»).
- Изменение и удаление `SpeciesRule` (T-16) сначала берут строку правила `SELECT … FOR UPDATE`, затем читают её и проверяют результат слияния с запросом. Без блокировки два одновременных `PATCH` проверялись бы каждый против старой строки и вместе оставляли бы половину периода (CHECK `rule_closed_period` → 500) или правило, которое ничего не ограничивает (CHECK на это нет). Проверено тестом: без блокировки запрос, ждущий чужую правку, проходит с 200. Одновременные создания общего правила вида решает индекс `rule_one_general` (второе → 409 `RULE_ALREADY_EXISTS`).
- Покупка (T-13) — одна короткая транзакция без HTTP: тип читается под `SELECT … FOR SHARE` (`FOR SHARE` конфликтует с `FOR UPDATE` правки типа из T-12: идущая правка дожидается, и продажа берёт закоммиченные цену и условия; обычное чтение взяло бы старую цену — проверено тестом), затем номер, `Permit` и `Payment`. Схема не менялась: у разрешения на платформе один `Payment`, у бесплатного — ни одного. `createdAt` разрешения и платежа берётся из `ClockService`, а не `DEFAULT now()`: таймаут оплаты сравнивает его с тем же часами.
- Изменение статуса платежа (уведомление, отказ, таймаут) сначала блокирует строку `Payment` (`FOR UPDATE`), затем меняет `Permit` условным `UPDATE … WHERE status = 'PENDING_PAYMENT'` — порядок одинаков везде, поэтому нет взаимных блокировок, и из «оплачено» и «отменено по таймауту» побеждает ровно одно. Подтверждение у провайдера (`transaction/verify`) — последний шаг транзакции, после записи `Payment` и `Permit` (первая версия подтверждала до записи: ошибка после подтверждения оставляла деньги списанными, а платёж `PENDING`; найдено ревью, закреплено тестом). Всё это время строка платежа заблокирована: таймаут (`FOR UPDATE SKIP LOCKED`) пропускает такой платёж и не отменит разрешение, деньги за которое списываются. Транзакция уведомления — с таймаутом 20 с вместо 5 с по умолчанию Prisma. Остаётся узкое окно: провайдер подтвердил, а коммит не прошёл (обрыв связи с БД) — повторное уведомление P24 разбирается в T-14.
- Отменённая оплата (`CANCELLED`) тоже фиксирует условия типа (`inUse`, решение T-13): удалить такой тип мешает внешний ключ, а для правки отдельный признак усложнил бы форму — администратор создаёт новый тип. Принятый риск: любой рыбак может так «заморозить» условия нового типа, начав и бросив покупку (`07-security.md`).
- Статус организации при покупке читается в транзакции покупки, но без блокировки: блокировка организации, закоммиченная в те миллисекунды, пока идёт транзакция покупки, продажу не остановит. Принятый риск — заблокированная организация не продаёт с ближайшей следующей покупки, проданное аннулируется (T-23).
- Таймаут оплаты раз в минуту ищет `Payment` по `status` и `createdAt` без индекса — на объёмах диплома это просмотр небольшой таблицы; частичный индекс `WHERE status = 'PENDING'` — кандидат для T-29 (изменение схемы).
- Запись уловов (T-18) — без изменения схемы. Синхронизация пакета, правка и удаление одного пользователя идут друг за другом: транзакция сначала берёт `pg_advisory_xact_lock(hashtextextended('catches:' || userId, 0))`, затем читает принятые уловы суток (удаление — сам улов) и пишет. Без этого два телефона, синхронизирующие одновременно, каждый видели бы старый реестр и вместе превышали лимит (проверено тестом: без блокировки 4 угря из 2 принято). Ключ, а не строка `User`: таблица принадлежит `UsersModule`, а `FOR UPDATE` строки ещё и мешал бы внешним ключам других таблиц. Совпадение хешей двух пользователей лишь заставит их ждать друг друга. Справочники (разрешения, правила, виды, водоёмы) читаются до транзакции — она держит одно соединение и не ждёт другие модули. Поэтому правка собирает новый улов из строки, прочитанной до блокировки, и пишет условно — `UPDATE … WHERE "updatedAt" = <прочитанное>`: если тот же улов успели изменить с другого телефона, правка начинается заново с новой строки (до 3 попыток), а не затирает чужое изменение старыми полями (тест одновременных `{ weightG }` и `{ kept }`; без условия одно из изменений терялось 3 раза из 3).
- Отклонённый улов хранится (`syncStatus = REJECTED`, `violations` — JSON `RuleViolation[]`, у принятого `NULL`): рыбак видит причину и, пока открыто окно BR-07, может поправить улов. Улов, синхронизированный уже после окна, остаётся отклонённым без правки и удаления (буквальный BR-07; см. ROADMAP T-21). В лимиты идут только принятые оставленные. `clientId` уникален глобально: повтор своего возвращает сохранённый результат, чужой → 400 без раскрытия владельца.
