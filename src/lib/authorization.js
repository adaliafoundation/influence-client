import { Address, Authorization, Entity, Time } from '@influenceth/sdk';

export const AUTHORIZATION_COMPONENTS = ['Control', 'PublicPolicy', 'WhitelistAgreement', 'WhitelistAccountAgreement', 'PrepaidAgreement', 'PrepaidPolicy', 'ContractAgreement', 'Location'];
const entityComponents = { [Entity.IDS.CREW]: ['Crew', 'Ship'], [Entity.IDS.LOT]: ['UseLot'], [Entity.IDS.BUILDING]: ['Building', 'Dock'], [Entity.IDS.SHIP]: ['Ship'], [Entity.IDS.DEPOSIT]: ['Deposit', 'PrivateSale'] };

export const checkingAuthorization = { status: 'unresolved', reason: 'Checking permissions', requirements: [] };
export const entityKey = (entity) => `${entity.label}:${BigInt(entity.id)}`;

// Agreement presentation must keep the entity and account key domains distinct.
export const matchesCrewPermissionSubject = (permitted, crew) => {
  if (permitted == null || !crew) return false;
  return typeof permitted === 'object' ? Authorization.sameEntity(permitted, crew)
    : !!crew.Crew?.delegatedTo && Address.areEqual(permitted, crew.Crew.delegatedTo);
};

// API component projections preserve absent (null) versus unloaded (undefined).
// UseLot is exposed by the API as { tenant }, whereas the SDK takes the tenant itself.
export const normalizeAuthorizationEntity = (entity) => {
  if (!entity) return entity;
  entity = entity._permissionTargets?.lot || entity;
  const normalized = { ...entity };
  if (entity.UseLot && Object.prototype.hasOwnProperty.call(entity.UseLot, 'tenant')) normalized.UseLot = entity.UseLot.tenant;
  return normalized;
};

export const evaluateAuthorization = ({ entities = [], blockTime, policyResults = {}, method = 'can', args = [] }) => {
  if (args.some((arg) => arg == null)) return checkingAuthorization;
  const records = new Map(entities.filter((entity) => entity?.id != null && entity?.label != null).map((entity) => [entityKey(entity), normalizeAuthorizationEntity(entity)]));
  return Authorization.create({ entities: [...records.values()], evaluationTime: blockTime, policyResults })[method](...args);
};

export const readPolicy = async (provider, request, blockNumber) => {
  if (!provider || blockNumber == null) return { status: 'failed' };
  try {
    const response = await provider.callContract({
      contractAddress: request.address,
      entrypoint: 'can',
      calldata: [request.target.label, request.target.id, request.permission, request.permitted.label, request.permitted.id].map(String)
    }, blockNumber);
    if (response?.length !== 1 || ![0n, 1n].includes(BigInt(response[0]))) return { status: 'failed' };
    return { status: 'resolved', allowed: BigInt(response[0]) === 1n };
  } catch (error) {
    return { status: 'failed' };
  }
};

// One evaluation owns its policy responses; they are never reused across blocks or refreshes.
export const loadAuthorization = async ({ api, provider, method, args, entities = [], blockTime, blockNumber, fresh = false, checkPolicy }) => {
  const records = new Map(entities.filter((entity) => entity?.id != null && entity?.label != null).map((entity) => [entityKey(entity), normalizeAuthorizationEntity(entity)]));
  const loaded = new Set();
  const policies = {};
  const load = async (entity) => {
    const key = entityKey(entity);
    if (loaded.has(key)) return;
    loaded.add(key);
    const record = await api.getEntityById({ label: entity.label, id: entity.id, components: [...AUTHORIZATION_COMPONENTS, ...(entityComponents[entity.label] || [])] });
    records.set(key, record ? normalizeAuthorizationEntity(record) : { label: entity.label, id: entity.id });
  };
  try {
    if (fresh) await Promise.all([...records.values()].map(load));
    if (fresh && method === 'production' && args[0].duration != null) {
      const job = args[0];
      const crew = records.get(entityKey(job.crew));
      if (crew?.Crew?.readyAt == null || blockTime == null) return checkingAuthorization;
      args = [{ ...job, completionTime: Time.getProductionCompletionTime(blockTime, crew.Crew.readyAt, job.duration) }];
    }
    while (true) {
      const result = evaluateAuthorization({ entities: [...records.values()], blockTime, policyResults: policies, method, args });
      if (result.status !== 'unresolved') return { ...result, entities: [...records.values()], policyResults: policies };
      const request = result.requirements?.[0];
      if (request?.type === 'component' || request?.type === 'entity') {
        if (!request.entity?.id || loaded.has(entityKey(request.entity))) return result;
        await load(request.entity);
      } else if (request?.type === 'policy' && !policies[request.key]) {
        policies[request.key] = checkPolicy
          ? await checkPolicy(request)
          : await readPolicy(provider, request, blockNumber);
      } else return result;
    }
  } catch (error) {
    return { ...checkingAuthorization, reason: 'Unable to check permissions', error };
  }
};
