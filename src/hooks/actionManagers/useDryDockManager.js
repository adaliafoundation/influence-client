import useFailureReporter from '../useFailureReporter';
import { useCallback, useContext, useMemo } from 'react';
import { DryDock, Entity, Permission } from '@influenceth/sdk';

import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import useBlockTime from '~/hooks/useBlockTime';
import useCrewContext from '~/hooks/useCrewContext';
import useLot from '~/hooks/useLot';
import useUnresolvedActivities from '~/hooks/useUnresolvedActivities';
import actionStages from '~/lib/actionStages';

const useDryDockManager = (lotId, slot = 1) => {
  const reportBlocked = useFailureReporter();
  const blockTime = useBlockTime();
  const { execute, getPendingTx, getStatus } = useContext(ChainTransactionContext);
  const { crew, crewCan, authorize, recheckAuthorization } = useCrewContext();
  const { data: lot } = useLot(lotId);
  const { data: actionItems } = useUnresolvedActivities(lot?.building);

  const payload = useMemo(() => ({
    dry_dock: { id: lot?.building?.id, label: Entity.IDS.BUILDING },
    dry_dock_slot: slot,
    caller_crew: { id: crew?.id, label: Entity.IDS.CREW }
  }), [lot?.building, crew?.id, slot]);

  const slotDryDock = useMemo(() => lot?.building?.DryDocks?.find((e) => e.slot === slot), [lot?.building, slot]);

  // status flow
  // READY > ASSEMBLING > READY_TO_FINISH > FINISHING
  const [currentAssembly, assemblyStatus, actionStage] = useMemo(() => {
    let current = {
      _cachedData: null,
      _isAccessible: false,
      finishTime: null,
      origin: null,
      originSlot: null,
      shipId: null,
      shipType: null,
      startTime: null,
    };
  
    let status = 'READY';
    let stage = actionStages.NOT_STARTED;
    if (slotDryDock?.status === DryDock.STATUSES.RUNNING) {
      let actionItem = (actionItems || []).find((item) => (
        item.event.name === 'ShipAssemblyStarted'
        && item.event.returnValues.dryDock.id === lot.building.id
        && item.event.returnValues.dryDockSlot === slot
      ));
      if (actionItem) {
        current._cachedData = actionItem.data;
        current.origin = actionItem.event.returnValues.origin;
        current.originSlot = actionItem.event.returnValues.originSlot;
        current.shipType = actionItem.event.returnValues.shipType;
        current.startTime = actionItem._startTime || actionItem.event.timestamp;
        const control = authorize('controls', [crew, slotDryDock.outputShip], [crew, slotDryDock.outputShip]);
        current._isAccessible = control.status === 'allowed'
          || (control.status === 'denied' && crewCan(Permission.IDS.ASSEMBLE_SHIP, lot.building));
      }
      current.shipId = slotDryDock?.outputShip.id;
      current.finishTime = slotDryDock?.finishTime;
      
      if(getStatus('AssembleShipFinish', payload) === 'pending') {
        status = 'FINISHING';
        stage = actionStages.COMPLETING;
      } else if (slotDryDock?.finishTime && slotDryDock.finishTime <= blockTime) {
        status = 'READY_TO_FINISH';
        stage = actionStages.READY_TO_COMPLETE;
      } else {
        status = 'ASSEMBLING';
        stage = current.startTime > blockTime ? actionStages.SCHEDULED : actionStages.IN_PROGRESS;
      }
    } else {
      const startTx = getPendingTx('LeaseAndAssembleShipStart', payload) || getPendingTx('AssembleShipStart', payload);
      if (startTx) {
        current.origin = startTx.vars.origin;
        current.originSlot = startTx.vars.origin_slot;
        current.shipType = startTx.vars.ship_type;
        status = 'ASSEMBLING';
        stage = actionStages.STARTING;
      }
    }

    return [
      status === 'READY' ? null : current,
      status,
      stage
    ];
  }, [actionItems, blockTime, getPendingTx, getStatus, payload, slotDryDock, authorize, crew, crewCan, lot?.building]);

  const startShipAssembly = useCallback((shipType, origin, originSlot, leaseDetails) => {
    return execute(
      leaseDetails ? 'LeaseAndAssembleShipStart' : 'AssembleShipStart',
      {
        ...payload,
        ship_type: shipType,
        origin: { id: origin.id, label: origin.label },
        origin_slot: originSlot,
        lease: leaseDetails
      },
      {
        lotId
      }
    )
  }, [execute, payload]);

  const finishShipAssembly = useCallback(async (destination) => {
    const ship = slotDryDock?.outputShip;
    const control = await recheckAuthorization('controls', [crew, ship], [crew, ship]);
    if (control.status === 'unresolved') return reportBlocked(control);
    if (control.status === 'denied') {
      const access = await recheckAuthorization('can', [crew, lot?.building, Permission.IDS.ASSEMBLE_SHIP], [crew, lot?.building]);
      if (access.status !== 'allowed') return reportBlocked(access);
    }
    if (destination?.label === Entity.IDS.BUILDING) {
      const access = await recheckAuthorization('spaceportProtection', [crew, ship, destination], [crew, ship, destination]);
      if (access.status !== 'allowed') return reportBlocked(access);
    }
    return execute(
      'AssembleShipFinish', 
      {
        ...payload,
        destination: { id: destination.id, label: destination.label }
      },
      {
        lotId,
        shipType: currentAssembly?.shipType
      }
    );
  }, [reportBlocked, currentAssembly?.shipType, execute, payload, recheckAuthorization, crew, lot?.building, slotDryDock?.outputShip]);

  return {
    startShipAssembly,
    finishShipAssembly,

    assemblyStatus,
    currentAssembly,
    actionStage
  };
};

export default useDryDockManager;
