import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { StorageService } from './storage.service';

describe('StorageService', () => {
  let root: string;
  let storage: StorageService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'lowisko-storage-'));
    storage = new StorageService({ get: () => root } as unknown as ConfigService<Env, true>);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('saves under a random key in the folder and reads the content back', async () => {
    const key = await storage.save('claims', 'pdf', Buffer.from('%PDF-1.4'));

    expect(key).toMatch(/^claims\/[0-9a-f-]{36}\.pdf$/);
    expect(await readdir(join(root, 'claims'))).toEqual([key.slice('claims/'.length)]);
    expect((await storage.read(key)).toString()).toBe('%PDF-1.4');
  });

  it('gives two files of the same type different keys', async () => {
    const first = await storage.save('claims', 'png', Buffer.from('a'));
    const second = await storage.save('claims', 'png', Buffer.from('b'));

    expect(first).not.toBe(second);
  });

  it('deletes a file and ignores a missing one', async () => {
    const key = await storage.save('claims', 'pdf', Buffer.from('x'));

    await storage.delete(key);
    await storage.delete(key);

    await expect(storage.read(key)).rejects.toThrow();
  });

  it.each(['../secret.pdf', 'claims/../../etc/passwd', '/etc/passwd', 'claims/name.pdf'])(
    'refuses a key it could not have generated: %s',
    async (key) => {
      await expect(storage.read(key)).rejects.toThrow('Invalid storage key');
    },
  );
});
