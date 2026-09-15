const AUTH_CANCELLATION_CODES = new Set([
  'exited_auth_flow',
  'user_rejected',
  'user_cancelled',
  'user_canceled',
  'user_closed_modal'
]);

const AUTH_CANCELLATION_MESSAGES = new Set([
  'Login cancelled',
  'User rejected request',
  'User rejected',
  'User abort',
  'User cancelled',
  'User canceled',
  'User closed modal'
]);

export const isAuthFlowCancellation = (error) => {
  const code = error?.error || error?.code;
  const message = typeof error === 'string' ? error : error?.message;

  return (
    AUTH_CANCELLATION_CODES.has(code)
    || AUTH_CANCELLATION_CODES.has(message)
    || AUTH_CANCELLATION_MESSAGES.has(message)
    || error?.name === 'UserRejectedRequestError'
    || error?.name === 'UserNotConnectedError'
  );
};

export const createAuthFlowCancellationError = (cause) => {
  const error = new Error('Login cancelled');
  error.code = 'USER_CANCELLED_AUTH_FLOW';
  error.cause = cause;
  return error;
};

export const normalizeAuthFlowError = (error) => {
  if (isAuthFlowCancellation(error)) return createAuthFlowCancellationError(error);
  return error instanceof Error ? error : new Error(String(error));
};
