import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  UseInterceptors,
} from '@nestjs/common';
import { mergeMap, type Observable } from 'rxjs';
import type { AuthenticatedRequest } from '../auth/decorators/auth.decorators';
import { type AuditEntry, AuditService } from './audit.service';

/** What an `@Audit()` route returns: the response body and the entry that describes it. */
export class AuditedResponse<T> {
  constructor(
    readonly body: T,
    readonly entry: Omit<AuditEntry, 'actorId'>,
  ) {}
}

/**
 * Records the entry of an `@Audit()` route after its handler has succeeded and before the
 * response leaves: a failed record fails the request (500), so a CSV export never reaches the
 * admin without its entry. The actor is the user of the access token. For actions without a
 * transaction of their own; an action with one records inside it (`AuditService.record`).
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return next.handle().pipe(
      mergeMap(async (result: unknown) => {
        if (!(result instanceof AuditedResponse) || !user) {
          throw new Error('An @Audit() route must be authenticated and return an AuditedResponse');
        }
        await this.audit.recordNow({ actorId: user.id, ...result.entry });
        return result.body as unknown;
      }),
    );
  }
}

/** The route's handler returns `AuditedResponse`; its entry goes to `AuditLog` (T-26). */
export const Audit = (): MethodDecorator & ClassDecorator => UseInterceptors(AuditInterceptor);
