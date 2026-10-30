import { Authorization } from '@influenceth/sdk';
import { checkingAuthorization } from './authorization';

export const getOrderCancellationAuthorization = (crew, orderCrew, storageControl, exchangeControl) => {
  if (!crew || !orderCrew) return checkingAuthorization;
  if (Authorization.sameEntity(crew, orderCrew)) return { status: 'allowed', reason: 'order-creator' };
  if (storageControl.status !== 'denied') return storageControl;
  return exchangeControl;
};
