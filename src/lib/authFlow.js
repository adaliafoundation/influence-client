export const AUTH_PHASES = {
  IDLE: 'idle',
  CONNECTING_WALLET: 'connecting_wallet',
  RECONNECTING_WALLET: 'reconnecting_wallet',
  VERIFYING_WALLET: 'verifying_wallet',
  SIGNING_IN: 'signing_in',
  PREPARING_SESSION: 'preparing_session',
  AUTHENTICATED: 'authenticated',
  FAILED: 'failed'
};

const authPhaseLabels = {
  [AUTH_PHASES.CONNECTING_WALLET]: 'Connecting wallet',
  [AUTH_PHASES.RECONNECTING_WALLET]: 'Reconnecting wallet',
  [AUTH_PHASES.VERIFYING_WALLET]: 'Verifying wallet',
  [AUTH_PHASES.SIGNING_IN]: 'Signing in',
  [AUTH_PHASES.PREPARING_SESSION]: 'Preparing session',
  [AUTH_PHASES.AUTHENTICATED]: 'Logged in',
  [AUTH_PHASES.FAILED]: 'Login failed',
  [AUTH_PHASES.IDLE]: 'Log in'
};

export const getAuthPhaseLabel = (phase) => {
  return authPhaseLabels[phase] || authPhaseLabels[AUTH_PHASES.IDLE];
};

export const getReconnectMessage = ({ phase, walletName }) => {
  const target = walletName || 'your Starknet wallet';

  switch (phase) {
    case AUTH_PHASES.VERIFYING_WALLET:
      return `Verifying ${target}...`;
    case AUTH_PHASES.SIGNING_IN:
      return 'Signing in to Influence...';
    case AUTH_PHASES.PREPARING_SESSION:
      return 'Preparing secure session...';
    case AUTH_PHASES.FAILED:
      return 'Login failed. Please try again.';
    case AUTH_PHASES.CONNECTING_WALLET:
    case AUTH_PHASES.RECONNECTING_WALLET:
    default:
      return `Reconnecting to ${target}...`;
  }
};
