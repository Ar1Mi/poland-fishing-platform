import { DomainError } from '../../common/errors/domain-error';
import { validParameters } from './species-rules.service';

const none = {
  minLengthCm: null,
  closedFrom: null,
  closedTo: null,
  dailyLimitCount: null,
  dailyLimitWeightG: null,
};

const fieldsOf = (parameters: typeof none | object): unknown => {
  try {
    validParameters({ ...none, ...parameters });
  } catch (error) {
    return (error as DomainError).details;
  }
  throw new Error('Expected VALIDATION_FAILED');
};

describe('validParameters', () => {
  it('returns parameters that restrict something', () => {
    expect(validParameters({ ...none, dailyLimitCount: 0 })).toEqual({
      ...none,
      dailyLimitCount: 0,
    });
  });

  it('reports a rule that restricts nothing under `rule`', () => {
    expect(fieldsOf({})).toEqual({ fields: { rule: [expect.any(String)] } });
  });

  it('reports the missing end of a closed period', () => {
    expect(fieldsOf({ closedTo: '04-30' })).toEqual({
      fields: { closedFrom: [expect.any(String)] },
    });
  });

  it('throws a DomainError with VALIDATION_FAILED', () => {
    let error: unknown;
    try {
      validParameters(none);
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('VALIDATION_FAILED');
  });
});
