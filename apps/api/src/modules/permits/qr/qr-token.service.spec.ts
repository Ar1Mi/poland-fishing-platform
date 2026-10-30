import type { ConfigService } from '@nestjs/config';
import { decodeJwt, decodeProtectedHeader, SignJWT } from 'jose';
import { createPrivateKey } from 'node:crypto';
import type { Env } from '../../../config/env';
import { generateQrKeyPair, type QrKeyPair } from './qr-keys';
import { QrTokenService } from './qr-token.service';

const PERMIT_ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';

function serviceWith(keys: QrKeyPair, now: () => Date): QrTokenService {
  const env: Partial<Env> = {
    QR_SIGNING_PRIVATE_KEY: keys.privateKey,
    QR_SIGNING_PUBLIC_KEY: keys.publicKey,
  };
  const config = { get: (key: keyof Env) => env[key] } as unknown as ConfigService<Env, true>;
  return new QrTokenService(config, { now });
}

describe('QrTokenService', () => {
  const keys = generateQrKeyPair();
  let now = new Date('2026-10-06T10:00:00Z');
  const service = serviceWith(keys, () => now);

  beforeEach(() => {
    now = new Date('2026-10-06T10:00:00Z');
  });

  it('signs { sub, exp } with EdDSA and nothing else', async () => {
    const token = await service.sign(PERMIT_ID, '2026-10-10');

    expect(decodeProtectedHeader(token)).toEqual({ alg: 'EdDSA' });
    expect(decodeJwt(token)).toEqual({
      sub: PERMIT_ID,
      exp: Date.parse('2026-10-10T22:00:00Z') / 1000,
    });
  });

  it('expires at the Warsaw midnight after the last valid day in winter', async () => {
    const token = await service.sign(PERMIT_ID, '2026-12-31');

    expect(decodeJwt(token).exp).toBe(Date.parse('2026-12-31T23:00:00Z') / 1000);
  });

  it('gives the same permit the same token every time', async () => {
    expect(await service.sign(PERMIT_ID, '2026-10-10')).toBe(
      await service.sign(PERMIT_ID, '2026-10-10'),
    );
  });

  it('accepts its own token until the end of the last valid day', async () => {
    const token = await service.sign(PERMIT_ID, '2026-10-10');

    now = new Date('2026-10-10T21:59:59Z');
    expect(await service.verify(token)).toBe(PERMIT_ID);
  });

  it('rejects the token from Warsaw midnight after the last valid day', async () => {
    const token = await service.sign(PERMIT_ID, '2026-10-10');

    now = new Date('2026-10-10T22:00:00Z');
    expect(await service.verify(token)).toBeNull();
  });

  it('rejects a token signed with another key', async () => {
    const forged = await serviceWith(generateQrKeyPair(), () => now).sign(PERMIT_ID, '2026-10-10');

    expect(await service.verify(forged)).toBeNull();
  });

  it('rejects a token whose payload was changed after signing', async () => {
    const [header, , signature] = (await service.sign(PERMIT_ID, '2026-10-10')).split('.');
    const payload = Buffer.from(
      JSON.stringify({ sub: '00000000-0000-4000-8000-000000000000', exp: 1_900_000_000 }),
    ).toString('base64url');

    expect(await service.verify(`${header}.${payload}.${signature}`)).toBeNull();
  });

  it('rejects a token without exp', async () => {
    const token = await new SignJWT()
      .setProtectedHeader({ alg: 'EdDSA' })
      .setSubject(PERMIT_ID)
      .sign(createPrivateKey(keys.privateKey));

    expect(await service.verify(token)).toBeNull();
  });

  it('rejects a token whose subject is not a permit id', async () => {
    const token = await new SignJWT()
      .setProtectedHeader({ alg: 'EdDSA' })
      .setSubject('admin')
      .setExpirationTime('1h')
      .sign(createPrivateKey(keys.privateKey));

    expect(await service.verify(token)).toBeNull();
  });

  it('rejects an unsigned token and garbage', async () => {
    const unsigned = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(
      JSON.stringify({ sub: PERMIT_ID, exp: 1_900_000_000 }),
    ).toString('base64url')}.`;

    expect(await service.verify(unsigned)).toBeNull();
    expect(await service.verify('not-a-token')).toBeNull();
  });
});
