import { rm } from 'node:fs/promises';

export default async function globalTeardown(): Promise<void> {
  await globalThis.__POSTGRES_CONTAINER__?.stop();
  if (process.env.TEST_UPLOADS_ROOT) {
    await rm(process.env.TEST_UPLOADS_ROOT, { recursive: true, force: true });
  }
}
