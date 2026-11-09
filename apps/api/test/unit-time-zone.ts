/**
 * Jest globalSetup of the unit tests (package.json): they run in a zone behind UTC. A calendar
 * day read at UTC midnight shows the day before there, so code that formats or compares dates in
 * the process zone instead of an explicit one fails here — CI runs in UTC and developers in
 * Warsaw, where such a bug stays hidden. Set before the workers start, so they inherit it; a test
 * cannot set it itself (Jest gives each test file its own copy of process.env).
 */
export default function useZoneBehindUtc(): void {
  process.env.TZ = 'America/New_York';
}
