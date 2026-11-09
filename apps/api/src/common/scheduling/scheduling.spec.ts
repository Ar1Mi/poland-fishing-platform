import { schedulingImports } from './scheduling';

describe('schedulingImports', () => {
  it('registers the scheduler in development and production', () => {
    expect(schedulingImports({ NODE_ENV: 'production' })).toHaveLength(1);
    expect(schedulingImports({ NODE_ENV: 'development' })).toHaveLength(1);
    // NODE_ENV unset: the environment schema defaults it to production.
    expect(schedulingImports({})).toHaveLength(1);
  });

  it('leaves it out under NODE_ENV=test and in the OpenAPI export', () => {
    expect(schedulingImports({ NODE_ENV: 'test' })).toEqual([]);
    expect(schedulingImports({ NODE_ENV: 'production', OPENAPI_EXPORT: '1' })).toEqual([]);
  });
});
