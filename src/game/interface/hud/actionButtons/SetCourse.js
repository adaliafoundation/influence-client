import { useCallback, useMemo } from 'react';
import { Asteroid } from '@influenceth/sdk';

import { SetCourseIcon } from '~/components/Icons';
import useStore from '~/hooks/useStore';
import ActionButton, { getCrewDisabledReason } from './ActionButton';
import useShipTravelManager from '~/hooks/actionManagers/useShipTravelManager';
import useTravelSolutionIsValid from '~/hooks/useTravelSolutionIsValid';
import useAsteroid from '~/hooks/useAsteroid';
import { COACHMARK_IDS } from '~/contexts/CoachmarkContext';
import useCoachmarkRefSetter from '~/hooks/useCoachmarkRefSetter';

const isVisible = ({ openHudMenu, /*asteroid, crew, ship, zoomStatus*/ }) => {
  return openHudMenu === 'BELT_PLAN_FLIGHT';
  // crew && (
  //   (asteroid && zoomStatus === 'out') || (
  //     ship
  //     && ship.Control?.controller?.id === crew.id
  //     && !ship._location.lotId  // in orbit
  //   )
  // );
};

const SetCourse = ({ asteroid, crew, ship, onSetAction, simulation, simulationActions, _disabled }) => {
  const inEscapeModule = !crew?._location?.shipId && crew?.Ship?.emergencyAt > 0;
  const { currentTravelAction, travelStatus } = useShipTravelManager(inEscapeModule ? crew : crew?._location?.shipId);
  const travelSolutionIsValid = useTravelSolutionIsValid();
  const travelSolution = useStore(s => s.asteroids.travelSolution);
  const { data: destination } = useAsteroid(travelSolution?.destinationId);
  const setCoachmarkRef = useCoachmarkRefSetter();

  const handleClick = useCallback(() => {
    onSetAction('SET_COURSE');
  }, [travelSolution]);

  const validDestination = useMemo(() => {
    return destination?.Celestial?.scanStatus >= Asteroid.SCAN_STATUSES.SURFACE_SCANNED;
  }, [destination]);

  const disabledReason = useMemo(() => {
    if (_disabled) return 'loading...';
    if (!crew?._location?.shipId && !inEscapeModule) return 'crew is not on ship';
    if (travelStatus === 'READY') {
      if (!travelSolution) return 'no travel solution';
      if (crew?._location?.shipId !== travelSolution.shipId && !inEscapeModule) return 'crew is not on ship';
      if (travelSolution._isSimulation) return 'simulated solution';
      if (travelSolution.originId !== crew?._location?.asteroidId) return 'invalid travel origin';
      if (!travelSolutionIsValid) return 'invalid travel solution';
      if ((inEscapeModule ? crew?.Ship?.transitDeparture : ship?.Ship?.transitDeparture) > 0) return 'ship is in flight';
      if (ship?._location?.lotId) return 'ship is docked';
      if (!validDestination) return 'destination not scanned';
      return getCrewDisabledReason({
        crew,
        isAllowedInSimulation: simulationActions.includes('SetCourse')
      });
    }
    if (simulation && !simulationActions.includes('SetCourse')) return 'simulation restricted';
    return '';
  }, [_disabled, asteroid, crew, ship, simulationActions, travelSolution, travelSolutionIsValid]);

  return (
    <ActionButton
      ref={setCoachmarkRef(COACHMARK_IDS.actionButtonSetCourse)}
      label="Set Course"
      labelAddendum={disabledReason}
      flags={{
        attention: crew && travelStatus === 'READY' && !disabledReason,
        disabled: disabledReason,
        loading: travelStatus !== 'READY',
        finishTime: currentTravelAction?.finishTime
      }}
      icon={<SetCourseIcon />}
      onClick={handleClick} />
  );
};

const actionDefinition = { Component: SetCourse, isVisible };

export default actionDefinition;