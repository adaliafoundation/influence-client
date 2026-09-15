const { TextDecoder, TextEncoder } = require('util');

global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

const { Entity, Permission } = require('@influenceth/sdk');

const {
  STARTER_PACK_STATUSES,
  STARTER_LOT_LEASE_TERM,
  buildStarterPackGrantRequest,
  buildStarterPackReturnUrl,
  createDevStarterPackPurchase,
  createSeededStarterPackCrewmates,
  createStarterPackCheckoutState,
  createStarterPackCustomizationDraft,
  getStarterFoodSupplySource,
  getStarterCoreSampleSource,
  isDevStarterPackPurchase,
  isStarterPackCheckoutActive,
  isStarterPackCustomizationDraftComplete,
  hasStarterBuildingEntitlement,
  hasStarterCoreSampleEntitlement,
  hasStarterFoodSupplyEntitlement,
  isStarterLotLease,
  isStarterLotLeaseCandidate,
  normalizeStarterPackProducts,
  resizeStarterPackCustomizationDraft,
  shouldUsePendingStarterPackPurchase
} = require('./starterPacks');

const starterLeaseCandidate = {
  asteroid: { id: 1, label: Entity.IDS.ASTEROID },
  crew: {
    id: 10,
    label: Entity.IDS.CREW,
    StarterPack: { valid: true, lotAllowance: 2 }
  },
  lot: { id: 20, label: Entity.IDS.LOT },
  permission: Permission.IDS.USE_LOT
};

test('recognizes an available starter lot lease for the current starter pack crew', () => {
  expect(isStarterLotLeaseCandidate(starterLeaseCandidate)).toBe(true);
  expect(isStarterLotLease({
    ...starterLeaseCandidate,
    term: STARTER_LOT_LEASE_TERM
  })).toBe(true);
});

test('requires an active indexed starter pack with remaining lot allowance', () => {
  expect(isStarterLotLeaseCandidate({
    ...starterLeaseCandidate,
    crew: { ...starterLeaseCandidate.crew, StarterPack: undefined }
  })).toBe(false);
  expect(isStarterLotLeaseCandidate({
    ...starterLeaseCandidate,
    crew: { ...starterLeaseCandidate.crew, StarterPack: { valid: false, lotAllowance: 2 } }
  })).toBe(false);
  expect(isStarterLotLeaseCandidate({
    ...starterLeaseCandidate,
    crew: { ...starterLeaseCandidate.crew, StarterPack: { valid: true, lotAllowance: 0 } }
  })).toBe(false);
});

test('rejects non-Adalia, occupied, and overlong starter lot leases', () => {
  expect(isStarterLotLeaseCandidate({
    ...starterLeaseCandidate,
    asteroid: { ...starterLeaseCandidate.asteroid, id: 2 }
  })).toBe(false);
  expect(isStarterLotLeaseCandidate({
    ...starterLeaseCandidate,
    lot: { ...starterLeaseCandidate.lot, building: { id: 1 } }
  })).toBe(false);
  expect(isStarterLotLeaseCandidate({
    ...starterLeaseCandidate,
    lot: { ...starterLeaseCandidate.lot, surfaceShip: { id: 1 } }
  })).toBe(false);
  expect(isStarterLotLease({
    ...starterLeaseCandidate,
    term: STARTER_LOT_LEASE_TERM + 1
  })).toBe(false);
});

test('recognizes an available starter building entitlement', () => {
  const crew = {
    StarterPack: {
      valid: true,
      buildingAllowances: [
        { buildingType: '1', count: 1 },
        { buildingType: 2, count: 1 },
        { buildingType: 3, count: 0 }
      ]
    }
  };

  expect(hasStarterBuildingEntitlement(crew, 1)).toBe(true);
  expect(hasStarterBuildingEntitlement(crew, 3)).toBe(false);
  expect(hasStarterBuildingEntitlement({
    ...crew,
    StarterPack: { ...crew.StarterPack, valid: false }
  }, 1)).toBe(false);
  expect(hasStarterBuildingEntitlement({ StarterPack: { valid: true } }, 1)).toBe(false);
});

test('recognizes a remaining starter core sample entitlement', () => {
  const crew = {
    StarterPack: { valid: true, coreSampleAllowance: '5' }
  };

  expect(hasStarterCoreSampleEntitlement(crew)).toBe(true);
  expect(getStarterCoreSampleSource(crew)).toEqual({ id: 0, label: 0, slot: 0 });
  expect(hasStarterCoreSampleEntitlement({
    StarterPack: { valid: true, coreSampleAllowance: 0 }
  })).toBe(false);
  expect(hasStarterCoreSampleEntitlement({
    StarterPack: { valid: false, coreSampleAllowance: 5 }
  })).toBe(false);
  expect(getStarterCoreSampleSource({
    StarterPack: { valid: true, coreSampleAllowance: 0 }
  })).toBeNull();
});

test('recognizes a remaining starter food supply entitlement', () => {
  const crew = {
    StarterPack: { valid: true, foodReloadAllowance: '1' }
  };

  expect(hasStarterFoodSupplyEntitlement(crew)).toBe(true);
  expect(getStarterFoodSupplySource(crew)).toEqual({ id: 0, label: 0, slot: 0 });
  expect(hasStarterFoodSupplyEntitlement({
    StarterPack: { valid: true, foodReloadAllowance: 0 }
  })).toBe(false);
  expect(hasStarterFoodSupplyEntitlement({
    StarterPack: { valid: false, foodReloadAllowance: 1 }
  })).toBe(false);
  expect(getStarterFoodSupplySource({
    StarterPack: { valid: true, foodReloadAllowance: 0 }
  })).toBeNull();
});

test('builds a Stripe return URL with the literal Checkout session placeholder', () => {
  expect(buildStarterPackReturnUrl('https://client.example/launcher?foo=bar')).toBe(
    'https://client.example/starter-pack/return?session_id={CHECKOUT_SESSION_ID}'
  );
});

test('normalizes enabled starter pack products in display order', () => {
  const products = normalizeStarterPackProducts([
    { productId: 2, packType: 'strategist', enabled: true, amount: 2900, sortOrder: 2 },
    {
      productId: '1',
      packType: 'explorer',
      enabled: true,
      amount: '2500',
      sortOrder: '1',
      requiredCrewmates: '2',
      lotAllowance: '2',
      coreSampleAllowance: '5',
      foodReloadAllowance: '1',
      name: 'Explorer',
      description: 'Stripe product description',
      features: ['2 crewmates', '2 starter lots']
    },
    { productId: 3, packType: 'disabled', enabled: false, amount: 1, sortOrder: 0 }
  ]);

  expect(products).toMatchObject([
    {
      productId: 1,
      packType: 'explorer',
      amount: 2500,
      sortOrder: 1,
      requiredCrewmates: 2,
      lotAllowance: 2,
      coreSampleAllowance: 5,
      foodReloadAllowance: 1,
      name: 'Explorer',
      description: 'Stripe product description',
      features: ['2 crewmates', '2 starter lots']
    },
    { productId: 2, packType: 'strategist', amount: 2900, sortOrder: 2 }
  ]);
});

test('tracks active starter pack purchase statuses', () => {
  expect(isStarterPackCheckoutActive(STARTER_PACK_STATUSES.CHECKOUT_CREATED)).toBe(true);
  expect(isStarterPackCheckoutActive(STARTER_PACK_STATUSES.PAID_PENDING_CUSTOMIZATION)).toBe(true);
  expect(isStarterPackCheckoutActive(STARTER_PACK_STATUSES.GRANT_CONFIRMED)).toBe(false);
  expect(isStarterPackCheckoutActive(STARTER_PACK_STATUSES.GRANT_FAILED)).toBe(false);
});

test('creates local checkout resume state from a server purchase', () => {
  const checkout = createStarterPackCheckoutState({
    id: 'purchase_1',
    status: STARTER_PACK_STATUSES.CHECKOUT_CREATED,
    productId: 1,
    packType: 'explorer',
    recipient: '0x123',
    stripeCheckoutSessionId: 'cs_123'
  }, {}, 1000);

  expect(checkout).toMatchObject({
    checkoutSessionId: 'cs_123',
    packType: 'explorer',
    productId: 1,
    purchaseId: 'purchase_1',
    recipient: '0x123',
    status: STARTER_PACK_STATUSES.CHECKOUT_CREATED
  });
});

test('ignores orphan checkout-created pending purchases without a matching local checkout session', () => {
  const pendingPurchase = {
    id: 'purchase_1',
    status: STARTER_PACK_STATUSES.CHECKOUT_CREATED,
    stripeCheckoutSessionId: null
  };

  expect(shouldUsePendingStarterPackPurchase(pendingPurchase, null)).toBe(false);
  expect(shouldUsePendingStarterPackPurchase(pendingPurchase, { purchaseId: 'purchase_1' })).toBe(false);
  expect(shouldUsePendingStarterPackPurchase(pendingPurchase, {
    checkoutSessionId: 'cs_123',
    purchaseId: 'purchase_2'
  })).toBe(false);
});

test('uses checkout-created pending purchases only when they match the local checkout session', () => {
  const pendingPurchase = {
    id: 'purchase_1',
    status: STARTER_PACK_STATUSES.CHECKOUT_CREATED,
    stripeCheckoutSessionId: 'cs_123'
  };

  expect(shouldUsePendingStarterPackPurchase(pendingPurchase, {
    checkoutSessionId: 'cs_123',
    purchaseId: 'purchase_1'
  })).toBe(true);
  expect(shouldUsePendingStarterPackPurchase(pendingPurchase, {
    checkoutSessionId: 'cs_wrong',
    purchaseId: 'purchase_1'
  })).toBe(false);
});

test('uses paid and grant-state pending purchases without local checkout state', () => {
  expect(shouldUsePendingStarterPackPurchase({
    id: 'purchase_1',
    status: STARTER_PACK_STATUSES.PAID_PENDING_CUSTOMIZATION
  }, null)).toBe(true);
  expect(shouldUsePendingStarterPackPurchase({
    id: 'purchase_1',
    status: STARTER_PACK_STATUSES.GRANT_SUBMITTED
  }, null)).toBe(true);
});

test('builds customization grant request arrays from local draft', () => {
  const draft = createStarterPackCustomizationDraft({ id: 'purchase_1', requiredCrewmates: 2 }, 1000);
  draft.crewmates[0].name = 'Ada';
  draft.crewmates[1].name = 'Bea';

  expect(isStarterPackCustomizationDraftComplete(draft, 2)).toBe(true);
  expect(buildStarterPackGrantRequest(draft)).toMatchObject({
    restrictedUntil: draft.restrictedUntil,
    station: { label: 5, id: 1 },
    classes: [3, 2],
    impactful: expect.arrayContaining([expect.any(Number), expect.any(Number)]),
    cosmetic: expect.arrayContaining([expect.any(Number)]),
    names: ['Ada', 'Bea']
  });
});

test('resizes customization drafts to match the paid purchase', () => {
  const draft = createStarterPackCustomizationDraft({ id: 'purchase_1', requiredCrewmates: 2 }, 1000);
  draft.crewmates[0].name = 'Ada';

  const resized = resizeStarterPackCustomizationDraft(draft, 3);

  expect(resized.crewmates).toHaveLength(3);
  expect(resized.crewmates[0].name).toBe('Ada');
});

test('creates dev-only starter pack purchases and seeded crewmate drafts', () => {
  const product = {
    productId: 1,
    packType: 'explorer',
    requiredCrewmates: 3
  };
  const purchase = createDevStarterPackPurchase(product, '0x123', 1000);
  const crewmates = createSeededStarterPackCrewmates(product.requiredCrewmates);

  expect(isDevStarterPackPurchase(purchase)).toBe(true);
  expect(purchase).toMatchObject({
    status: STARTER_PACK_STATUSES.PAID_PENDING_CUSTOMIZATION,
    canCustomize: true,
    recipient: '0x123',
    requiredCrewmates: 3
  });
  expect(crewmates).toHaveLength(3);
  expect(crewmates.every((crewmate) => crewmate.selectedTraits.length === 4)).toBe(true);
});
