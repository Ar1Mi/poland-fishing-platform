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
  organization      Organization? @relation(fields: [organizationId], references: [id])
  water             FishingWater? @relation(fields: [fishingWaterId], references: [id])

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
  externalPermit   ExternalPermit? @relation(fields: [externalPermitId], references: [id])
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

-- одна активная заявка на водоём от организации
CREATE UNIQUE INDEX claim_one_pending ON "WaterClaim" ("fishingWaterId", "organizationId") WHERE "status" = 'PENDING';
```

Все ограничения — в `apps/api/prisma/migrations/20261018095038_init/migration.sql`, каждое проверено тестом `apps/api/test/database-constraints.e2e-spec.ts`.

## Номер разрешения

`ZW-{YYYY}-{000001}`: своя последовательность PostgreSQL на каждый год (`permit_number_2026`, …). Её создаёт при первом номере года SQL-функция `next_permit_number(year)` из той же миграции; создание защищено `pg_advisory_xact_lock`, поэтому одновременные первые покупки года не падают на `CREATE SEQUENCE`. Блокировка берётся только пока последовательности нет. Год — по дате `Europe/Warsaw` (`PermitNumberService`, `ClockService`). Номер больше 999999 не обрезается (7 цифр). Пропуски номеров (откат транзакции) допустимы.

## Ключевые решения (для текста диплома)

- Деньги в грошах (`Int`) — нет ошибок округления float.
- `clientId` с устройства + unique — повторная синхронизация идемпотентна.
- `MM-DD` для okresu ochronnego — период повторяется ежегодно и может переходить через Новый год.
- Три уровня `SpeciesRule` в одной таблице — уровень определяется заполненностью внешних ключей.
- `source + sourceRef` unique — повторный импорт обновляет, а не дублирует.
- Одобрение claim — одна транзакция: `WaterClaim.APPROVED` + `FishingWater.organizationId` + `CONNECTED`; другие PENDING-заявки на этот водоём → `REJECTED`.
- Номер разрешения — последовательность PostgreSQL на год: `ZW-{YYYY}-{000001}` (см. «Номер разрешения»).
