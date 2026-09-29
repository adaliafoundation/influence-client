import useCrewContext from '~/hooks/useCrewContext';
import { useCallback, useMemo } from 'react';
import { Entity } from '@influenceth/sdk';

import { EjectPassengersIcon } from '~/components/Icons';
import useEjectCrewManager from '~/hooks/actionManagers/useEjectCrewManager';
import useStationedCrews from '~/hooks/useStationedCrews';
import theme from '~/theme';
import ActionButton, { getCrewDisabledReason } from './ActionButton';

const isVisible = ({ crew, building, ship }) => !!crew && !!(ship || building)?.Station;

const EjectGuestCrew = ({ asteroid, blockTime, crew, lot, ship, onSetAction, dialogProps = {}, _disabled }) => {
  const { authorize } = useCrewContext();
  const [station, entityId] = useMemo(() => {
    const station = ship || lot?.building;
    const entityId = { id: station.id, label: station.label };
    return [station, entityId];
  }, [ship, lot]);

  const { currentEjections } = useEjectCrewManager(entityId);
  const { data: allStationedCrews } = useStationedCrews(entityId);
  const allGuestCrews = useMemo(() => (allStationedCrews || []).filter((c) => c.id !== crew?.id), [allStationedCrews, crew?.id]);

  const handleClick = useCallback(() => {
    onSetAction('EJECT_GUEST_CREW', { origin: station, ...dialogProps });
  }, [station, onSetAction, dialogProps]);

  const activeEjections = useMemo(() => {
    return currentEjections?.filter((e) => e.vars.ejected_crew.id === crew?.id);
  }, [currentEjections, crew?.id]);

  // Differentiate between a Habitat and a ship
  const actionLabel = useMemo(() => {
    return `Force Eject ${entityId?.label === Entity.IDS.SHIP ? 'Passenger' : 'Resident'} Crew`;
  }, [entityId]);

  const disabledReason = useMemo(() => {
    if (_disabled) return 'loading...';
    if (allGuestCrews?.length === 0) return 'no guests';
    const guests = dialogProps?.guestId ? allGuestCrews.filter((c) => c.id === dialogProps.guestId) : allGuestCrews;
    const decisions = guests.map((guest) => authorize('crewEviction', [crew, guest], [crew, guest, station]));
    if (!decisions.some((decision) => decision.status === 'allowed')) {
      return decisions.some((decision) => decision.status === 'unresolved') ? 'checking guest permissions' : 'guests have permission to remain';
    }

    return getCrewDisabledReason({ crew });
  }, [_disabled, allGuestCrews, asteroid, blockTime, crew, station, authorize, dialogProps?.guestId]);

  return (
    <ActionButton
      label={actionLabel}
      labelAddendum={disabledReason}
      flags={{
        disabled: disabledReason,
        loading: activeEjections?.length > 0
      }}
      icon={<EjectPassengersIcon />}
      onClick={handleClick}
      overrideColor={theme.colors.red} />
  );
};

const actionDefinition = { Component: EjectGuestCrew, isVisible };

export default actionDefinition;