import { pruneBridgeTransfers } from '../bridge/transfers';

// Persist user choices and ongoing account work, never scene or navigation state.
const persistedKeys = [
  'isNew', 'missionParticipation', 'objectivePreferences',
  'simulation', 'crewTutorials', 'hasSeenIntroVideo',
  'currentSession', 'sessions', 'lastConnectedWalletId', 'selectedCrewId',
  'crewAssignments', 'chatHistory', 'dmPrivateKey',
  'bridgeTransfers', 'activeFundingIntentId', 'fundingIntents',
  'starterPackCheckout', 'starterPackCustomizationDrafts',
  'crewmatePurchaseCheckout', 'crewmatePurchaseDrafts',
  'hiddenActionItems', 'perProcessLeases',
  'gameplay', 'sounds', 'pendingTransactions', 'failedTransactions', 'paidFeeAcknowledgements'
];

const graphicsKeys = [
  'autodetect', 'fov', 'lensflare', 'pixelRatio', 'skybox', 'bloomResolutionScale',
  'enablePostprocessing', 'frameRateCap', 'shadowQuality', 'textureQuality'
];

const pick = (state, keys) => Object.fromEntries(
  keys.filter((key) => Object.prototype.hasOwnProperty.call(state, key))
    .map((key) => [key, state[key]])
);

export const selectPersistedState = (state = {}) => ({
  ...pick(state, persistedKeys),
  ...(state.bridgeTransfers ? { bridgeTransfers: pruneBridgeTransfers(state.bridgeTransfers) } : {}),
  ...(state.graphics ? { graphics: pick(state.graphics, graphicsKeys) } : {})
});
