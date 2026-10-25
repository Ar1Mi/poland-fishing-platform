import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';

/** `<folder>/<uuid>.<ext>`: generated here, so a stored key never points outside the root. */
const KEY = /^[a-z][a-z0-9-]*\/[0-9a-f-]{36}\.[a-z0-9]{1,5}$/;

/**
 * Uploaded files (claim documents, later catch photos) on the local `uploads/` volume
 * (docs/03-architecture.md → «Файлы»). Callers keep only the key; names are random.
 */
@Injectable()
export class StorageService {
  private readonly root: string;

  constructor(config: ConfigService<Env, true>) {
    this.root = resolve(config.get('UPLOADS_DIR', { infer: true }));
  }

  /** Stores `content` under a new random key in `folder` and returns the key. */
  async save(folder: string, extension: string, content: Buffer): Promise<string> {
    const key = `${folder}/${randomUUID()}.${extension}`;
    const path = this.pathOf(key);
    await mkdir(dirname(path), { recursive: true });
    // `wx`: a key is never reused, so an existing file means something is wrong.
    await writeFile(path, content, { flag: 'wx' });
    return key;
  }

  async read(key: string): Promise<Buffer> {
    return readFile(this.pathOf(key));
  }

  /** Removing a missing file is not an error (cleanup after a failed insert). */
  async delete(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }

  private pathOf(key: string): string {
    if (!KEY.test(key)) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    return join(this.root, key);
  }
}
