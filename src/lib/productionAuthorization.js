import { Address, Authorization, Permission } from '@influenceth/sdk';

export const productionPermission = { process: Permission.IDS.RUN_PROCESS, extract: Permission.IDS.EXTRACT_RESOURCES, assemble: Permission.IDS.ASSEMBLE_SHIP };

export const productionChecks = ({ crew, kind, facility, origin, destination, deposit, completionTime }) => [
  ['can', [crew, kind === 'extract' ? deposit : origin, kind === 'extract' ? Permission.IDS.USE_DEPOSIT : Permission.IDS.REMOVE_PRODUCTS]],
  ['canUntil', [crew, facility, productionPermission[kind], completionTime]],
  ...(kind === 'assemble' ? [] : [['canUntil', [crew, destination, Permission.IDS.ADD_PRODUCTS, completionTime]]])
];

// Planned acquisitions must still match the fresh quote. Simulation verifies the
// complete lease/purchase + production transaction, including its payment.
export const acquisitionMatches = (decision, index, request, { lease, purchase }) => {
  if (decision.status !== 'denied') return false;
  const target = index === 0 ? request.deposit : request.facility;
  const entity = decision.entities?.find((item) => Authorization.sameEntity(item, target));
  if (!entity) return false;
  const controller = decision.entities.find((item) => Authorization.sameEntity(item, entity.Control?.controller));
  const recipient = controller?.Crew?.delegatedTo;
  if (index === 0 && request.kind === 'extract' && purchase) {
    return purchase.price != null && entity.PrivateSale?.amount != null && BigInt(entity.PrivateSale.amount) === BigInt(purchase.price)
      && !!recipient && !!purchase.recipient && Address.areEqual(recipient, purchase.recipient);
  }
  if (index === 1 && lease) {
    const policy = entity.PrepaidPolicies?.find((item) => item.permission === productionPermission[request.kind]);
    if (!policy || policy.rate == null || policy.initialTerm == null || lease.termPrice == null || !lease.recipient || !recipient || !Address.areEqual(recipient, lease.recipient)) return false;
    if (!Number.isSafeInteger(lease.term) || lease.term < policy.initialTerm
      || request.evaluationTime == null || request.completionTime == null
      || request.evaluationTime + lease.term < request.completionTime) return false;
    const price = (BigInt(policy.rate) * BigInt(lease.term) + 3599n) / 3600n;
    return price === BigInt(lease.termPrice);
  }
  return false;
};
