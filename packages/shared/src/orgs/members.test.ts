import { describe, expect, it } from 'vitest';
import { invitationSchema, memberRolesSchema } from './members.js';

describe('invitationSchema', () => {
  it('trims the address and takes either organization role', () => {
    expect(invitationSchema.parse({ email: ' straznik@example.com ', role: 'INSPECTOR' })).toEqual({
      email: 'straznik@example.com',
      role: 'INSPECTOR',
    });
    expect(invitationSchema.safeParse({ email: 'a@example.com', role: 'ORG_ADMIN' }).success).toBe(
      true,
    );
  });

  it('refuses a malformed address and an unknown role', () => {
    expect(invitationSchema.safeParse({ email: 'straznik', role: 'INSPECTOR' }).success).toBe(
      false,
    );
    expect(invitationSchema.safeParse({ email: 'a@example.com', role: 'ANGLER' }).success).toBe(
      false,
    );
  });
});

describe('memberRolesSchema', () => {
  it('accepts one or both roles', () => {
    expect(memberRolesSchema.safeParse({ roles: ['INSPECTOR'] }).success).toBe(true);
    expect(memberRolesSchema.safeParse({ roles: ['ORG_ADMIN', 'INSPECTOR'] }).success).toBe(true);
  });

  it('refuses no roles and a repeated role', () => {
    expect(memberRolesSchema.safeParse({ roles: [] }).success).toBe(false);
    expect(memberRolesSchema.safeParse({ roles: ['INSPECTOR', 'INSPECTOR'] }).success).toBe(false);
  });
});
