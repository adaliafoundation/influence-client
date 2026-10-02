import { useCallback, useContext, useMemo } from 'react';
import { Entity } from '@influenceth/sdk';

import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import useCrewContext from '~/hooks/useCrewContext';
import actionStages from '~/lib/actionStages';

const useShipEmergencyManager = () => {
  const { execute, getStatus } = useContext(ChainTransactionContext);
  const { crew } = useCrewContext();

  const caller_crew = useMemo(() => ({ id: crew?.id, label: Entity.IDS.CREW }), [crew?.id]);

  const activateEmergencyMode = useCallback(() => {
    return execute(
      'ActivateEmergency',
      { caller_crew },
      {/* TODO: meta? */}
    );
  }, [caller_crew, execute]);

  const deactivateEmergencyMode = useCallback(() => {
    return execute(
      'DeactivateEmergency',
      { caller_crew },
      {/* TODO: meta? */}
    );
  }, [execute]);

  const collectEmergencyPropellant = useCallback(() => {
    return execute(
      'CollectEmergencyPropellant',
      { caller_crew },
      {/* TODO: meta? */}
    );
  }, [execute]);

  const isActivating = useMemo(
    () => getStatus('ActivateEmergency', { caller_crew }) === 'pending',
    [getStatus, caller_crew]
  );
  const isDeactivating = useMemo(
    () => getStatus('DeactivateEmergency', { caller_crew }) === 'pending',
    [getStatus, caller_crew]
  );
  const isCollecting = useMemo(
    () => getStatus('CollectEmergencyPropellant', { caller_crew }) === 'pending',
    [getStatus, caller_crew]
  );

  return {
    activateEmergencyMode,
    deactivateEmergencyMode,
    collectEmergencyPropellant,

    isActivating,
    isDeactivating,
    isCollecting,

    actionStage: (isActivating || isDeactivating || isCollecting) ? actionStages.STARTING : actionStages.NOT_STARTED,
  };
};

export default useShipEmergencyManager;
