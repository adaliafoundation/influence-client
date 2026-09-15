import { useCallback, useEffect } from 'react';

import { SimulateRouteIcon } from '~/components/Icons';
import useStore from '~/hooks/useStore';
import ActionButton from './ActionButton';
import useShipTravelManager from '~/hooks/actionManagers/useShipTravelManager';
import useCoachmarkRefSetter from '~/hooks/useCoachmarkRefSetter';
import { COACHMARK_IDS } from '~/contexts/CoachmarkContext';

const isVisible = ({ accountCrewIds, asteroid, crew, ship, zoomStatus }) => {
  if (!ship && crew?.Ship?.emergencyAt > 0) return true; // crew is in escape module

  return crew && (
    (asteroid && zoomStatus === 'out') || (
      ship
      && accountCrewIds?.includes(ship.Control?.controller?.id)
      && !ship._location.lotId  // in orbit
    )
  );
};

const SelectTravelDestination = ({ crew, simulation, simulationActions }) => {
  const inEscapeModule = !crew?._location?.shipId && crew?.Ship?.emergencyAt > 0;
  const { travelStatus, inOrbit } = useShipTravelManager(inEscapeModule ? crew : crew?._location?.shipId);
  const origin = useStore(s => s.asteroids.origin);
  const destination = useStore(s => s.asteroids.destination);
  const inTravelMode = useStore(s => s.asteroids.travelMode);
  const dispatchDestinationSelected = useStore(s => s.dispatchDestinationSelected);
  const dispatchHudMenuOpened = useStore(s => s.dispatchHudMenuOpened);
  const dispatchTravelMode = useStore(s => s.dispatchTravelMode);
  const dispatchZoomStatusChanged = useStore(s => s.dispatchZoomStatusChanged);
  const zoomStatus = useStore(s => s.asteroids.zoomStatus);
  const setCoachmarkRef = useCoachmarkRefSetter();

  const canSelect = inTravelMode && zoomStatus === 'out';
  const handleClick = useCallback(() => {
    if (zoomStatus !== 'out') {
      dispatchZoomStatusChanged('zooming-out');
      dispatchTravelMode(true);
    } else if (canSelect) {
      dispatchTravelMode(false);
      dispatchDestinationSelected();
      dispatchHudMenuOpened();
    } else {
      dispatchTravelMode(true);
    }
  }, [dispatchTravelMode, dispatchDestinationSelected, dispatchHudMenuOpened, inTravelMode, zoomStatus]);

  useEffect(() => {
    if (origin && destination && inTravelMode) {
      dispatchHudMenuOpened('BELT_PLAN_FLIGHT');
    }
  }, [dispatchHudMenuOpened, destination, inTravelMode, origin]);
  const canBeReal = (crew?._location?.shipId || inEscapeModule) && travelStatus === 'READY' && inOrbit;
  const planOrSimulate = canBeReal ? 'Create' : 'Simulate';
  const planningOrSimulation = canBeReal ? 'Planning' : 'Simulation';

  // TODO: ever disable this? probably not, but maybe if specific
  //  ship is selected and uncrewed or something?
  return (
    <ActionButton
      ref={setCoachmarkRef(COACHMARK_IDS.actionButtonSelectDestination)}
      flags={{ active: !!canSelect, disabled: simulation && !simulationActions.includes('PlanFlight') }}
      label={canSelect ? `Cancel ${planningOrSimulation}` : `${planOrSimulate} Flight Plan`}
      labelAddendum={simulation && !simulationActions.includes('PlanFlight') ? 'simulation restricted' : ''}
      icon={<SimulateRouteIcon />}
      onClick={handleClick} />
  );
};

const actionDefinition = { Component: SelectTravelDestination, isVisible };

export default actionDefinition;
