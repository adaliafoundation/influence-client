export const isUnsupportedWalletDisconnectError = (error) => {
  const message = typeof error === 'string' ? error : error?.message;
  return (
    message === 'Unknown request type: wallet_disconnect' ||
    message?.includes('Unknown request type: wallet_disconnect')
  );
};
