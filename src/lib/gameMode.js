import { appConfig } from '~/appConfig';

export const getGameMode = () => {
  try {
    return appConfig.get('GameMode') || 'chain';
  } catch (e) {
    return 'chain';
  }
};

export const isHybrid = () => getGameMode() === 'hybrid';
export const isChain = () => getGameMode() === 'chain';
