import { useCallback, useMemo } from 'react';
import { Permission } from '@influenceth/sdk';

import { FormAgreementIcon, FormLotAgreementIcon } from '~/components/Icons';
import useAgreementManager from '~/hooks/actionManagers/useAgreementManager';
import useStore from '~/hooks/useStore';
import ActionButton from './ActionButton';
import useSimulationEnabled from '~/hooks/useSimulationEnabled';

const isVisible = () => false;

const FormAgreement = ({ entity, permission, _disabled }) => {
  const { pendingChange } = useAgreementManager(entity, permission);
  const simulationEnabled = useSimulationEnabled();
  
  const onSetAction = useStore(s => s.dispatchActionDialog);

  const handleClick = useCallback(() => {
    onSetAction('FORM_AGREEMENT', { entity, permission });
  }, [entity, permission]);

  const disabledReason = useMemo(() => {
    // if (_disabled) return 'loading...';
    if (pendingChange) return 'updating...';
    if (simulationEnabled) return 'simulation restricted';
    return '';
  }, [_disabled, pendingChange, simulationEnabled]);

  return (
    <ActionButton
      label="Form Agreement"
      labelAddendum={disabledReason}
      flags={{
        disabled: _disabled || disabledReason,
        loading: pendingChange
      }}
      icon={permission === Permission.IDS.USE_LOT ? <FormLotAgreementIcon /> : <FormAgreementIcon /> }
      onClick={handleClick} />
  );
};

const actionDefinition = { Component: FormAgreement, isVisible };

export default actionDefinition;