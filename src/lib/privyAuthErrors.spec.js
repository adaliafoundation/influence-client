const {
  createAuthFlowCancellationError,
  isAuthFlowCancellation,
  normalizeAuthFlowError
} = require('./privyAuthErrors');

test('recognizes auth flow exits as cancellation', () => {
  expect(isAuthFlowCancellation({ error: 'exited_auth_flow' })).toBe(true);
  expect(isAuthFlowCancellation({ code: 'user_closed_modal' })).toBe(true);
  expect(isAuthFlowCancellation(new Error('User rejected request'))).toBe(true);
  expect(isAuthFlowCancellation({ name: 'UserRejectedRequestError' })).toBe(true);
  expect(isAuthFlowCancellation(new Error('network failed'))).toBe(false);
});

test('normalizes auth flow exits as login cancellation', () => {
  const cause = { error: 'exited_auth_flow' };
  const error = createAuthFlowCancellationError(cause);

  expect(error.message).toBe('Login cancelled');
  expect(error.code).toBe('USER_CANCELLED_AUTH_FLOW');
  expect(error.cause).toBe(cause);
});

test('leaves real auth flow errors visible', () => {
  const error = new Error('network failed');

  expect(normalizeAuthFlowError(error)).toBe(error);
  expect(normalizeAuthFlowError('network failed')).toEqual(new Error('network failed'));
});
