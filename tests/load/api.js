// k6 load test of the API (NFR-01: p95 < 300 ms at 50 concurrent users, T-29).
// Started by `pnpm --filter web perf:load` (apps/web/perf/load.spec.ts): the E2E stack with the
// demo seed and 2000 imported waters, k6 in Docker. Report: apps/web/perf/report/.
//
// 50 users at once: 40 guests browse the catalogue (map viewport, the whole country, a card
// with its permit types and rules) and 10 logged-in anglers look at their permits and register
// and record a released catch. Each user pauses between steps like a person on a phone.
// Besides them, one super admin opens the whole catalogue now and then (`GET /admin/waters`,
// not paginated — measured, with its own limit: not a request of the 50 users of NFR-01).
/* global __ENV, crypto -- globals of the k6 runtime */
import { check, group, sleep } from 'k6';
import http from 'k6/http';

const API = __ENV.API_URL;
const PASSWORD = __ENV.DEMO_PASSWORD;
/** The angler of the demo seed with a yearly permit and catches (apps/api/prisma/demo-data.ts). */
const ANGLER = 'jan.kowalski@lowisko.test';
const SUPER_ADMIN = 'superadmin@lowisko.test';

/** The viewport of the catalogue on a phone around Warsaw, and the whole of Poland. */
const BBOX_WARSAW = '20.6,51.9,21.5,52.6';
const BBOX_POLAND = '14.1,49.0,24.2,54.9';

/** Request names (`tags.name`): each gets its own p95 in the thresholds and the report. */
const ENDPOINTS = [
  'GET /waters?bbox',
  'GET /waters?bbox (Poland)',
  'GET /permit-types/lowest-prices',
  'GET /waters/:id',
  'GET /waters/:id/rules',
  'GET /permit-types?waterId',
  'GET /me/permits',
  'GET /me/permits/:id/offline-bundle',
  'POST /catches/sync',
  'GET /me/catches',
];

export const options = {
  scenarios: {
    guests: {
      executor: 'ramping-vus',
      exec: 'guest',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 40 },
        { duration: '2m', target: 40 },
        { duration: '15s', target: 0 },
      ],
    },
    admin: {
      executor: 'constant-arrival-rate',
      exec: 'admin',
      rate: 1,
      timeUnit: '10s',
      duration: '2m',
      startTime: '30s',
      preAllocatedVUs: 1,
    },
    anglers: {
      executor: 'ramping-vus',
      exec: 'angler',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 },
        { duration: '2m', target: 10 },
        { duration: '15s', target: 0 },
      ],
    },
  },
  thresholds: {
    // NFR-01 per kind of user (all their requests together).
    'http_req_duration{scenario:guests}': ['p(95)<300'],
    'http_req_duration{scenario:anglers}': ['p(95)<300'],
    // The super admin's whole catalogue: a report figure, not NFR-01.
    'http_req_duration{name:GET /admin/waters}': ['p(95)<1000'],
    checks: ['rate>0.99'],
    // No 429 or 5xx: a rate limit would hide the server's real speed.
    http_req_failed: ['rate<0.01'],
    ...Object.fromEntries(
      ENDPOINTS.map((name) => [`http_req_duration{name:${name}}`, ['p(95)<300']]),
    ),
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

const json = { headers: { 'Content-Type': 'application/json' } };

export function setup() {
  const login = http.post(
    `${API}/auth/login`,
    JSON.stringify({ email: ANGLER, password: PASSWORD }),
    json,
  );
  check(login, { 'login 200': (r) => r.status === 200 });
  const token = login.json('accessToken');
  const auth = { headers: { Authorization: `Bearer ${token}` } };

  const permits = http.get(`${API}/me/permits`, auth).json();
  const permit = permits.find((p) => p.status === 'ACTIVE');
  if (!permit) throw new Error(`${ANGLER} has no active permit in the demo seed`);
  // A species without a closed season is not needed: released fish break no rule.
  const species = http.get(`${API}/species`).json();
  const waters = http.get(`${API}/waters?bbox=${BBOX_WARSAW}`).json().items;
  const adminLogin = http.post(
    `${API}/auth/login`,
    JSON.stringify({ email: SUPER_ADMIN, password: PASSWORD }),
    json,
  );
  check(adminLogin, { 'admin login 200': (r) => r.status === 200 });
  return {
    adminToken: adminLogin.json('accessToken'),
    token,
    permitId: permit.id,
    waterId: permit.waters[0].id,
    speciesId: species[0].id,
    cardIds: waters.slice(0, 50).map((w) => w.id),
  };
}

function pause() {
  sleep(1 + Math.random() * 2);
}

export function guest(data) {
  group('catalogue', () => {
    const viewport = http.get(`${API}/waters?bbox=${BBOX_WARSAW}`, {
      tags: { name: 'GET /waters?bbox' },
    });
    check(viewport, { 'waters 200': (r) => r.status === 200 });
    const ids = viewport
      .json('items')
      .slice(0, 20)
      .map((w) => w.id);
    const prices = http.get(`${API}/permit-types/lowest-prices?waterIds=${ids.join(',')}`, {
      tags: { name: 'GET /permit-types/lowest-prices' },
    });
    check(prices, { 'prices 200': (r) => r.status === 200 });
    pause();
    // The whole country: the largest answer of the catalogue (up to WATERS_LIST_LIMIT).
    const country = http.get(`${API}/waters?bbox=${BBOX_POLAND}`, {
      tags: { name: 'GET /waters?bbox (Poland)' },
    });
    check(country, { 'waters of Poland 200': (r) => r.status === 200 });
    pause();
  });
  group('water card', () => {
    const id = data.cardIds[Math.floor(Math.random() * data.cardIds.length)];
    const card = http.get(`${API}/waters/${id}`, { tags: { name: 'GET /waters/:id' } });
    check(card, { 'card 200': (r) => r.status === 200 });
    const rules = http.get(`${API}/waters/${id}/rules`, {
      tags: { name: 'GET /waters/:id/rules' },
    });
    check(rules, { 'rules 200': (r) => r.status === 200 });
    const types = http.get(`${API}/permit-types?waterId=${id}`, {
      tags: { name: 'GET /permit-types?waterId' },
    });
    check(types, { 'types 200': (r) => r.status === 200 });
    pause();
  });
}

export function angler(data) {
  const auth = { headers: { Authorization: `Bearer ${data.token}` } };
  group('my permits', () => {
    const permits = http.get(`${API}/me/permits`, { ...auth, tags: { name: 'GET /me/permits' } });
    check(permits, { 'permits 200': (r) => r.status === 200 });
    const bundle = http.get(`${API}/me/permits/${data.permitId}/offline-bundle`, {
      ...auth,
      tags: { name: 'GET /me/permits/:id/offline-bundle' },
    });
    check(bundle, { 'bundle 200': (r) => r.status === 200 });
    pause();
  });
  group('register', () => {
    const sync = http.post(
      `${API}/catches/sync`,
      JSON.stringify({
        items: [
          {
            clientId: crypto.randomUUID(),
            permitId: data.permitId,
            externalPermitId: null,
            fishingWaterId: data.waterId,
            speciesId: data.speciesId,
            caughtAt: new Date().toISOString(),
            lengthCm: 20,
            weightG: null,
            kept: false,
            lat: null,
            lng: null,
          },
        ],
      }),
      {
        headers: { ...auth.headers, 'Content-Type': 'application/json' },
        tags: { name: 'POST /catches/sync' },
      },
    );
    check(sync, { 'sync 200': (r) => r.status === 200 });
    const catches = http.get(`${API}/me/catches`, { ...auth, tags: { name: 'GET /me/catches' } });
    check(catches, { 'catches 200': (r) => r.status === 200 });
    pause();
  });
}

export function admin(data) {
  const all = http.get(`${API}/admin/waters`, {
    headers: { Authorization: `Bearer ${data.adminToken}` },
    tags: { name: 'GET /admin/waters' },
  });
  check(all, { 'admin waters 200': (r) => r.status === 200 });
}

/** Per-endpoint p95 next to the totals: the table of the report (docs/thesis-log.md). */
export function handleSummary(data) {
  const rows = [...ENDPOINTS, 'GET /admin/waters'].map((endpoint) => {
    const v = data.metrics[`http_req_duration{name:${endpoint}}`].values;
    return `| ${endpoint} | ${v.med.toFixed(1)} | ${v['p(95)'].toFixed(1)} | ${v.max.toFixed(1)} |`;
  });
  const p95 = (scenario) =>
    data.metrics[`http_req_duration{scenario:${scenario}}`].values['p(95)'].toFixed(1);
  const md = [
    '# k6: API under 50 concurrent users',
    '',
    `Requests: ${data.metrics.http_reqs.values.count}, failed: ${(data.metrics.http_req_failed.values.rate * 100).toFixed(2)} %; p95 of guests ${p95('guests')} ms, of anglers ${p95('anglers')} ms (NFR-01: < 300 ms).`,
    '',
    '| Endpoint | Median, ms | p95, ms | Max, ms |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
  return {
    stdout: md,
    '/load/report/k6-summary.json': JSON.stringify(data, null, 2),
    '/load/report/k6-summary.md': md,
  };
}
