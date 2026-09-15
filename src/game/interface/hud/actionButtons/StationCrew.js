import { useCallback, useMemo } from 'react';
import { Permission, Station } from '@influenceth/sdk';

import { StationCrewIcon, StationPassengersIcon } from '~/components/Icons';
import ActionButton, { getCrewDisabledReason } from './ActionButton';
import useStationCrewManager from '~/hooks/actionManagers/useStationCrewManager';
import useCoachmarkRefSetter from '~/hooks/useCoachmarkRefSetter';
import { COACHMARK_IDS } from '~/contexts/CoachmarkContext';

const isVisible = ({ crew, building, ship }) => {
  return crew && (
    (
      building?.Station
      && crew._location?.buildingId !== building.id
    )
    ||
    (
      ship?.Station
      && crew._location?.shipId !== ship.id
    )
  );
};

const StationCrew = ({ accountCrewIds, asteroid, blockTime, crew, lot, ship, onSetAction, simulation, simulationActions, _disabled }) => {
  const stationEntity = useMemo(() => ship || (lot?.building?.Station ? lot.building : null), [ship, lot?.building]);
  const { currentStationing } = useStationCrewManager(stationEntity);
  const setCoachmarkRef = useCoachmarkRefSetter();

  const crewIsController = useMemo(
    () => accountCrewIds?.includes(stationEntity?.Control?.controller?.id),
    [accountCrewIds, stationEntity?.Control?.controller?.id]
  );
  
  const handleClick = useCallback(() => {
    onSetAction(crewIsController ? 'STATION_CREW' : 'STATION_CREW_AS_GUESTS');
  }, [crewIsController, onSetAction]);

  const disabledReason = useMemo(() => {
    if (_disabled || !stationEntity) return 'loading...';
    if (!currentStationing) {
      const stationConfig = Station.TYPES[stationEntity.Station?.stationType];
      if (stationConfig.cap && (stationEntity.Station?.population + crew._crewmates.length) > stationConfig.cap) {
        return 'station is too full';
      }
      return getCrewDisabledReason({
        asteroid,
        blockTime,
        crew,
        isAllowedInSimulation: simulationActions.includes('StationCrew'),
        permission: Permission.IDS.STATION_CREW,
        permissionTarget: stationEntity,
        requireSurface: false
      });
    }
    return '';
  }, [_disabled, asteroid, blockTime, crew, crewIsController, currentStationing, simulationActions, stationEntity]);

  const buttonParams = useMemo(() => {
    if (ship) {
      if (crewIsController) {
        return {
          label: 'Station Flight Crew',
          icon: <StationCrewIcon />
        }
      } else {
        return {
          label: 'Station Crew as Passengers',
          icon: <StationPassengersIcon />
        }
      }
    }
    return {
      label: 'Station Crew',
      icon: <StationCrewIcon />
    }
  }, [crewIsController, ship]);

  return (
    <ActionButton
      ref={setCoachmarkRef(COACHMARK_IDS.actionButtonStationCrew)}
      {...buttonParams}
      labelAddendum={disabledReason}
      enablePrelaunch
      flags={{
        attention: !disabledReason && simulation,
        disabled: disabledReason,
        loading: !!currentStationing
      }}
      onClick={handleClick} />
  );
};

const actionDefinition = { Component: StationCrew, isVisible };

export default actionDefinition;
