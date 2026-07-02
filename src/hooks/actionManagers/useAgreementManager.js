import { useCallback, useContext, useMemo } from 'react';
import { Entity, Permission } from '@influenceth/sdk';
import { cloneDeep } from 'lodash';

import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import usePolicyManager from '~/hooks/actionManagers/usePolicyManager';
import useCrewContext from '~/hooks/useCrewContext';
import { daysToSeconds, getAgreementPath, secondsToDays } from '~/lib/utils';
import { TOKEN, TOKEN_SCALE } from '~/lib/priceUtils';

const useAgreementManager = (target, permission, agreementPath) => {
  const { crew } = useCrewContext();
  const { execute, getPendingTx } = useContext(ChainTransactionContext);
  const { currentPolicy } = usePolicyManager(target, permission);

  const currentAgreementRaw = useMemo(() => {
    return (currentPolicy?.agreements || []).find((a) => {
      if (agreementPath) return getAgreementPath(target, permission, a.permitted) === agreementPath;
      return (
        ((a.permitted?.id === crew?.id) || (crew?.Crew?.delegatedTo && a.permitted === crew?.Crew?.delegatedTo))
        && a.permission === Number(permission)
      );
    });
  }, [agreementPath, crew?.Crew?.delegatedTo, crew?.id, currentPolicy, target, permission]);

  const currentAgreement = useMemo(() => {
    if (currentAgreementRaw) {
      const agg = cloneDeep(currentAgreementRaw);
      if (agg?.rate) {
        agg.rate_swayPerSec = agg.rate / TOKEN_SCALE[TOKEN.SWAY] / 3600; // (need this precision to avoid rounding issues)
        agg.rate = agg.rate / TOKEN_SCALE[TOKEN.SWAY] * 24;  // stored in microsway per hour, UI in sway/day
      }
      if (agg?.initialTerm) agg.initialTerm = secondsToDays(agg.initialTerm); // stored in seconds, UI in days
      if (agg?.noticePeriod) agg.noticePeriod = secondsToDays(agg.noticePeriod); // stored in seconds, UI in days
      agg._canGiveNoticeStart = agg.startTime + daysToSeconds(agg.initialTerm - agg.noticePeriod);
      return agg;
    }
    return null;
  }, [currentAgreementRaw]);

  const payload = useMemo(() => ({
    target: { id: target?.id, label: target?.label },
    permission,
    // NOTE: this does not currently support account-level `permitted` values because that is
    // (currently) only relevant to whitelist and this is only used for contract + prepaid agreements
    permitted: { id: currentAgreement?.permitted?.id || crew?.id, label: Entity.IDS.CREW },
    caller_crew: { id: crew?.id, label: Entity.IDS.CREW },
  }), [crew?.id, currentAgreement, target, permission]);

  const meta = useMemo(() => ({
    lotId: target?.Location?.locations?.find((l) => l.label === Entity.IDS.LOT)?.id,
    shipId: target?.label === Entity.IDS.SHIP ? target?.id : undefined,
  }), [target]);

  const enterAgreement = useCallback((details = {}) => {
    const agreementSystem = currentPolicy.policyType === Permission.POLICY_IDS.PREPAID
      ? 'AcceptPrepaidAgreement'
      : 'AcceptContractAgreement';
    // TODO: AcceptPrepaidMerkleAgreement (needs `term` and `merkle_proof`)
    execute(
      agreementSystem,
      { ...payload, ...details },
      meta
    );
  }, [currentPolicy, execute, meta, payload]);

  const extendAgreement = useCallback((details = {}) => {
    const { term, ...params } = details;
    execute(
      'ExtendPrepaidAgreement',
      { ...payload, added_term: term, ...params },
      meta
    );
  }, [execute, meta, payload]);

  const cancelAgreement = useCallback((params = {}) => {
    execute(
      'CancelPrepaidAgreement',
      { agreementPath, ...params, ...payload },
      meta
    );
  }, [agreementPath, execute]);

  const transferAgreement = useCallback((newPermitted) => {
    execute(
      'TransferPrepaidAgreement',
      { new_permitted: newPermitted, ...payload },
      meta
    );
  }, []);

  const pendingChange = useMemo(
    () => {
      if (getPendingTx) {
        return getPendingTx('AcceptPrepaidAgreement', { ...payload })
          || getPendingTx('AcceptContractAgreement', { ...payload })
          || getPendingTx('AcceptPrepaidMerkleAgreement', { ...payload })
          || getPendingTx('ExtendPrepaidAgreement', { ...payload })
          || getPendingTx('CancelPrepaidAgreement', { ...payload })
          || getPendingTx('TransferPrepaidAgreement', { ...payload })
      }
      return null;
    },
    [payload, getPendingTx]
  );

  return {
    currentAgreement,
    currentAgreementRaw,
    currentPolicy,

    enterAgreement,
    extendAgreement,
    cancelAgreement,
    transferAgreement,

    pendingChange
  };
};

export default useAgreementManager;
