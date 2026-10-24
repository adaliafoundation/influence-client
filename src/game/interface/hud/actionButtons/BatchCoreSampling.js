import { useMemo } from 'react';

import { BatchCoreSampleIcon } from '~/components/Icons';
import useSimulationEnabled from '~/hooks/useSimulationEnabled';
import ActionButton, { getCrewDisabledReason } from './ActionButton';

// This is an asteroid-wide dialog, not a lot-specific action: it is rendered
// only in the resources panel tray and never auto-included in the lower-left
// action bar.
const isVisible = () => false;

const BatchCoreSampling = ({ asteroid, crew, onSetAction, _disabled }) => {
  const simulationEnabled = useSimulationEnabled();
  const disabledReason = useMemo(() => {
    if (_disabled) return 'loading...';
    return getCrewDisabledReason({ asteroid, crew, isSequenceable: true });
  }, [_disabled, asteroid, crew]);

  // not part of the training simulation
  if (simulationEnabled) return null;

  return (
    <ActionButton
      label="Batch Core Sampling"
      labelAddendum={disabledReason}
      flags={{ disabled: disabledReason }}
      icon={<BatchCoreSampleIcon />}
      onClick={() => onSetAction('CORE_SAMPLING')} />
  );
};

const actionDefinition = { Component: BatchCoreSampling, isVisible };

export default actionDefinition;
