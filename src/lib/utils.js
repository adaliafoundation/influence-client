import esb from 'elastic-builder';
import { Crew, Entity, Lot, Order, Permission, Processor, Time } from '@influenceth/sdk';
import { shortString } from 'starknet';
import trim from 'lodash/trim';

import { appConfig } from '~/appConfig';
import { ManufactureIcon, GrowIcon, AssembleIcon, RefineIcon } from '~/components/Icons';
import { TOKEN, TOKEN_SCALE } from './priceUtils';

const timerIncrements = { d: 86400, h: 3600, m: 60, s: 1 };
export const formatTimer = (secondsRemaining, maxPrecision = null) => {
  if (isNaN(secondsRemaining)) return '';
  let remainder = secondsRemaining;
  const parts = Object.keys(timerIncrements).reduce((acc, k) => {
    if (acc.length > 0 || remainder >= timerIncrements[k] || timerIncrements[k] === 1) {
      const unit = Math.floor(remainder / timerIncrements[k]);
      remainder = remainder % timerIncrements[k];
      acc.push(`${unit}${k}`);
    }
    return acc;
  }, []);
  if (maxPrecision) return parts.slice(0, maxPrecision).join(' ');
  return parts.join(' ');
};

export const roundToPlaces = (value, maximumFractionDigits = 0) => {
  const div = 10 ** maximumFractionDigits;
  return (Math.round((value || 0) * div) / div);
}

export const formatFixed = (value, maximumFractionDigits = 0, minimumFractionDigits = 0) => {
  return roundToPlaces(value, maximumFractionDigits).toLocaleString(undefined, { maximumFractionDigits, minimumFractionDigits });
};

export const formatPrecision = (value, maximumPrecision = 0) => {
  const allowedDecimals = Math.max(0, maximumPrecision - Math.ceil(Math.log10(Math.abs(value))));
  if (isNaN(allowedDecimals)) { console.log('is nan', value, maximumPrecision); }
  return formatFixed(value, allowedDecimals);
};

export const formatPrice = (inputSway, { minPrecision = 3, fixedPrecision, forcedAbbrev } = {}) => {
  let sign = inputSway < 0 ? '-' : '';

  const sway = Math.abs(inputSway);
  let unitLabel;
  let scale;
  if ((sway >= 1e6 && forcedAbbrev === undefined) || forcedAbbrev === 6) {
    scale = 1e6;
    unitLabel = 'M';
  } else if ((sway >= 1e3 && forcedAbbrev === undefined) || forcedAbbrev === 3) {
    scale = 1e3;
    unitLabel = 'k';
  } else if ((sway >= 1 && forcedAbbrev === undefined) || forcedAbbrev === 0) {
    scale = 1;
    unitLabel = '';
  } else {
    return Number(sway || 0).toLocaleString(undefined, { minimumFractionDigits: minPrecision, maximumFractionDigits: Math.max(minPrecision, fixedPrecision || 0) });
  }

  const workingUnits = (sway / scale);

  let fixedPlaces = fixedPrecision || 0;
  if (fixedPrecision === undefined) {
    while (workingUnits * 10 ** (fixedPlaces + 1) < 10 ** minPrecision) {
      fixedPlaces++;
    }
  }
  return `${sign}${(workingUnits || 0).toLocaleString(undefined, { minimumFractionDigits: minPrecision, maximumFractionDigits: Math.max(fixedPlaces, minPrecision) })}${unitLabel}`;
};

export const formatUSD = (usd) => {
  return `$${(usd || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const keyify = (str) => (str || '').replace(/[^a-zA-Z0-9_]/g, '');

export const reactBool = (value) => value ? 'true' : undefined;
export const nativeBool = (value) => Boolean(value);

export const reactPreline = (value, maxInARow = 2) => {
  return (value || '')
    .split('\n')
    .map((line) => trim(line))
    .filter((c, i, arr) => {
      if (c.length) return true;
      if (i < maxInARow) return true;

      // this line is blank... make sure it is not creating > maxInARow
      for (let j = 1; j <= maxInARow - 1; j++) {
        if (arr[i - j].length > 0) return true;
      }
      return false;
    })
    .map((line, i) => i > 0 ? [<br key={i} />, line] : line)
};

export const locationsArrToObj = (locations) => {
  const asteroidId = locations.find((l) => Number(l.label) === Entity.IDS.ASTEROID)?.id;
  const lotLocation = locations.find((l) => l.label === Entity.IDS.LOT);
  return {
    asteroidId,
    lotId: lotLocation?.id,
    lotIndex: lotLocation?.id ? Lot.toIndex(lotLocation?.id) : (asteroidId ? 0 : undefined),
    buildingId: locations.find((l) => l.label === Entity.IDS.BUILDING)?.id,
    shipId: locations.find((l) => l.label === Entity.IDS.SHIP)?.id,
    spaceId: locations.find((l) => l.label === Entity.IDS.SPACE)?.id,
  }
};

export const andList = (items) => {
  if (items.length <= 1) return <>{items}</>;
  if (items.length === 2) return <>{items[0]} and {items[1]}</>;
  return <>{items.slice(0, -1).map((i) => <>{i}, </>)} and {items[items.length - 1]}</>;
}

export const ucfirst = (str) => {
  if (!str) return str;
  const s = (str || '').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1)
};

export const getCrewAbilityBonuses = (abilityIdOrAbilityIds, crew) => {
  if (!crew) return {};
  const isMultiple = Array.isArray(abilityIdOrAbilityIds);
  const timeSinceFed = Math.max(
    0,
    Time.toGameDuration(
      (crew._now || (Date.now() / 1000)) - (crew.Crew?.lastFed || 0),
      crew._timeAcceleration
    )
  );
  const bonuses = (isMultiple ? abilityIdOrAbilityIds : [abilityIdOrAbilityIds]).reduce((acc, abilityId) => {
    acc[abilityId] = Crew.getAbilityBonus(abilityId, crew._crewmates, crew._station, timeSinceFed);
    return acc;
  }, {});
  return isMultiple ? bonuses : bonuses[abilityIdOrAbilityIds];
}

export const esbLocationQuery = ({ asteroidId, lotId }, path = 'Location.locations') => {
  let label, id;
  if (asteroidId) {
    label = Entity.IDS.ASTEROID;
    id = asteroidId;
  } else if (lotId) {
    label = Entity.IDS.LOT;
    id = lotId;
  }
  if (!label || !id) return undefined;

  return esb.nestedQuery()
    .path(path)
    .query(
      esb.boolQuery().must([
        esb.termQuery(`${path}.label`, label),
        esb.termQuery(`${path}.id`, id),
      ])
    )
};

export const esbPermissionQuery = (crewId, siblingCrewIds, crewDelegatedTo, permissionId) => {
  return esb.boolQuery().should([
    esb.termsQuery('Control.controller.id', [crewId, ...(siblingCrewIds || [])]),
    esb.nestedQuery()
      .path('PublicPolicies')
      .query(esb.termQuery('PublicPolicies.permission', permissionId)),
    esb.nestedQuery()
      .path('PrepaidAgreements')
      .query(
        esb.boolQuery().must([
          esb.termQuery('PrepaidAgreements.permission', permissionId),
          esb.termQuery('PrepaidAgreements.permitted.id', crewId),
          esb.rangeQuery('PrepaidAgreements.endTime').gt(Math.floor(Date.now() / 1000))
        ])
      ),
    esb.nestedQuery()
      .path('ContractAgreements')
      .query(
        esb.boolQuery().must([
          esb.termQuery('ContractAgreements.permission', permissionId),
          esb.termQuery('ContractAgreements.permitted.id', crewId),
        ])
      ),
    esb.nestedQuery()
      .path('WhitelistAgreements')
      .query(
        esb.boolQuery().must([
          esb.termQuery('WhitelistAgreements.permission', permissionId),
          esb.termQuery('WhitelistAgreements.permitted.id', crewId),
        ])
      ),
    esb.nestedQuery()
      .path('WhitelistAccountAgreements')
      .query(
        esb.boolQuery().must([
          esb.termQuery('WhitelistAccountAgreements.permission', permissionId),
          esb.termQuery('WhitelistAccountAgreements.permitted', crewDelegatedTo),
        ])
      )
  ])
};

export const esbAnyPermissionQuery = (crewId, siblingCrewIds, crewDelegatedTo) => {
  return esb.boolQuery().should([
    esb.termsQuery('Control.controller.id', [crewId, ...(siblingCrewIds || [])]),
    esb.nestedQuery()
      .path('PublicPolicies')
      .query(esb.termQuery('PublicPolicies.public', true)),
    esb.nestedQuery()
      .path('PrepaidAgreements')
      .query(
        esb.boolQuery().must([
          esb.termQuery('PrepaidAgreements.permitted.id', crewId),
          esb.rangeQuery('PrepaidAgreements.endTime').gt(Math.floor(Date.now() / 1000))
        ])
      ),
    esb.nestedQuery()
      .path('ContractAgreements')
      .query(esb.termQuery('ContractAgreements.permitted.id', crewId)),
    esb.nestedQuery()
      .path('WhitelistAgreements')
      .query(esb.termQuery('WhitelistAgreements.permitted.id', crewId)),
    esb.nestedQuery()
      .path('WhitelistAccountAgreements')
      .query(esb.termQuery('WhitelistAccountAgreements.permitted', crewDelegatedTo))
  ])
};

export const getProcessorProps = (processorType) => {
  switch (processorType) {
    case Processor.IDS.REFINERY: return { label: 'Refine Materials', typeLabel: 'Refinery', icon: <RefineIcon /> };
    case Processor.IDS.FACTORY: return { label: 'Manufacture Goods', typeLabel: 'Factory', icon: <ManufactureIcon /> };
    case Processor.IDS.BIOREACTOR: return { label: 'Manufacture Organics', typeLabel: 'Bioreactor', icon: <GrowIcon /> };
    case Processor.IDS.SHIPYARD: return { label: 'Manufacture Ship Parts', typeLabel: 'Shipyard', icon: <AssembleIcon /> };
    default: return {};
  }
}

export const arrToXYZ = (arr) => ({ x: arr[0], y: arr[1], z: arr[2] });

const yearOfSeconds = 31536000;
export const secondsToMonths = (seconds) => Math.floor(1000 * 12 * seconds / yearOfSeconds) / 1000;
export const monthsToSeconds = (months) => Math.floor(yearOfSeconds * months / 12);
export const secondsToDays = (seconds) => seconds / 86400;
export const daysToSeconds = (days) => days * 86400;

export const getBlockTime = async (provider, blockNumber = 'pre_confirmed') => {
  try {
    const block = await provider.getBlock(blockNumber > 0 ? blockNumber : 'pre_confirmed');
    // console.log('block', block);
    return block?.timestamp;
  } catch (e) {
    console.error(e);
  }
}

export const safeEntityId = (variablyHydratedEntity) => {
  if (variablyHydratedEntity) {
    const e = {
      id: Number(variablyHydratedEntity?.id),
      label: variablyHydratedEntity?.label,
      uuid: variablyHydratedEntity?.uuid
    };
    if (e.id && e.label && !e.uuid) {
      e.uuid = Entity.packEntity(e);
    }
    return e;
  }
  return undefined;
};

export const getAgreementPath = (target, permission, permitted) => {
  return `${target ? Entity.packEntity(target) : ''}.${permission || ''}.${permitted?.id ? Entity.packEntity(permitted) : (permitted || '')}`;
};

export const entityToAgreements = (entity) => {
  const acc = [];
  ['PrepaidAgreements', 'ContractAgreements', 'WhitelistAgreements', 'WhitelistAccountAgreements'].forEach((agreementType) => {
    (entity[agreementType] || []).forEach((agreement, j) => {
      const formatted = {
        ...entity,

        key: `${entity.uuid}_${agreementType}_${j}`,
        _agreement: {
          _path: getAgreementPath(entity, agreement.permission, agreement.permitted),
          _type: agreementType === 'PrepaidAgreements'
            ? Permission.POLICY_IDS.PREPAID
            : (agreementType === 'ContractAgreements' ? Permission.POLICY_IDS.CONTRACT : 5),
          ...agreement,
          _isExpired: agreement.endTime < (Date.now() / 1000),
          _expiredDays: (agreement.endTime < (Date.now() / 1000)) ? Math.floor((Date.now() / 1000 - agreement.endTime) / 86400) : 0,
        },
      };
      // for the sake of agreements, the lot controller is *always* the asteroid controller
      // because that is who is the administrator of lot agreements
      // NOTE: this is different from elsewhere in the client, where the controller is
      //       whoever has USE_LOT (fallback to asteroid controller)
      formatted.Control = entity.label === Entity.IDS.LOT ? entity.meta?.asteroid?.Control : entity.Control;
      acc.push(formatted);
    })
  });
  return acc;
};

// Return the resolved chain ID in a specified format (hex or string)
export const resolveChainId = (chainId, format = 'string') => {
  let resolvedId = 'SN_DEV';
  if ([23448594291968334n, '0x534e5f4d41494e', 'SN_MAIN'].includes(chainId)) resolvedId = 'SN_MAIN';
  if ([1536727068981429685321n, '0x534e5f474f45524c49', 'SN_GOERLI'].includes(chainId)) resolvedId = 'SN_GOERLI';
  if ([393402133025997798000961n, '0x534e5f5345504f4c4941', 'SN_SEPOLIA', 'sepolia-alpha'].includes(chainId)) resolvedId = 'SN_SEPOLIA';

  return format === 'string' ? resolvedId : shortString.encodeShortString(resolvedId);
};

// Check if two arbitrary (perhaps mixed type) chain IDs are equal
export const areChainsEqual = (chainIdA, chainIdB) => {
  return resolveChainId(chainIdA) === resolveChainId(chainIdB);
}

export const cleanseTxHash = function (txOrTxHash) {
  if (!txOrTxHash) return null;

  let unformatted = txOrTxHash;
  if (txOrTxHash.transaction_hash) unformatted = txOrTxHash.transaction_hash;
  if (txOrTxHash.transactionHash) unformatted = txOrTxHash.transactionHash;

  return `0x${safeBigInt(unformatted).toString(16).padStart(64, '0')}`;
};

export const fireTrackingEvent = function (event, eventProps = {}) {
  try {
    const eventObj = { event: event, ...eventProps };
    if (window.dataLayer) {
      window.dataLayer.push(eventObj);
    } else {
      console.log('gtm datalayer not available', eventObj);
    }
  } catch (e) {
    console.warn(e);
  }
};

// TODO: this should probably be in the sdk
export const ordersToFills = (mode, orders, amountToFill, takerFee, feeReductionBonus = 1, feeEnforcementBonus = 1, isDestructive = false) => {
  const paymentFunc = mode === 'buy' ? Order.getFillSellOrderPayments : Order.getFillBuyOrderWithdrawals;
  const priceSortMult = mode === 'buy' ? 1 : -1;

  const marketFills = [];
  let needed = amountToFill;
  orders
    .sort((a, b) => a.price === b.price ? a.validTime - b.validTime : (priceSortMult * (a.price - b.price)))
    .every((order) => {
      // if order depleted, skip over but keep going
      if (order.amount === 0) return true;

      const { amount, price } = order;
      const levelAmount = Math.min(needed, amount);
      const levelValue = Math.round(1e6 * levelAmount * price) / 1e6;
      needed -= levelAmount;
      if (levelAmount > 0) { // TODO: should this be >= ?
        const paymentsUnscaled = paymentFunc(
          levelValue * TOKEN_SCALE[TOKEN.SWAY],
          order.makerFee,
          takerFee,
          feeReductionBonus,
          feeEnforcementBonus
        );
        marketFills.push({
          ...order,
          takerFee,
          fillAmount: levelAmount,
          fillValue: levelValue,
          fillPaymentTotal: Math.round((paymentsUnscaled.toPlayer || 0) + (paymentsUnscaled.toExchange || 0)),
          paymentsUnscaled: paymentsUnscaled
        });
        if (isDestructive) {
          order.amount -= levelAmount;
        }
        return true;
      }
      return false;
    });
  return marketFills;
};

export const safeBigInt = (unsafe) => {
  if (typeof unsafe === 'bigint') {
    return unsafe;
  }
  if (unsafe === null || isNaN(Number(unsafe))) {
    console.error(`safeBigInt warning: "${unsafe}" is not a number, returning 0n`);
    return 0n;
  }
  if (typeof unsafe === 'string') {
    try {
      return BigInt(unsafe);
    } catch (e) {
      console.warn(`safeBigInt warning: could not cast from string... trying as number (precision may be lost)`);
    }
  }
    
  try {
    return BigInt(Number(unsafe));
  } catch (e) {
    console.warn(`safeBigInt warning: "${unsafe}" will be rounded`);
  }
  
  try {
    return BigInt(Math.round(Number(unsafe)));
  } catch (e) {
    console.error(`safeBigInt failure: "${unsafe}" will be returned as 0n`);
  }

  return 0n;
}

export const openAccessJSTime = `${appConfig.get('Starknet.chainId')}` === `0x534e5f4d41494e` ? 1719495000e3 : 0;
export const displayTimeFractionDigits = 2;
export const maxAnnotationLength = 750;

export const isProcessingPermission = (permission) => [
  Permission.IDS.RUN_PROCESS,
  Permission.IDS.EXTRACT_RESOURCES,
  Permission.IDS.ASSEMBLE_SHIP
].includes(permission);

export const getProcessorLeaseConfig = (permissionTarget, permission, crew, blockTime) => {
  if (isProcessingPermission(permission)) {
    if (crew && !Permission.isPermitted(crew, permission, permissionTarget, blockTime)) {
      const processingPolicy = Permission.getPolicyDetails(permissionTarget)?.[permission];
      if (processingPolicy?.policyType === Permission.POLICY_IDS.PREPAID) {
        return processingPolicy.policyDetails;
      }
    }
  }
  return null;
};

export const getProcessorLeaseSelections = (leaseConfig, taskDuration, crewReadyAt, blockTime) => {
  let leasePayment = 0;
  let desiredLeaseTerm = 0;
  let actualLeaseTerm = 0;
  if (leaseConfig) {
    const startTime = Math.max(crewReadyAt, blockTime);
    desiredLeaseTerm = Math.ceil((startTime + taskDuration) - blockTime);
    actualLeaseTerm = Math.max(desiredLeaseTerm, leaseConfig.initialTerm);
    leasePayment = Math.ceil(leaseConfig.rate * (actualLeaseTerm / 3600));
  }
  return { leasePayment, desiredLeaseTerm, actualLeaseTerm };
};

export const getTerminatedAgreementStatus = (status) => {
  if (status === 'CANCELLED') return 'Cancelled';
  if (status === 'TRANSFERRED') return 'Transferred';
  return 'Expired';
};
