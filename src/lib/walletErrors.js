export const isUnsupportedWalletDisconnectError = (error) => {
  const message = typeof error === 'string' ? error : error?.message;
  return (
    message === 'Unknown request type: wallet_disconnect' ||
    message?.includes('Unknown request type: wallet_disconnect')
  );
};

// Ready can queue the request before its acknowledgement times out.
export const isWalletRequestTimeout = (error) => {
  if (error?.name !== 'WalletRPCError') return false;
  const seen = new Set();
  for (let cause = error; cause && !seen.has(cause); cause = cause.cause) {
    seen.add(cause);
    if (/timeout|timed out/i.test(cause.message || '')) return true;
  }
  return false;
};
