import { useCallback, useContext, useMemo } from 'react';
import { Address, Entity, Permission } from '@influenceth/sdk';

import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import useCrewContext from '~/hooks/useCrewContext';
import { daysToSeconds, safeBigInt, secondsToDays } from '~/lib/utils';
import useBlockTime from '../useBlockTime';

const usePolicyManager = (target, permission) => {
  const blockTime = useBlockTime();
  const { crew } = useCrewContext();
  const { execute, getStatus } = useContext(ChainTransactionContext);

  const payload = useMemo(() => ({
    target: { id: target?.id, label: target?.label },
    permission,
    caller_crew: { id: crew?.id, label: Entity.IDS.CREW },
  }), [crew?.id, target, permission]);

  const meta = useMemo(() => ({
    asteroidId: target?.label === Entity.IDS.ASTEROID ? target?.id : undefined,
    lotId: (target?.Location?.locations || []).find((l) => l?.label === Entity.IDS.LOT)?.id,
    shipId: target?.label === Entity.IDS.SHIP ? target?.id : undefined,
  }), [target]);

  // using json to avoid unnecessary re-renders
  const policyJSON = useMemo(() => {
    return target
      ? JSON.stringify(Permission.getPolicyDetails(target, crew, blockTime)[permission])
      : undefined;
  }, [blockTime, crew, target, permission]);

  const currentPolicy = useMemo(() => {
    if (!target) return undefined;
    if (!policyJSON) return undefined;
    const pol = JSON.parse(policyJSON);

    if (pol?.policyDetails && pol.policyType === Permission.POLICY_IDS.CONTRACT) pol.policyDetails.contract = pol.policyDetails.address;
    if (pol?.policyDetails && pol.policyType === Permission.POLICY_IDS.PREPAID) {
      // stored in microsway per hour, UI in sway/mo
      pol.policyDetails.rate = Number(safeBigInt(pol.policyDetails.rate)) / 1e6;
      // stored in seconds, UI in months
      pol.policyDetails.initialTerm = secondsToDays(pol.policyDetails.initialTerm || 0);
      // stored in seconds, UI in months
      pol.policyDetails.noticePeriod = secondsToDays(pol.policyDetails.noticePeriod || 0);
    };

    return pol;
  }, [policyJSON]);

  const updateAllowlists = useCallback((newAllowlist, newAccountAllowlist) => {
    execute(
      'UpdateAllowlists',
      {
        additions: (newAllowlist || []).filter((a) => !(currentPolicy?.allowlist || []).find((b) => a.id === b.id)),
        removals: (currentPolicy?.allowlist || []).filter((a) => !newAllowlist.find((b) => a.id === b.id)),
        accountAdditions: (newAccountAllowlist || []).filter((a) => !(currentPolicy?.accountAllowlist || []).find((b) => Address.areEqual(a, b))),
        accountRemovals: (currentPolicy?.accountAllowlist || []).filter((a) => !newAccountAllowlist.find((b) => Address.areEqual(a, b))),
        ...payload
      },
      meta
    );
  }, [currentPolicy?.allowlist, currentPolicy?.accountAllowlist, execute, meta, payload]);

  const getPolicyUpdateParams = useCallback((newPolicyType, newPolicyDetails) => {
    const params = {
      ...payload,
      // for prepaid...
      rate: Math.floor(newPolicyDetails.rate * 1e6), // sway/mo --> msway/hr
      initial_term: daysToSeconds(newPolicyDetails.initialTerm),
      notice_period: daysToSeconds(newPolicyDetails.noticePeriod),
      // for contract...
      contract: newPolicyDetails.contract,
    };

    const currentPolicyConfig = Permission.POLICY_TYPES[currentPolicy?.policyType];
    if (currentPolicyConfig?.removalSystem) {
      params.remove = currentPolicyConfig?.removalSystem;
    }
    const newPolicyConfig = Permission.POLICY_TYPES[newPolicyType];
    if (newPolicyConfig?.additionSystem) {
      params.add = newPolicyConfig?.additionSystem;
    }

    return params;
  }, [currentPolicy, payload]);

  const updatePolicy = useCallback(
    (newPolicyType, newPolicyDetails) => {
      const params = getPolicyUpdateParams(newPolicyType, newPolicyDetails);
      execute('UpdatePolicy', params, meta);
    },
    [execute, getPolicyUpdateParams, meta]
  );

  const updateAuctionSettings = useCallback(
    ({ mode, gracePeriod }) => {
      execute(
        'ConfigurePrepaidAuction',
        {
          asteroid: { id: target?.id, label: Entity.IDS.ASTEROID },
          mode,
          grace_period: daysToSeconds(gracePeriod || 0),
          caller_crew: { id: crew?.id, label: Entity.IDS.CREW },
        },
        meta
      );
    },
    [crew?.id, execute, meta, target?.id]
  );

  const updatePolicyAndAuctionSettings = useCallback(
    (newPolicyType, newPolicyDetails, auctionDetails) => {
      execute(
        'UpdatePolicyAndAuctionSettings',
        {
          ...getPolicyUpdateParams(newPolicyType, newPolicyDetails),
          auctionSettings: {
            asteroid: { id: target?.id, label: Entity.IDS.ASTEROID },
            mode: auctionDetails.mode,
            grace_period: daysToSeconds(auctionDetails.gracePeriod || 0),
            caller_crew: { id: crew?.id, label: Entity.IDS.CREW },
          }
        },
        meta
      );
    },
    [crew?.id, execute, getPolicyUpdateParams, meta, target?.id]
  );

  const allowlistChangePending = useMemo(
    () => (getStatus ? getStatus('updateAllowlists', { ...payload }) : 'ready') === 'pending',
    [payload, getStatus]
  );
  const policyChangePending = useMemo(
    () => getStatus
      ? (
        getStatus('UpdatePolicy', { ...payload }) === 'pending' ||
        getStatus('UpdatePolicyAndAuctionSettings', { ...payload }) === 'pending'
      )
      : false,
    [payload, getStatus]
  );
  const auctionSettingsChangePending = useMemo(
    () => (getStatus ? getStatus('ConfigurePrepaidAuction', {
      asteroid: { id: target?.id, label: Entity.IDS.ASTEROID },
      caller_crew: { id: crew?.id, label: Entity.IDS.CREW },
    }) : 'ready') === 'pending',
    [crew?.id, getStatus, target?.id]
  );

  return {
    currentPolicy,
    updateAllowlists,
    updatePolicy,
    updateAuctionSettings,
    updatePolicyAndAuctionSettings,

    allowlistChangePending,
    auctionSettingsChangePending,
    policyChangePending
  };
};

export default usePolicyManager;
