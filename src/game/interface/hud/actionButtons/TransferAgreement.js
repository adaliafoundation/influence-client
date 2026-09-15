import { useCallback, useMemo } from 'react';

import { TransferAgreementIcon } from '~/components/Icons';
import ActionButton from './ActionButton';
import useAgreementManager from '~/hooks/actionManagers/useAgreementManager';
import useSimulationEnabled from '~/hooks/useSimulationEnabled';

const isVisible = () => false;

const TransferAgreement = ({ entity, permission, onSetAction, _disabled }) => {
  const { currentAgreement, pendingChange } = useAgreementManager(entity, permission);
  const simulationEnabled = useSimulationEnabled();
  
  const handleClick = useCallback(() => {
    onSetAction('TRANSFER_AGREEMENT', { entity, permission });
  }, [entity, permission]);

  const disabledReason = useMemo(() => {
    if (_disabled) return 'loading...';
    if (pendingChange) return 'updating...';
    if (!currentAgreement) return 'agreement inactive';
    if (simulationEnabled) return 'simulation restricted';
    return '';
  }, [_disabled, !currentAgreement, pendingChange, simulationEnabled]);

  return (
    <ActionButton
      label="Transfer Agreement"
      labelAddendum={disabledReason}
      flags={{
        disabled: _disabled || disabledReason,
        loading: pendingChange
      }}
      icon={<TransferAgreementIcon />}
      onClick={handleClick} />
  );
};

const actionDefinition = { Component: TransferAgreement, isVisible };

export default actionDefinition;