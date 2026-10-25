import { pruneBridgeTransfers } from '../bridge/transfers';

// Persist user choices and ongoing account work, never scene or navigation state.
const persistedKeys = [
  'isNew', 'objectivePreferences',
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

const assetSearchSettingKeys = ['highlight', 'sort'];

const pick = (state, keys) => Object.fromEntries(
  keys.filter((key) => Object.prototype.hasOwnProperty.call(state, key))
    .map((key) => [key, state[key]])
);

const pickAssetSearch = (assetSearch = {}) => Object.fromEntries(
  Object.entries(assetSearch)
    .map(([assetType, settings]) => [assetType, pick(settings, assetSearchSettingKeys)])
    .filter(([, settings]) => Object.keys(settings).length > 0)
);

export const selectPersistedState = (state = {}) => ({
  ...pick(state, persistedKeys),
  ...(state.assetSearch ? { assetSearch: pickAssetSearch(state.assetSearch) } : {}),
  ...(state.bridgeTransfers ? { bridgeTransfers: pruneBridgeTransfers(state.bridgeTransfers) } : {}),
  ...(state.graphics ? { graphics: pick(state.graphics, graphicsKeys) } : {})
});
