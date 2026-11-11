import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { AuditedResponse, AuditInterceptor } from './audit.interceptor';
import type { AuditEntry, AuditService } from './audit.service';

const ENTRY = { action: 'CATCHES_EXPORTED', entity: 'Organization', entityId: 'org-1' };

function contextFor(user?: { id: string }): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

const handlerReturning = (value: unknown): CallHandler => ({ handle: () => of(value) });

describe('AuditInterceptor', () => {
  let recorded: AuditEntry[];
  let recordNow: jest.Mock<Promise<void>, [AuditEntry]>;
  let interceptor: AuditInterceptor;

  beforeEach(() => {
    recorded = [];
    recordNow = jest.fn((entry: AuditEntry) => {
      recorded.push(entry);
      return Promise.resolve();
    });
    interceptor = new AuditInterceptor({ recordNow } as unknown as AuditService);
  });

  it('records the entry with the token user as actor and answers with the body', async () => {
    const body = await firstValueFrom(
      interceptor.intercept(
        contextFor({ id: 'user-1' }),
        handlerReturning(new AuditedResponse({ ok: true }, { ...ENTRY, diff: { rows: 3 } })),
      ),
    );

    expect(body).toEqual({ ok: true });
    expect(recorded).toEqual([{ actorId: 'user-1', ...ENTRY, diff: { rows: 3 } }]);
  });

  it('fails the request without the body when the entry cannot be recorded', async () => {
    recordNow.mockRejectedValue(new Error('database down'));

    await expect(
      firstValueFrom(
        interceptor.intercept(
          contextFor({ id: 'user-1' }),
          handlerReturning(new AuditedResponse('secret file', ENTRY)),
        ),
      ),
    ).rejects.toThrow('database down');
  });

  it('refuses a handler that forgot to describe its entry', async () => {
    await expect(
      firstValueFrom(interceptor.intercept(contextFor({ id: 'user-1' }), handlerReturning('file'))),
    ).rejects.toThrow('must be authenticated and return an AuditedResponse');
    expect(recordNow).not.toHaveBeenCalled();
  });

  it('refuses a request without a user: an audit entry needs its actor', async () => {
    await expect(
      firstValueFrom(
        interceptor.intercept(contextFor(), handlerReturning(new AuditedResponse('file', ENTRY))),
      ),
    ).rejects.toThrow('must be authenticated');
  });
});
