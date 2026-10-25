/**
 * Prefix of every API route (docs/05-api.md). In a file of its own: a module that builds a
 * URL of the API imports it without app.setup, whose imports would load the logging setup
 * before LoggingModule is declared.
 */
export const GLOBAL_PREFIX = 'api/v1';
