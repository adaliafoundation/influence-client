import { errorMessages } from './errorMessages';

const reported = new WeakSet();
const privateField = /token|secret|password|private.?key|sessionDappKey|gameplaySession|authorization|cookie|signature|seed|mnemonic|headers|config|request/i;
const redactText = value => value
  .replace(/((?:private[_-]?key|secret|password|mnemonic|access[_-]?token|sessionDappKey)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi, '$1[redacted]')
  .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [redacted]')
  .replace(/([?&](?:token|key|api_key|access_token|signature)=)[^&#\s]+/gi, '$1[redacted]');

export const sanitizeErrorReport = (value, seen = new WeakSet()) => {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string') return redactText(value);
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map(item => sanitizeErrorReport(item, seen));
  const fields = value instanceof Error
    ? { ...value, name: value.name, message: value.message, stack: value.stack, cause: value.cause }
    : value;
  return Object.fromEntries(Object.entries(fields).map(([key, item]) => [key,
    privateField.test(key) ? '[redacted]' : sanitizeErrorReport(item, seen)]));
};

export const createErrorReport = (error, context = {}) => JSON.stringify(sanitizeErrorReport({
  timestamp: new Date().toISOString(), error, context,
  userAgent: typeof navigator === 'undefined' ? undefined : navigator.userAgent
}), null, 2);

export const isUserCancellation = error => [4001, '4001', 'ACTION_REJECTED', 'USER_CANCELLED_AUTH_FLOW', 'user_rejected', 'exited_auth_flow'].includes(error?.code)
  || /USER_REFUSED_OP|User abort|User rejected|User cancel[le]*d|Login cancel[le]*d|User closed modal/i.test(error?.message || '')
  || error?.name === 'UserRejectedRequestError';

export const classifyFailure = error => {
  const knownMessage = Object.keys(errorMessages).find(key => typeof errorMessages[key] === 'string' && errorMessages[key] === error?.userMessage);
  if (knownMessage) return knownMessage;
  const message = error?.message || '';
  if (/session expired|session\/(expired|revoked)/i.test(message)) return 'signIn';
  if (message === 'Timeout') return 'busy';
  if (/timeout|timed out/i.test(message)) return 'unknownOutcome';
  if (/account not deployed|account is not compatible with snip-9/i.test(message)) return 'setupRequired';
  if (/disconnect|network|fetch failed/i.test(message)) return 'connection';
  return 'actionFailed';
};

// Callers may propagate an error after reporting it. The same error is displayed once.
export const reportFailure = (notify, error, { message = classifyFailure(error), context = {} } = {}) => {
  if (error?.suppressTransactionFailure || isUserCancellation(error)) return;
  if (error && typeof error === 'object') {
    if (reported.has(error)) return;
    reported.add(error);
  }
  notify({ type: 'GenericAlert', level: 'warning', duration: 10000,
    data: { content: errorMessages[message], report: createErrorReport(error, context) } });
};

export const createFundingError = (amount, token, total) => Object.assign(new Error('Purchase funding required'), {
  fundingRequirement: { amount: BigInt(amount).toString(), token, total: BigInt(total).toString() }
});
