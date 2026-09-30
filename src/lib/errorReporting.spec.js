import { classifyFailure, createErrorReport, createFundingError, reportFailure, sanitizeErrorReport } from './errorReporting';
import { errorMessages } from './errorMessages';

test.each([
  ['Timeout', 'busy'], ['Timed out waiting for receipt', 'unknownOutcome'],
  ['session/expired', 'signIn'], ['network request failed', 'connection'],
  ['account not deployed', 'setupRequired'], ['Contract execution reverted', 'actionFailed']
])('classifies %s into one player-facing message', (text, key) => {
  const notify = jest.fn();
  const error = new Error(text);
  expect(classifyFailure(error)).toBe(key);
  reportFailure(notify, error);
  reportFailure(notify, error);
  expect(notify).toHaveBeenCalledTimes(1);
  expect(notify.mock.calls[0][0].data.content).toBe(errorMessages[key]);
  expect(notify.mock.calls[0][0].data.report).toContain(text);
});

test.each([{ code: 4001 }, { code: 'ACTION_REJECTED' }, new Error('User rejected request'), { suppressTransactionFailure: true }])('cancellation and already handled funding failures stay silent: %p', error => {
  const notify = jest.fn();
  reportFailure(notify, error);
  expect(notify).not.toHaveBeenCalled();
});

test('diagnostics include causes and bigint amounts without credentials or circular failures', () => {
  const error = Object.assign(new Error('Unexpected failure'), {
    code: 42, amount: 123n, cause: new Error('Provider failed'),
    response: { status: 500, data: { message: 'Provider response', token: 'secret-token' }, config: { headers: { Authorization: 'Bearer secret' } } },
    privateKey: 'secret-key', signature: ['secret-signature']
  });
  error.circular = error;
  const report = createErrorReport(error, { action: 'Construct', transactionHash: '0xabc' });
  expect(report).toContain('Provider failed');
  expect(report).toContain('Provider response');
  expect(report).toContain('123');
  expect(report).toContain('0xabc');
  expect(report).toContain('[circular]');
  expect(report).not.toMatch(/secret-token|secret-key|secret-signature|Bearer secret/);
});

test('redacts credentials inside diagnostic URLs and bearer text', () => {
  expect(sanitizeErrorReport('https://rpc.test?api_key=secret&foo=bar Bearer abc')).toBe('https://rpc.test?api_key=[redacted]&foo=bar Bearer [redacted]');
});

test('funding recovery carries both the precise deficit and the full target in the original token', () => {
  const error = createFundingError(9007199254740993n, '0xETH', 9007199254741993n);
  expect(error.fundingRequirement).toEqual({ amount: '9007199254740993', token: '0xETH', total: '9007199254741993' });
  expect(error.additionalUSDCRequired).toBeUndefined();
});


test('recognizes Ready X timeouts wrapped in UNKNOWN_ERROR', () => {
  const error = new Error('An error occurred (UNKNOWN_ERROR)');
  error.cause = new Error('Timeout');
  expect(classifyFailure(error)).toBe('unknownOutcome');
  const notify = jest.fn();
  reportFailure(notify, error);
  expect(notify).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ content: errorMessages.unknownOutcome })
  }));
});
