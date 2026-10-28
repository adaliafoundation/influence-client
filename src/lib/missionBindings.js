import { STARTER_CAMPAIGN_NAME } from './starterCampaign';
import { errorMessages } from './errorMessages';
import { Building, Entity, Product, StarterMission } from '@influenceth/sdk';

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
  ExtractResourceFinish: { constructed: true, binding: 'Extraction', target: 'extractor', slot: 'extractor_slot' },
  ProcessProductsStart: { constructed: true, target: 'processor' },
  ProcessProductsFinish: { constructed: true, binding: 'Process', target: 'processor', slot: 'processor_slot' },
  SendDelivery: {},
  ReceiveDelivery: { binding: 'Delivery', target: 'delivery' },
  FillSellOrder: {},
  ResupplyFood: {}
};

export const isCampaignWarehouseReceipt = (view, destination, slot) => (
  destination?.label === Entity.IDS.BUILDING
  && view?.progress?.warehouseId != null
  && BigInt(destination.id) === BigInt(view.progress.warehouseId)
  && Number(slot) === StarterMission.TYPES[StarterMission.IDS.ESTABLISH_STORAGE].requirements.inventorySlot
);

const isCampaignBuildingType = (buildingType) => Object.values(StarterMission.TYPES)
  .some(m => m.requirements.buildingType === Number(buildingType));

// Run immediately before submission; cached previews are not authorization.
// False means known unbound work should use the ordinary transaction path.
export const verifyMissionAction = async ({ key, vars, assignment, view, getBinding, getEntity }) => {
  const rule = MISSION_ACTIONS[key];
  if (!rule) throw new Error(`${key} cannot contribute to ${STARTER_CAMPAIGN_NAME}.`);
  if (key === 'FillSellOrder') return true;
  if (key === 'ConstructionPlan') {
    if (!isCampaignBuildingType(vars.building_type)) return false;
    if (Number(vars.building_type) === StarterMission.TYPES[StarterMission.IDS.MAKE_LANDFALL].requirements.buildingType && view.progress?.warehouseId) {
      return false;
    }
  }
  if (key === 'ExtractResourceStart') {
    const deposit = await getEntity(vars.deposit);
    const resource = deposit?.Deposit?.resource;
    const requirements = StarterMission.TYPES[StarterMission.IDS.BEGIN_EXTRACTION].requirements;
    if (!Product.TYPES[resource] || resource < requirements.rawProductIdMin || resource > requirements.rawProductIdMax) {
      return false;
    }
    if (BigInt(vars.yield) * BigInt(Product.TYPES[resource].massPerUnit) < BigInt(requirements.minExtractionMassGrams)) {
      return false;
    }
  }
  if (key === 'ProcessProductsStart' && Number(vars.recipes) < 1) {
    return false;
  }
  if (key === 'SendDelivery' && Entity.packEntity(vars.origin) === Entity.packEntity(vars.dest)) {
    return false;
  }
  if (key === 'ResupplyFood' && BigInt(vars.origin.id) === 0n) {
    return false;
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
      return false;
    }
    if (operational && building?.Building?.status !== Building.CONSTRUCTION_STATUSES.OPERATIONAL) {
      return false;
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
