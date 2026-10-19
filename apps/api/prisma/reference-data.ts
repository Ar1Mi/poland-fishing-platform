/**
 * Species and general fishing rules (organizationId = null, fishingWaterId = null).
 *
 * Source: Rozporządzenie Ministra Rolnictwa i Rozwoju Wsi z dnia 12 lipca 2023 r.
 * w sprawie szczegółowych warunków ochrony i połowu ryb w powierzchniowych wodach
 * śródlądowych (Dz.U. 2023 poz. 1373), in force since 2023-07-27:
 * § 2 ust. 3 — daily limit, § 6 ust. 1 — minimum sizes, § 7 ust. 1 — closed periods.
 * Text: https://api.sejm.gov.pl/eli/acts/DU/2023/1373/text.html (checked 2026-10-18).
 *
 * Simplifications (docs/02-business-rules.md → «Общие правила в seed»):
 * - Where the regulation differs by river section, the strictest variant is used:
 *   the larger size and a closed period covering every variant. Organizations can
 *   only tighten a general rule, so a lenient value could never be corrected.
 * - Weekday fishing bans (łosoś, troć: § 7 ust. 1 pkt 6, 15) and the shortening of a
 *   period that starts or ends on a public holiday (§ 7 ust. 2) are not modelled.
 * - "Do końca lutego" is stored as 02-28; Feb 29 is closed whenever Feb 28 is
 *   (packages/shared isInClosedPeriod).
 * - Species without a size or period in the regulation (okoń, karp, leszcz, płoć)
 *   get no general rule.
 */

export interface SpeciesSeed {
  latinName: string;
  namePl: string;
  nameEn: string;
  nameRu: string;
  isProtected?: boolean;
  rule?: {
    minLengthCm?: number;
    closedFrom?: string;
    closedTo?: string;
    dailyLimitCount?: number;
  };
}

export const SPECIES: readonly SpeciesSeed[] = [
  {
    latinName: 'Esox lucius',
    namePl: 'Szczupak',
    nameEn: 'Northern pike',
    nameRu: 'Щука',
    rule: { minLengthCm: 45, closedFrom: '01-01', closedTo: '04-30' }, // § 6.1.18, § 7.1.13
  },
  {
    latinName: 'Sander lucioperca',
    namePl: 'Sandacz',
    nameEn: 'Zander',
    nameRu: 'Судак',
    rule: { minLengthCm: 45, closedFrom: '03-01', closedTo: '05-31' }, // § 6.1.14, § 7.1.9
  },
  {
    latinName: 'Silurus glanis',
    namePl: 'Sum',
    nameEn: 'Wels catfish',
    nameRu: 'Сом',
    rule: { minLengthCm: 70, closedFrom: '01-01', closedTo: '05-31' }, // § 6.1.17, § 7.1.12
  },
  {
    latinName: 'Leuciscus aspius',
    namePl: 'Boleń',
    nameEn: 'Asp',
    nameRu: 'Жерех',
    rule: { minLengthCm: 40 }, // § 6.1.1
  },
  {
    latinName: 'Barbus barbus',
    namePl: 'Brzana',
    nameEn: 'Barbel',
    nameRu: 'Усач',
    rule: { minLengthCm: 40, closedFrom: '01-01', closedTo: '06-30' }, // § 6.1.2, § 7.1.1
  },
  {
    latinName: 'Tinca tinca',
    namePl: 'Lin',
    nameEn: 'Tench',
    nameRu: 'Линь',
    rule: { minLengthCm: 25 }, // § 6.1.8
  },
  {
    latinName: 'Leuciscus idus',
    namePl: 'Jaź',
    nameEn: 'Ide',
    nameRu: 'Язь',
    rule: { minLengthCm: 25 }, // § 6.1.5
  },
  {
    latinName: 'Squalius cephalus',
    namePl: 'Kleń',
    nameEn: 'Chub',
    nameRu: 'Голавль',
    rule: { minLengthCm: 25 }, // § 6.1.7
  },
  {
    latinName: 'Scardinius erythrophthalmus',
    namePl: 'Wzdręga',
    nameEn: 'Rudd',
    nameRu: 'Краснопёрка',
    rule: { minLengthCm: 15 }, // § 6.1.23
  },
  {
    latinName: 'Anguilla anguilla',
    namePl: 'Węgorz',
    nameEn: 'European eel',
    nameRu: 'Угорь',
    // § 6.1.22, § 7.1.17, § 2.3 (amateur rod fishing: up to 2 a day)
    rule: { minLengthCm: 50, closedFrom: '12-01', closedTo: '03-31', dailyLimitCount: 2 },
  },
  {
    latinName: 'Salmo trutta m. fario',
    namePl: 'Pstrąg potokowy',
    nameEn: 'Brown trout',
    nameRu: 'Ручьевая форель',
    // § 6.1.12: 25 cm upper Vistula/San and upper Oder/Bystrzyca, 30 cm elsewhere.
    // § 7.1.8: 09-01…01-31 in the same sections, 09-01…12-31 elsewhere.
    rule: { minLengthCm: 30, closedFrom: '09-01', closedTo: '01-31' },
  },
  {
    latinName: 'Thymallus thymallus',
    namePl: 'Lipień',
    nameEn: 'Grayling',
    nameRu: 'Хариус',
    rule: { minLengthCm: 30, closedFrom: '03-01', closedTo: '05-31' }, // § 6.1.9, § 7.1.5
  },
  {
    latinName: 'Salmo trutta m. trutta',
    namePl: 'Troć wędrowna',
    nameEn: 'Sea trout',
    nameRu: 'Кумжа',
    // § 6.1.20; § 7.1.15: 10-01…12-31 (Vistula above Włocławek, other waters),
    // 12-01…end of February (Vistula below Włocławek) → union 10-01…02-28.
    rule: { minLengthCm: 35, closedFrom: '10-01', closedTo: '02-28' },
  },
  {
    latinName: 'Salmo salar',
    namePl: 'Łosoś',
    nameEn: 'Atlantic salmon',
    nameRu: 'Атлантический лосось',
    // § 6.1.10; § 7.1.6: same sections and periods as troć → union 10-01…02-28.
    rule: { minLengthCm: 35, closedFrom: '10-01', closedTo: '02-28' },
  },
  {
    latinName: 'Lota lota',
    namePl: 'Miętus',
    nameEn: 'Burbot',
    nameRu: 'Налим',
    // § 6.1.11: 30 cm in the lower Oder, 25 cm elsewhere.
    // § 7.1.7: 12-01…end of February except the lower Oder.
    rule: { minLengthCm: 30, closedFrom: '12-01', closedTo: '02-28' },
  },
  {
    latinName: 'Acipenser oxyrinchus',
    namePl: 'Jesiotr ostronosy',
    nameEn: 'Atlantic sturgeon',
    nameRu: 'Атлантический осётр',
    isProtected: true,
    rule: { closedFrom: '01-01', closedTo: '12-31' }, // § 7.1.4: closed all year
  },
  { latinName: 'Perca fluviatilis', namePl: 'Okoń', nameEn: 'European perch', nameRu: 'Окунь' },
  { latinName: 'Cyprinus carpio', namePl: 'Karp', nameEn: 'Common carp', nameRu: 'Карп' },
  { latinName: 'Abramis brama', namePl: 'Leszcz', nameEn: 'Common bream', nameRu: 'Лещ' },
  { latinName: 'Rutilus rutilus', namePl: 'Płoć', nameEn: 'Roach', nameRu: 'Плотва' },
];
