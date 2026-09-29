import { AUTHORIZATION_COMPONENTS, loadAuthorization, readPolicy } from './authorization';
import { Address, Authorization, Entity } from '@influenceth/sdk';

export const PERMISSION_COMPONENTS = [...AUTHORIZATION_COMPONENTS, 'UseLot'];

export const sameEntity = Authorization.sameEntity;
export const sameAccount = (a, b) => !!a && !!b && Address.areEqual(a, b);
export const checkingLotUsage = { status: 'checking', reason: 'Checking USE_LOT permission' };

export const prepaidPermissionEnd = (agreement) => Math.max(
  Number(agreement.endTime || 0), Number(agreement.noticeTime || 0) + Number(agreement.noticePeriod || 0)
);

export const resolveLotUsage = async ({ lot, asteroid, crew, blockTime, loadCrew, checkPolicy }) => {
  const entities = [lot, asteroid, crew].filter(Boolean);
  const result = await loadAuthorization({
    entities, blockTime, method: 'lotUsage', args: [crew, lot],
    api: { getEntityById: (entity) => entity.label === Entity.IDS.CREW ? loadCrew(entity.id) : Promise.resolve(entities.find((e) => sameEntity(e, entity))) },
    checkPolicy: async (request) => {
      const allowed = await checkPolicy({ address: request.address }, request.target, request.permitted, request.permission);
      return typeof allowed === 'boolean' ? { status: 'resolved', allowed } : { status: 'failed' };
    }
  });
  return { status: result.status === 'unresolved' ? 'checking' : result.status === 'denied' ? 'blocked' : 'allowed',
    reason: result.status === 'unresolved' ? 'Checking USE_LOT permission' : result.status === 'allowed' ? null
      : result.reason === 'active-tenant-precedence' ? 'Another crew holds active tenancy' : 'USE_LOT permission required' };
};

export const checkContractPolicy = async (provider, agreement, target, permitted, permission, blockNumber) => {
  const result = await readPolicy(provider, { address: agreement.address, target, permitted, permission }, blockNumber);
  return result.status === 'resolved' ? result.allowed : null;
};
