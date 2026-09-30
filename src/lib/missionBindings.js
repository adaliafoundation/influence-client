import { errorMessages } from './errorMessages';
import { Building, Entity, Product, StarterMission } from '@influenceth/sdk';

export const missionBindingKey = (chainId, apiUrl, { campaign, subject, kind, entity, slot }) => [
  'missionBindings', chainId, apiUrl, String(campaign), String(Entity.packEntity(subject)),
  kind, String(Entity.packEntity(entity)), slot == null ? null : Number(slot)
];

export const missionBindingUrl = ({ campaign, subject, kind, entity, slot }) => {
  const path = `/v2/missions/campaigns/${encodeURIComponent(campaign)}/subjects/${Entity.packEntity(subject)}`
    + `/bindings/${kind}/${Entity.packEntity(entity)}`;
  return slot == null ? path : `${path}?slot=${Number(slot)}`;
};

export const bindingUnavailableMessage = (binding) => {
  if (binding?.status === 'unknown') {
    return binding.reason === 'processor_not_running'
      ? 'The processor has stopped; campaign completion is still being reconciled. Retry shortly.'
      : 'Campaign verification is unavailable while action data is being indexed. Retry shortly.';
  }
  if (binding?.status === 'mismatched') return 'This action no longer matches its recorded campaign binding.';
  if (binding?.status === 'unbound') return 'This action has no indexed campaign binding yet.';
  return errorMessages.missionUnavailable;
};

// Mission evidence belongs to the campaign and crew, not to an individual objective.
export const MISSION_ACTIONS = {
  ConstructionPlan: {},
  ConstructionStart: {},
  ConstructionFinish: { binding: 'Built', target: 'building' },
  SampleDepositStart: {},
  SampleDepositFinish: { binding: 'Sample', target: 'deposit' },
  ExtractResourceStart: { constructed: true, target: 'extractor' },
  FlexibleExtractResourceStart: { constructed: true, target: 'extractor' },
  ExtractResourceFinish: { constructed: true, binding: 'Extraction', target: 'extractor', slot: 'extractor_slot' },
  ProcessProductsStart: { constructed: true, target: 'processor' },
  LeaseAndProcessProductsStart: { constructed: true, target: 'processor' },
  ProcessProductsFinish: { constructed: true, binding: 'Process', target: 'processor', slot: 'processor_slot' },
  SendDelivery: {},
  ReceiveDelivery: { binding: 'Delivery', target: 'delivery' },
  ResupplyFood: {}
};

// Dialog adapters describe targets once per action type, independently of mission IDs.
export const MISSION_DIALOGS = {
  PLAN_BUILDING: [],
  CONSTRUCT: [{ kind: 'Built', target: 'building' }],
  NEW_CORE_SAMPLE: [{ kind: 'Sample', target: 'deposit' }],
  EXTRACT_RESOURCE: [{ kind: 'Extraction', target: 'building', slot: 1 }, { kind: 'Built', target: 'building' }],
  PROCESS: [{ kind: 'Process', target: 'building', slotParam: 'processorSlot' }, { kind: 'Built', target: 'building' }],
  SURFACE_TRANSFER: [{ kind: 'Delivery', target: 'delivery' }],
  TRANSFER_TO_SITE: [],
  FEED_CREW: []
};

export const getMissionDialogBindings = ({ type, params = {}, buildingId, deliveryId }) => {
  const targets = {
    building: buildingId && { label: Entity.IDS.BUILDING, id: buildingId },
    deposit: params.sampleId && { label: Entity.IDS.DEPOSIT, id: params.sampleId },
    delivery: (params.deliveryId || deliveryId) && { label: Entity.IDS.DELIVERY, id: params.deliveryId || deliveryId }
  };
  return MISSION_DIALOGS[type].flatMap(({ kind, target, slot, slotParam }) => {
    const entity = targets[target];
    const actionSlot = slotParam ? params[slotParam] : slot;
    if (!entity || (slotParam && actionSlot == null)) return [];
    return [{ kind, entity, ...(actionSlot == null ? {} : { slot: actionSlot }) }];
  });
};

export const isCampaignWarehouseReceipt = (view, destination, slot) => (
  destination?.label === Entity.IDS.BUILDING
  && view?.progress?.warehouseId != null
  && BigInt(destination.id) === BigInt(view.progress.warehouseId)
  && Number(slot) === StarterMission.TYPES[StarterMission.IDS.ESTABLISH_STORAGE].requirements.inventorySlot
);

const isCrewControlledBuilding = (building, subject) => (
  !!building?.Control?.controller && !!subject
  && Entity.packEntity(building.Control.controller) === Entity.packEntity(subject)
);

const isCampaignBuildingType = (buildingType) => Object.values(StarterMission.TYPES)
  .some(m => m.requirements.buildingType === Number(buildingType));

// Preview only what this dialog can contribute, independently of the assignment's mission ID.
export const canParticipateInCampaign = ({ type, params = {}, view, building, details = {}, bindings = [] }) => {
  if (!view?.active || !view.eligible || !view.missions.some(m => m.accepted)) return false;
  const matched = kind => bindings.some(binding => binding.kind === kind && binding.status === 'matched');
  const finalProducts = view.progress?.finalProductIds || [];
  switch (type) {
    case 'PLAN_BUILDING':
      return isCampaignBuildingType(details.buildingType)
        && !(Number(details.buildingType) === Building.IDS.WAREHOUSE && view.progress?.warehouseId);
    case 'CONSTRUCT':
      if (!isCrewControlledBuilding(building, view.subject)) return false;
      // ConstructionStart creates the Built binding; only finishes need it already indexed.
      if (building.Building?.status === Building.CONSTRUCTION_STATUSES.PLANNED) {
        return isCampaignBuildingType(building.Building.buildingType)
          && (building.Building.buildingType !== Building.IDS.WAREHOUSE
            || String(building.id) === String(view.progress?.warehouseId));
      }
      return matched('Built');
    case 'NEW_CORE_SAMPLE':
      return !params.sampleId || matched('Sample');
    case 'EXTRACT_RESOURCE':
    case 'PROCESS':
      if (!matched('Built') || !isCrewControlledBuilding(building, view.subject)
        || building.Building?.status !== Building.CONSTRUCTION_STATUSES.OPERATIONAL) return false;
      if (details.running) return matched(type === 'PROCESS' ? 'Process' : 'Extraction');
      return type === 'PROCESS' ? Number(details.recipes) >= 1 : qualifiesCampaignExtraction(details.resource, details.amount);
    case 'SURFACE_TRANSFER':
      if (details.unsupported) return false;
      if (matched('Delivery')) return true;
      if (params.deliveryId || details.deliveryId) {
        return isCampaignWarehouseReceipt(view, details.destination, details.destinationSlot)
          && matched('Built') && isCrewControlledBuilding(details.destination, view.subject)
          && details.destination.Building?.status === Building.CONSTRUCTION_STATUSES.OPERATIONAL;
      }
      return !!details.origin && !!details.destination
        && Entity.packEntity(details.origin) !== Entity.packEntity(details.destination)
        && finalProducts.some(id => Number(details.products?.[id]) > 0);
    case 'FEED_CREW':
      return !!details.inventorySource && finalProducts.some(id => Number(id) === Product.IDS.FOOD);
    default:
      return false;
  }
};

const qualifiesCampaignExtraction = (resource, amount) => {
  const requirements = StarterMission.TYPES[StarterMission.IDS.BEGIN_EXTRACTION].requirements;
  return !!Product.TYPES[resource] && resource >= requirements.rawProductIdMin && resource <= requirements.rawProductIdMax
    && Number(amount) * Product.TYPES[resource].massPerUnit >= requirements.minExtractionMassGrams;
};

// Run immediately before submission; cached previews are not authorization.
// False means known unbound work should use the ordinary transaction path.
export const verifyMissionAction = async ({ key, vars, assignment, view, getBinding, getEntity }) => {
  const rule = MISSION_ACTIONS[key];
  if (!rule) throw new Error(`${key} cannot contribute to the starter campaign.`);
  if (key === 'ConstructionPlan') {
    if (!isCampaignBuildingType(vars.building_type)) throw new Error('This building type does not qualify for the starter campaign.');
    if (Number(vars.building_type) === StarterMission.TYPES[StarterMission.IDS.MAKE_LANDFALL].requirements.buildingType && view.progress?.warehouseId) {
      throw new Error('This campaign already has a Warehouse. Continue construction on that site.');
    }
  }
  if (key === 'ExtractResourceStart' || key === 'FlexibleExtractResourceStart') {
    const deposit = await getEntity(vars.deposit);
    const resource = deposit?.Deposit?.resource;
    const requirements = StarterMission.TYPES[StarterMission.IDS.BEGIN_EXTRACTION].requirements;
    if (!Product.TYPES[resource] || resource < requirements.rawProductIdMin || resource > requirements.rawProductIdMax) {
      throw new Error('Campaign extraction requires a sampled raw resource.');
    }
    if (BigInt(vars.yield) * BigInt(Product.TYPES[resource].massPerUnit) < BigInt(requirements.minExtractionMassGrams)) {
      throw new Error(`Extract at least ${(requirements.minExtractionMassGrams / 1000).toLocaleString()} kg in one campaign run.`);
    }
  }
  if ((key === 'ProcessProductsStart' || key === 'LeaseAndProcessProductsStart') && Number(vars.recipes) < 1) {
    throw new Error('Campaign processing requires at least one full recipe-equivalent.');
  }
  if (key === 'SendDelivery' && Entity.packEntity(vars.origin) === Entity.packEntity(vars.dest)) {
    throw new Error('Campaign deliveries must have different origin and destination entities.');
  }
  if (key === 'ResupplyFood' && BigInt(vars.origin.id) === 0n) {
    throw new Error('Campaign food consumption requires food from an inventory.');
  }

  const check = async (kind, entity, slot) => getBinding({
    campaign: assignment.campaign, subject: assignment.subject, kind, entity, ...(slot == null ? {} : { slot })
  });
  const requireMatch = async (kind, entity, slot) => {
    const result = await check(kind, entity, slot);
    if (result.status === 'unbound') return false;
    if (result.status !== 'matched') throw new Error(bindingUnavailableMessage(result));
    return true;
  };
  const requireCampaignBuilding = async (entity, operational = true) => {
    if (!await requireMatch('Built', entity)) return false;
    const building = await getEntity(entity);
    const controller = building?.Control?.controller;
    if (!controller || Entity.packEntity(controller) !== Entity.packEntity(assignment.subject)) {
      throw new Error('Campaign work requires a building controlled by this crew.');
    }
    if (operational && building?.Building?.status !== Building.CONSTRUCTION_STATUSES.OPERATIONAL) {
      throw new Error('Complete the campaign building before using it.');
    }
    return true;
  };
  if (rule.constructed && !await requireCampaignBuilding(vars[rule.target])) return false;
  if (key === 'ConstructionFinish') {
    return requireCampaignBuilding(vars.building, false);
  }
  if (!rule.binding) return true;
  const binding = await check(rule.binding, vars[rule.target], rule.slot ? vars[rule.slot] : undefined);
  if (key === 'ReceiveDelivery') {
    const delivery = await getEntity(vars.delivery);
    const destination = delivery?.Delivery?.dest;
    const warehouseReceipt = isCampaignWarehouseReceipt(view, destination, delivery?.Delivery?.destSlot);
    // Incoming warehouse receipts may be bound by ReceiveDelivery itself.
    if (warehouseReceipt) {
      if (binding.status === 'unbound' || binding.status === 'matched') return requireCampaignBuilding(destination);
    }
  }
  if (binding.status === 'unbound') return false;
  if (binding.status !== 'matched') throw new Error(bindingUnavailableMessage(binding));
  return true;
};

export const missionBindingRefetchInterval = query => ['matched', 'mismatched'].includes(query.state.data?.status) ? false : 5000;
