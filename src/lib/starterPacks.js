import { Crewmate, Entity, Permission } from '@influenceth/sdk';
import { getRandomAdalianAppearance } from './crewmateDesign';

export const STARTER_PACK_STATUSES = {
  CHECKOUT_CREATED: 'checkout_created',
  PAID_PENDING_CUSTOMIZATION: 'paid_pending_customization',
  GRANT_SUBMITTING: 'grant_submitting',
  GRANT_SUBMITTED: 'grant_submitted',
  GRANT_CONFIRMED: 'grant_confirmed',
  GRANT_FAILED: 'grant_failed'
};

export const STARTER_PACK_CHECKOUT_PARAM = 'session_id';
export const STRIPE_CHECKOUT_SESSION_TEMPLATE = '{CHECKOUT_SESSION_ID}';
export const DEV_STARTER_PACK_PURCHASE_PREFIX = 'dev_starter_pack_';

export const barebonesCrewmateAppearance = '0x1200010000000000041';

// Must stay aligned with STARTER_LOT_TERM in AcceptPrepaidAgreement.
export const STARTER_LOT_LEASE_TERM = 2628000;

const hasValidStarterPack = (crew) => crew?.StarterPack?.valid === true;

const hasStarterPackAllowance = (crew, allowance) => (
  hasValidStarterPack(crew)
  && Number(crew.StarterPack[allowance]) > 0
);

const getStarterPackEntitlementSource = (crew, allowance) => (
  hasStarterPackAllowance(crew, allowance)
    ? { id: 0, label: 0, slot: 0 }
    : null
);

export const hasStarterCoreSampleEntitlement = (crew) => (
  hasStarterPackAllowance(crew, 'coreSampleAllowance')
);

export const getStarterCoreSampleSource = (crew) => (
  getStarterPackEntitlementSource(crew, 'coreSampleAllowance')
);

export const hasStarterFoodSupplyEntitlement = (crew) => (
  hasStarterPackAllowance(crew, 'foodReloadAllowance')
);

export const getStarterFoodSupplySource = (crew) => (
  getStarterPackEntitlementSource(crew, 'foodReloadAllowance')
);

export const isStarterLotLeaseCandidate = ({ asteroid, crew, lot, permission }) => (
  hasStarterPackAllowance(crew, 'lotAllowance')
  && Number(asteroid?.id) === 1
  && Number(lot?.label) === Entity.IDS.LOT
  && Number(permission) === Permission.IDS.USE_LOT
  && !lot?.building
  && !lot?.surfaceShip
);

export const isStarterLotLease = ({ term, ...candidate }) => (
  isStarterLotLeaseCandidate(candidate)
  && Number(term) > 0
  && Number(term) <= STARTER_LOT_LEASE_TERM
);

export const hasStarterBuildingEntitlement = (crew, buildingType) => (
  hasValidStarterPack(crew)
  && Array.isArray(crew.StarterPack.buildingAllowances)
  && crew.StarterPack.buildingAllowances.some((allowance) => (
    Number(allowance.buildingType) === Number(buildingType)
    && Number(allowance.count) > 0
  ))
);

const starterRestrictionSeconds = 14 * 24 * 60 * 60;
const defaultStation = { label: Entity.IDS.BUILDING, id: 1 };
const defaultClasses = [
  Crewmate.CLASS_IDS.MINER,
  Crewmate.CLASS_IDS.ENGINEER,
  Crewmate.CLASS_IDS.PILOT,
  Crewmate.CLASS_IDS.MERCHANT,
  Crewmate.CLASS_IDS.SCIENTIST
];

export const isStarterPackCheckoutActive = (status) => [
  STARTER_PACK_STATUSES.CHECKOUT_CREATED,
  STARTER_PACK_STATUSES.PAID_PENDING_CUSTOMIZATION,
  STARTER_PACK_STATUSES.GRANT_SUBMITTING,
  STARTER_PACK_STATUSES.GRANT_SUBMITTED
].includes(status);

export const shouldUsePendingStarterPackPurchase = (purchase, checkoutState) => {
  if (!purchase) return false;
  if (purchase.status !== STARTER_PACK_STATUSES.CHECKOUT_CREATED) return true;

  const checkoutSessionId = checkoutState?.checkoutSessionId;
  if (!checkoutSessionId || checkoutState?.purchaseId !== purchase.id) return false;

  return !purchase.stripeCheckoutSessionId || purchase.stripeCheckoutSessionId === checkoutSessionId;
};

export const isStarterPackGrantPending = (status) => [
  STARTER_PACK_STATUSES.GRANT_SUBMITTING,
  STARTER_PACK_STATUSES.GRANT_SUBMITTED
].includes(status);

export const normalizeStarterPackProduct = (product = {}) => ({
  ...product,
  amount: Number(product.amount || 0),
  buildings: Array.isArray(product.buildings) ? product.buildings : [],
  coreSampleAllowance: Number(product.coreSampleAllowance || 0),
  foodReloadAllowance: Number(product.foodReloadAllowance || 0),
  lotAllowance: Number(product.lotAllowance || 0),
  productId: Number(product.productId),
  requiredCrewmates: Number(product.requiredCrewmates || 0),
  sortOrder: Number(product.sortOrder || 0)
});

export const normalizeStarterPackProducts = (products = []) => (
  products
    .map(normalizeStarterPackProduct)
    .filter((product) => product.enabled !== false && product.productId && product.packType)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.amount - b.amount)
);

export const createStarterPackCheckoutState = (purchase, update = {}, now = Date.now()) => {
  if (!purchase) return null;

  return {
    checkoutSessionId: purchase.stripeCheckoutSessionId,
    createdAt: now,
    packType: purchase.packType,
    productId: purchase.productId,
    purchaseId: purchase.id,
    recipient: purchase.recipient,
    status: purchase.status,
    updatedAt: now,
    ...update
  };
};

export const updateStarterPackCheckoutState = (checkout, purchase, update = {}, now = Date.now()) => {
  if (!purchase && !checkout) return null;

  return {
    ...checkout,
    ...(purchase ? {
      checkoutSessionId: purchase.stripeCheckoutSessionId,
      packType: purchase.packType,
      productId: purchase.productId,
      purchaseId: purchase.id,
      recipient: purchase.recipient,
      status: purchase.status
    } : {}),
    ...update,
    updatedAt: now
  };
};

export const STARTER_PACK_CREWMATE_TRAIT_TALLY = 4;

export const getRandomStarterPackTraits = (classId, currentTraits = []) => {
  if (!classId) return [];

  const traits = currentTraits.length === STARTER_PACK_CREWMATE_TRAIT_TALLY ? [] : [...currentTraits];
  let possibleTraits = Crewmate.nextTraits(Crewmate.COLLECTION_IDS.ADALIAN, classId, traits);

  while (possibleTraits.length > 0 && traits.length < STARTER_PACK_CREWMATE_TRAIT_TALLY) {
    const randomIndex = Math.floor(Math.random() * possibleTraits.length);
    traits.push(possibleTraits[randomIndex]);
    possibleTraits = Crewmate.nextTraits(Crewmate.COLLECTION_IDS.ADALIAN, classId, traits);
  }

  return traits;
};

const createDefaultCrewmateDraft = (index) => {
  const classId = defaultClasses[index % defaultClasses.length];

  return {
    name: '',
    classId,
    selectedTraits: getRandomStarterPackTraits(classId),
    appearanceOptions: [getRandomAdalianAppearance()],
    appearanceSelection: 0
  };
};

export const createStarterPackCustomizationDraft = (purchase, now = Date.now()) => {
  const requiredCrewmates = Number(purchase?.requiredCrewmates || 0);

  return {
    purchaseId: purchase?.id,
    restrictedUntil: Math.floor(now / 1000) + starterRestrictionSeconds,
    station: defaultStation,
    crewmates: Array.from(
      { length: requiredCrewmates },
      (_, index) => createDefaultCrewmateDraft(index)
    ),
    updatedAt: now
  };
};

export const resizeStarterPackCustomizationDraft = (draft, requiredCrewmates) => {
  const nextCrewmates = [...(draft?.crewmates || [])];

  while (nextCrewmates.length < requiredCrewmates) {
    nextCrewmates.push(createDefaultCrewmateDraft(nextCrewmates.length));
  }

  return {
    ...draft,
    crewmates: nextCrewmates.slice(0, requiredCrewmates)
  };
};

export const isStarterPackCustomizationDraftComplete = (draft, requiredCrewmates) => {
  if (!draft || draft.crewmates?.length !== requiredCrewmates) return false;

  return draft.crewmates.every((crewmate) => (
    crewmate.name?.trim() &&
    crewmate.classId &&
    crewmate.selectedTraits?.length === STARTER_PACK_CREWMATE_TRAIT_TALLY
  ));
};

export const getStarterPackCrewmateAppearance = (crewmate) => {
  const appearance = crewmate?.appearanceOptions?.[crewmate.appearanceSelection || 0] || getRandomAdalianAppearance();
  const { clothesOffset, ...packedAppearance } = appearance;

  return {
    ...packedAppearance,
    clothes: crewmate?.classId ? (crewmate.classId - 1) * 2 + (clothesOffset || 32) : 18
  };
};

export const buildStarterPackCrewmate = (crewmate, index = 0) => {
  const selectedTraits = crewmate?.selectedTraits || [];

  return {
    id: index,
    label: Entity.IDS.CREWMATE,
    Crewmate: {
      appearance: Crewmate.packAppearance(getStarterPackCrewmateAppearance(crewmate)),
      class: crewmate?.classId,
      coll: Crewmate.COLLECTION_IDS.ADALIAN,
      cosmetic: selectedTraits.filter((t) => Crewmate.TRAITS[t]?.type === Crewmate.TRAIT_TYPES.COSMETIC),
      impactful: selectedTraits.filter((t) => Crewmate.TRAITS[t]?.type === Crewmate.TRAIT_TYPES.IMPACTFUL)
    },
    Name: { name: crewmate?.name || '' },
    _canReclass: true,
    _canRename: true,
    _canRerollAppearance: true
  };
};

export const buildStarterPackGrantRequest = (draft) => {
  const crewmates = draft?.crewmates || [];
  const unpacked = crewmates.map(getStarterPackCrewmateAppearance);
  const traits = crewmates.map((crewmate) => {
    const selectedTraits = crewmate.selectedTraits || [];
    return {
      impactful: selectedTraits.find((t) => Crewmate.TRAITS[t]?.type === Crewmate.TRAIT_TYPES.IMPACTFUL),
      cosmetic: selectedTraits.filter((t) => Crewmate.TRAITS[t]?.type === Crewmate.TRAIT_TYPES.COSMETIC)
    };
  });

  return {
    restrictedUntil: draft.restrictedUntil,
    station: draft.station,
    classes: crewmates.map((crewmate) => Number(crewmate.classId)),
    impactful: traits.map((trait) => Number(trait.impactful)),
    cosmetic: traits.flatMap((trait) => trait.cosmetic.map(Number)),
    genders: unpacked.map((appearance) => Number(appearance.gender)),
    bodies: unpacked.map((appearance) => Number(appearance.body)),
    faces: unpacked.map((appearance) => Number(appearance.face)),
    hairs: unpacked.map((appearance) => Number(appearance.hair)),
    hairColors: unpacked.map((appearance) => Number(appearance.hairColor)),
    clothes: unpacked.map((appearance) => Number(appearance.clothes)),
    names: crewmates.map((crewmate) => crewmate.name.trim())
  };
};

export const createDevStarterPackPurchase = (product, recipient, now = Date.now()) => {
  if (!product) return null;

  return {
    id: `${DEV_STARTER_PACK_PURCHASE_PREFIX}${product.packType || product.productId}_${now}`,
    status: STARTER_PACK_STATUSES.PAID_PENDING_CUSTOMIZATION,
    productId: product.productId,
    packType: product.packType,
    recipient,
    requiredCrewmates: Number(product.requiredCrewmates || 0),
    canCustomize: true,
    txHash: null,
    grantedCrew: null,
    grantError: null,
    stripeCheckoutSessionId: `dev_cs_${now}`
  };
};

export const isDevStarterPackPurchase = (purchase) => (
  `${purchase?.id || ''}`.startsWith(DEV_STARTER_PACK_PURCHASE_PREFIX)
);

export const createSeededStarterPackCrewmates = (requiredCrewmates, namePrefix = 'Test Crewmate') => (
  Array.from({ length: requiredCrewmates }, (_, index) => {
    const classId = defaultClasses[index % defaultClasses.length];
    return {
      name: `${namePrefix} ${index + 1}`,
      classId,
      selectedTraits: getRandomStarterPackTraits(classId),
      appearanceOptions: [getRandomAdalianAppearance()],
      appearanceSelection: 0
    };
  })
);

export const buildStarterPackReturnUrl = (baseHref = window.location.origin) => {
  const url = new URL('/starter-pack/return', baseHref);
  url.searchParams.set(STARTER_PACK_CHECKOUT_PARAM, STRIPE_CHECKOUT_SESSION_TEMPLATE);
  return url.toString().replace(
    encodeURIComponent(STRIPE_CHECKOUT_SESSION_TEMPLATE),
    STRIPE_CHECKOUT_SESSION_TEMPLATE
  );
};
