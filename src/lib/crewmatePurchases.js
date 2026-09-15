import { Crewmate, Entity } from '@influenceth/sdk';

import { getRandomAdalianAppearance } from './crewmateDesign';
import {
  STARTER_PACK_CREWMATE_TRAIT_TALLY,
  getRandomStarterPackTraits,
  getStarterPackCrewmateAppearance
} from './starterPacks';

export const CREWMATE_PURCHASE_STATUSES = {
  CHECKOUT_CREATED: 'checkout_created',
  PAID_PENDING_CUSTOMIZATION: 'paid_pending_customization',
  GRANT_SUBMITTING: 'grant_submitting',
  GRANT_SUBMITTED: 'grant_submitted',
  GRANT_CONFIRMED: 'grant_confirmed',
  GRANT_FAILED: 'grant_failed'
};

export const CREWMATE_PURCHASE_CHECKOUT_PARAM = 'crewmate_session_id';
export const CREWMATE_PURCHASE_TRAIT_TALLY = STARTER_PACK_CREWMATE_TRAIT_TALLY;

export const isCrewmatePurchaseCheckoutActive = (status) => [
  CREWMATE_PURCHASE_STATUSES.CHECKOUT_CREATED,
  CREWMATE_PURCHASE_STATUSES.PAID_PENDING_CUSTOMIZATION,
  CREWMATE_PURCHASE_STATUSES.GRANT_SUBMITTING,
  CREWMATE_PURCHASE_STATUSES.GRANT_SUBMITTED
].includes(status);

export const normalizeCrewmatePurchaseProduct = (product = {}) => ({
  ...product,
  amount: Number(product.amount || 0),
  requiredCrewmates: Number(product.requiredCrewmates || 1)
});

export const normalizeCrewmatePurchaseProducts = (products = []) => (
  products
    .map(normalizeCrewmatePurchaseProduct)
    .filter((product) => product.enabled !== false && product.productId)
    .sort((a, b) => a.amount - b.amount)
);

export const buildCrewmatePurchaseReturnUrl = () => {
  if (typeof window === 'undefined') return '';
  const url = new URL(window.location.href);
  url.searchParams.set(CREWMATE_PURCHASE_CHECKOUT_PARAM, '{CHECKOUT_SESSION_ID}');
  return url.toString();
};

export const getCrewmatePurchaseCheckoutSessionIdFromUrl = () => {
  if (typeof window === 'undefined') return null;
  return new URL(window.location.href).searchParams.get(CREWMATE_PURCHASE_CHECKOUT_PARAM);
};

export const clearCrewmatePurchaseCheckoutSessionIdFromUrl = () => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(CREWMATE_PURCHASE_CHECKOUT_PARAM)) return;
  url.searchParams.delete(CREWMATE_PURCHASE_CHECKOUT_PARAM);
  window.history.replaceState({}, '', url.toString());
};

const defaultClass = Crewmate.CLASS_IDS.MINER;

export const createCrewmatePurchaseDraft = (purchase, now = Date.now()) => ({
  purchaseId: purchase?.id,
  crewmate: {
    name: '',
    classId: defaultClass,
    selectedTraits: getRandomStarterPackTraits(defaultClass),
    appearanceOptions: [getRandomAdalianAppearance()],
    appearanceSelection: 0
  },
  updatedAt: now
});

export const isCrewmatePurchaseDraftComplete = (draft) => (
  !!draft?.crewmate?.name?.trim() &&
  !!draft?.crewmate?.classId &&
  draft?.crewmate?.selectedTraits?.length === CREWMATE_PURCHASE_TRAIT_TALLY
);

export const buildCrewmatePurchaseCrewmate = (draft) => {
  const crewmate = draft?.crewmate || {};
  const selectedTraits = crewmate.selectedTraits || [];

  return {
    id: 0,
    label: Entity.IDS.CREWMATE,
    Crewmate: {
      appearance: Crewmate.packAppearance(getStarterPackCrewmateAppearance(crewmate)),
      class: crewmate.classId,
      coll: Crewmate.COLLECTION_IDS.ADALIAN,
      cosmetic: selectedTraits.filter((t) => Crewmate.TRAITS[t]?.type === Crewmate.TRAIT_TYPES.COSMETIC),
      impactful: selectedTraits.filter((t) => Crewmate.TRAITS[t]?.type === Crewmate.TRAIT_TYPES.IMPACTFUL)
    },
    Name: { name: crewmate.name || '' },
    _canReclass: true,
    _canRename: true,
    _canRerollAppearance: true
  };
};

export const buildCrewmatePurchaseGrantRequest = ({ callerCrew, draft, station }) => {
  const crewmate = draft?.crewmate || {};
  const selectedTraits = crewmate.selectedTraits || [];
  const appearance = getStarterPackCrewmateAppearance(crewmate);

  return {
    station,
    callerCrew,
    class: Number(crewmate.classId),
    impactful: selectedTraits
      .filter((t) => Crewmate.TRAITS[t]?.type === Crewmate.TRAIT_TYPES.IMPACTFUL)
      .map(Number),
    cosmetic: selectedTraits
      .filter((t) => Crewmate.TRAITS[t]?.type === Crewmate.TRAIT_TYPES.COSMETIC)
      .map(Number),
    gender: Number(appearance.gender),
    body: Number(appearance.body),
    face: Number(appearance.face),
    hair: Number(appearance.hair),
    hairColor: Number(appearance.hairColor),
    clothes: Number(appearance.clothes),
    name: crewmate.name.trim()
  };
};

export const buildCrewmatePurchaseGrantRequestFromCrewmate = (crewmate) => {
  const appearance = Crewmate.unpackAppearance(crewmate.Crewmate.appearance);

  return {
    station: crewmate.Location,
    callerCrew: crewmate.Control.controller,
    class: Number(crewmate.Crewmate.class),
    impactful: (crewmate.Crewmate.impactful || []).map(Number),
    cosmetic: (crewmate.Crewmate.cosmetic || []).map(Number),
    gender: Number(appearance.gender),
    body: Number(appearance.body),
    face: Number(appearance.face),
    hair: Number(appearance.hair),
    hairColor: Number(appearance.hairColor),
    clothes: Number(appearance.clothes),
    name: crewmate.Name.name.trim()
  };
};

export const createCrewmatePurchaseCheckoutState = (purchase, update = {}, now = Date.now()) => {
  if (!purchase) return null;

  return {
    checkoutSessionId: purchase.stripeCheckoutSessionId,
    createdAt: now,
    productId: purchase.productId,
    purchaseId: purchase.id,
    recipient: purchase.recipient,
    status: purchase.status,
    updatedAt: now,
    ...update
  };
};

export const updateCrewmatePurchaseCheckoutState = (checkout, purchase, update = {}, now = Date.now()) => {
  if (!purchase && !checkout) return null;

  return {
    ...checkout,
    ...(purchase ? {
      checkoutSessionId: purchase.stripeCheckoutSessionId,
      productId: purchase.productId,
      purchaseId: purchase.id,
      recipient: purchase.recipient,
      status: purchase.status
    } : {}),
    ...update,
    updatedAt: now
  };
};
