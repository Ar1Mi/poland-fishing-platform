/**
 * Demo data of `SEED_DEMO=true` (docs/08-testing-and-infra.md → «Данные каталога»): the
 * setup of scenario Д done by hand for the MVP walk-through (docs/09-scenarios.md), the
 * end-to-end test and the defence. Organizations, waters and people are fictional; e-mails
 * are in the reserved `.test` domain. Every account logs in with SEED_DEMO_PASSWORD.
 */
import type {
  DiscountKind,
  OrgRole,
  OrganizationKind,
  WaterType,
} from '../src/generated/prisma/client';

/** Fixed v4-shaped ids: a second run finds the rows of the first one. */
const demoId = (group: number, n: number): string =>
  `de${String(group).padStart(6, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const DEMO_EMAIL_DOMAIN = 'lowisko.test';

type OrgKey = 'sielawa' | 'lipowy';
type WaterKey = 'srebrne' | 'narew' | 'lipowy';

export interface DemoOrganization {
  key: OrgKey;
  name: string;
  /** Valid checksum (isValidNip) in the 999 prefix, which no tax office issues. */
  nip: string;
  kind: OrganizationKind;
  contactEmail: string;
}

export const DEMO_ORGANIZATIONS: readonly DemoOrganization[] = [
  {
    key: 'sielawa',
    name: 'Koło PZW „Sielawa” (demo)',
    nip: '9990000008',
    kind: 'PZW',
    contactEmail: `kolo.sielawa@${DEMO_EMAIL_DOMAIN}`,
  },
  {
    key: 'lipowy',
    name: 'Gospodarstwo Rybackie „Lipowy Staw” (demo)',
    nip: '9990000014',
    kind: 'PRIVATE',
    contactEmail: `lipowy.staw@${DEMO_EMAIL_DOMAIN}`,
  },
];

export interface DemoWater {
  key: WaterKey;
  organization: OrgKey;
  name: string;
  type: WaterType;
  lat: number;
  lng: number;
  /** Source MANUAL: a catalogue import (RZGW, PZW) never matches these rows. */
  sourceRef: string;
}

export const DEMO_WATERS: readonly DemoWater[] = [
  {
    key: 'srebrne',
    organization: 'sielawa',
    name: 'Jezioro Srebrne',
    type: 'LAKE',
    lat: 52.4371,
    lng: 21.0447,
    sourceRef: 'DEMO-1',
  },
  {
    key: 'narew',
    organization: 'sielawa',
    name: 'Starorzecze Narwi',
    type: 'LAKE',
    lat: 52.5032,
    lng: 21.1869,
    sourceRef: 'DEMO-2',
  },
  {
    key: 'lipowy',
    organization: 'lipowy',
    name: 'Staw Lipowy',
    type: 'POND',
    lat: 52.1009,
    lng: 20.8108,
    sourceRef: 'DEMO-3',
  },
];

export const DEMO_WATER_DESCRIPTION = 'Łowisko demonstracyjne — dane przykładowe (SEED_DEMO).';

type UserKey =
  'superadmin' | 'adminSielawa' | 'adminLipowy' | 'inspector' | 'jan' | 'anna' | 'kacper';

export interface DemoUser {
  key: UserKey;
  email: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  anglerCardNo?: string;
  isSuperAdmin?: boolean;
  memberships?: readonly { organization: OrgKey; role: OrgRole }[];
}

export const DEMO_USERS: readonly DemoUser[] = [
  {
    key: 'superadmin',
    email: `superadmin@${DEMO_EMAIL_DOMAIN}`,
    firstName: 'Ewa',
    lastName: 'Wójcik',
    birthDate: '1980-02-11',
    isSuperAdmin: true,
  },
  {
    key: 'adminSielawa',
    email: `admin.sielawa@${DEMO_EMAIL_DOMAIN}`,
    firstName: 'Marek',
    lastName: 'Lewandowski',
    birthDate: '1971-11-23',
    memberships: [{ organization: 'sielawa', role: 'ORG_ADMIN' }],
  },
  {
    key: 'adminLipowy',
    email: `admin.lipowy@${DEMO_EMAIL_DOMAIN}`,
    firstName: 'Barbara',
    lastName: 'Kamińska',
    birthDate: '1976-05-30',
    memberships: [{ organization: 'lipowy', role: 'ORG_ADMIN' }],
  },
  {
    key: 'inspector',
    email: `straznik@${DEMO_EMAIL_DOMAIN}`,
    firstName: 'Piotr',
    lastName: 'Zieliński',
    birthDate: '1968-08-02',
    memberships: [{ organization: 'sielawa', role: 'INSPECTOR' }],
  },
  {
    // Angler with a season of catches in the register.
    key: 'jan',
    email: `jan.kowalski@${DEMO_EMAIL_DOMAIN}`,
    firstName: 'Jan',
    lastName: 'Kowalski',
    birthDate: '1985-06-14',
    anglerCardNo: 'MAZ/2014/0587',
  },
  {
    // Angler without permits: buys the first one (scenario A, the end-to-end test).
    key: 'anna',
    email: `anna.nowak@${DEMO_EMAIL_DOMAIN}`,
    firstName: 'Anna',
    lastName: 'Nowak',
    birthDate: '1992-09-03',
  },
  {
    // Under 16 (BR-08) until April 2028: may buy the junior permit.
    key: 'kacper',
    email: `kacper.wisniewski@${DEMO_EMAIL_DOMAIN}`,
    firstName: 'Kacper',
    lastName: 'Wiśniewski',
    birthDate: '2012-04-20',
  },
];

type PermitTypeKey =
  | 'sielawaDay'
  | 'sielawaWeek'
  | 'sielawaYear'
  | 'sielawaYearJunior'
  | 'lipowyDay'
  | 'lipowyDaySenior';

export interface DemoPermitType {
  key: PermitTypeKey;
  id: string;
  organization: OrgKey;
  name: string;
  durationDays: number;
  priceGrosze: number;
  discountKind: DiscountKind;
  waters: readonly WaterKey[];
}

export const DEMO_PERMIT_TYPES: readonly DemoPermitType[] = [
  {
    key: 'sielawaDay',
    id: demoId(3, 1),
    organization: 'sielawa',
    name: 'Dzienne',
    durationDays: 1,
    priceGrosze: 3000,
    discountKind: 'NONE',
    waters: ['srebrne', 'narew'],
  },
  {
    key: 'sielawaWeek',
    id: demoId(3, 2),
    organization: 'sielawa',
    name: 'Tygodniowe',
    durationDays: 7,
    priceGrosze: 9000,
    discountKind: 'NONE',
    waters: ['srebrne', 'narew'],
  },
  {
    key: 'sielawaYear',
    id: demoId(3, 3),
    organization: 'sielawa',
    name: 'Roczne',
    durationDays: 365,
    priceGrosze: 30000,
    discountKind: 'NONE',
    waters: ['srebrne', 'narew'],
  },
  {
    key: 'sielawaYearJunior',
    id: demoId(3, 4),
    organization: 'sielawa',
    name: 'Roczne — młodzież',
    durationDays: 365,
    priceGrosze: 15000,
    discountKind: 'JUNIOR',
    waters: ['srebrne', 'narew'],
  },
  {
    key: 'lipowyDay',
    id: demoId(3, 5),
    organization: 'lipowy',
    name: 'Dzienne',
    durationDays: 1,
    priceGrosze: 4000,
    discountKind: 'NONE',
    waters: ['lipowy'],
  },
  {
    key: 'lipowyDaySenior',
    id: demoId(3, 6),
    organization: 'lipowy',
    name: 'Dzienne — senior',
    durationDays: 1,
    priceGrosze: 2000,
    discountKind: 'SENIOR',
    waters: ['lipowy'],
  },
];

export interface DemoRule {
  latinName: string;
  /** The organization's own level, or one of its waters (general rules: reference-data.ts). */
  organization: OrgKey;
  water?: WaterKey;
  minLengthCm?: number;
  dailyLimitCount?: number;
  dailyLimitWeightG?: number;
}

// Regulamin rules of the fictional organizations (no external source): each level once, and
// stricter than the general rules of Dz.U. 2023 poz. 1373 so the merge (ADR-0008) shows.
export const DEMO_RULES: readonly DemoRule[] = [
  // No general rule for carp: the organization adds a size and a daily limit.
  { latinName: 'Cyprinus carpio', organization: 'sielawa', minLengthCm: 35, dailyLimitCount: 2 },
  // Pike: 50 cm on this water instead of the general 45 cm.
  { latinName: 'Esox lucius', organization: 'sielawa', water: 'srebrne', minLengthCm: 50 },
  // A weight limit (BR-05, BR-11) on the private pond.
  {
    latinName: 'Cyprinus carpio',
    organization: 'lipowy',
    water: 'lipowy',
    minLengthCm: 40,
    dailyLimitWeightG: 5000,
  },
];

export interface DemoPermit {
  id: string;
  /** Payment session of the FAKE provider that paid the permit. */
  paymentSessionId: string;
  holder: UserKey;
  type: PermitTypeKey;
  /** First valid day, counted back from the Warsaw date of the seed run. */
  startsDaysAgo: number;
}

export const DEMO_PERMITS: readonly DemoPermit[] = [
  {
    id: demoId(4, 1),
    paymentSessionId: demoId(5, 1),
    holder: 'jan',
    type: 'sielawaYear',
    startsDaysAgo: 30,
  },
  {
    id: demoId(4, 2),
    paymentSessionId: demoId(5, 2),
    holder: 'jan',
    type: 'lipowyDay',
    startsDaysAgo: 40,
  },
];

export interface DemoCatch {
  clientId: string;
  permit: string;
  water: WaterKey;
  latinName: string;
  daysAgo: number;
  /** Warsaw wall-clock time. */
  time: string;
  lengthCm: number;
  weightG: number | null;
  kept: boolean;
}

const catchOf = (n: number, fields: Omit<DemoCatch, 'clientId'>): DemoCatch => ({
  clientId: demoId(6, n),
  ...fields,
});

const [yearly, daily] = DEMO_PERMITS.map((permit) => permit.id) as [string, string];

/**
 * Jan's register. The seed does not store a verdict: each catch goes through validateCatch
 * on the day of the run, so a kept pike in its closed season comes out REJECTED as it would
 * from the app. The undersized pike and the third carp of a day are rejected in any season.
 */
export const DEMO_CATCHES: readonly DemoCatch[] = [
  catchOf(1, {
    permit: daily,
    water: 'lipowy',
    latinName: 'Cyprinus carpio',
    daysAgo: 40,
    time: '06:45',
    lengthCm: 55,
    weightG: 3200,
    kept: true,
  }),
  catchOf(2, {
    permit: daily,
    water: 'lipowy',
    latinName: 'Tinca tinca',
    daysAgo: 40,
    time: '08:10',
    lengthCm: 31,
    weightG: 450,
    kept: true,
  }),
  catchOf(3, {
    permit: yearly,
    water: 'srebrne',
    latinName: 'Perca fluviatilis',
    daysAgo: 6,
    time: '07:40',
    lengthCm: 24,
    weightG: 250,
    kept: true,
  }),
  catchOf(4, {
    permit: yearly,
    water: 'srebrne',
    latinName: 'Rutilus rutilus',
    daysAgo: 6,
    time: '08:15',
    lengthCm: 21,
    weightG: null,
    kept: false,
  }),
  catchOf(5, {
    permit: yearly,
    water: 'srebrne',
    latinName: 'Esox lucius',
    daysAgo: 5,
    time: '16:30',
    lengthCm: 48,
    weightG: 1100,
    kept: true,
  }),
  catchOf(6, {
    permit: yearly,
    water: 'srebrne',
    latinName: 'Esox lucius',
    daysAgo: 5,
    time: '17:05',
    lengthCm: 62,
    weightG: 2100,
    kept: true,
  }),
  catchOf(7, {
    permit: yearly,
    water: 'narew',
    latinName: 'Cyprinus carpio',
    daysAgo: 3,
    time: '06:50',
    lengthCm: 41,
    weightG: 1800,
    kept: true,
  }),
  catchOf(8, {
    permit: yearly,
    water: 'narew',
    latinName: 'Cyprinus carpio',
    daysAgo: 3,
    time: '07:30',
    lengthCm: 52,
    weightG: 2600,
    kept: true,
  }),
  catchOf(9, {
    permit: yearly,
    water: 'narew',
    latinName: 'Cyprinus carpio',
    daysAgo: 3,
    time: '09:10',
    lengthCm: 47,
    weightG: 2200,
    kept: true,
  }),
  catchOf(10, {
    permit: yearly,
    water: 'srebrne',
    latinName: 'Abramis brama',
    daysAgo: 1,
    time: '18:20',
    lengthCm: 38,
    weightG: 900,
    kept: true,
  }),
  catchOf(11, {
    permit: yearly,
    water: 'narew',
    latinName: 'Sander lucioperca',
    daysAgo: 1,
    time: '19:00',
    lengthCm: 51,
    weightG: null,
    kept: false,
  }),
];

/** The inspector met Jan on the morning of the third carp. */
export const DEMO_INSPECTION = {
  id: demoId(7, 1),
  permit: yearly,
  inspector: 'inspector' as const,
  daysAgo: 3,
  time: '09:40',
  result: 'VIOLATION' as const,
  notes: 'Trzeci karp tego dnia ponad limit koła — pouczenie.',
};
