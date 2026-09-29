import { useCallback, useEffect, useMemo, useRef } from 'react';
import cloneDeep from 'lodash/cloneDeep';
import { Asteroid, Building, Crewmate, Entity, Permission, Station } from '@influenceth/sdk';

import { StationCrewIcon, StationPassengersIcon } from '~/components/Icons';
import useCrewContext from '~/hooks/useCrewContext';
import { reactBool, formatTimer, locationsArrToObj, getCrewAbilityBonuses } from '~/lib/utils';

import {
  ActionDialogFooter,
  ActionDialogHeader,
  ActionDialogStats,
  ActionDialogBody,
  FlexSection,
  FlexSectionSpacer,
  MiniBarChart,
  CrewInputBlock,
  SwayInputBlock,
  TransferDistanceDetails,
  TransferDistanceTitleDetails,
  ShipInputBlock,
  LotInputBlock,
  getBonusDirection,
  TimeBonusTooltip,
  formatTimeRequirements
} from './components';
import useLot from '~/hooks/useLot';
import useStore from '~/hooks/useStore';
import { ActionDialogInner } from '../ActionDialog';
import actionStages from '~/lib/actionStages';
import theme from '~/theme';
import useCrew from '~/hooks/useCrew';
import useAsteroid from '~/hooks/useAsteroid';
import CrewIndicator from '~/components/CrewIndicator';
import useStationCrewManager from '~/hooks/actionManagers/useStationCrewManager';
import useEntity from '~/hooks/useEntity';

const StationCrew = ({ asteroid, destination: rawDestination, lot, origin: rawOrigin, stationCrewManager, stage, ...props }) => {
  const { stationCrew } = stationCrewManager;
  const { accountCrewIds, crew, crewCan } = useCrewContext();

  const crewTravelBonus = useMemo(() => {
    if (!crew) return {};
    return getCrewAbilityBonuses(Crewmate.ABILITY_IDS.HOPPER_TRANSPORT_TIME, crew) || {};
  }, [crew]);

  const crewDistBonus = useMemo(() => {
    if (!crew) return {};
    return getCrewAbilityBonuses(Crewmate.ABILITY_IDS.FREE_TRANSPORT_DISTANCE, crew) || {};
  }, [crew]);

  const origin = useMemo(() => {
    if (!rawOrigin) return null;
    const newOrigin = cloneDeep(rawOrigin);
    newOrigin._location = locationsArrToObj(newOrigin?.Location?.locations || []);
    newOrigin._inOrbit = !newOrigin?._location.lotId;
    return newOrigin;
  }, [rawOrigin]);

  const destination = useMemo(() => {
    if (!rawDestination) return null;
    const newDestination = cloneDeep(rawDestination);
    newDestination._location = locationsArrToObj(newDestination?.Location?.locations || []);
    newDestination._inOrbit = !newDestination?._location.lotId;
    return newDestination;
  }, [rawDestination]);

  const [crewIsOwner, crewIsController] = useMemo(() => ([
    accountCrewIds?.includes(destination?.Control?.controller?.id),
    destination?.Control?.controller?.id === crew?.id
  ]), [accountCrewIds, destination?.Control?.controller?.id, crew?.id]);

  const { data: destinationOwner } = useCrew(destination?.Control?.controller?.id);
  const { data: destinationLot } = useLot(destination?._location?.lotId);
  const { data: originLot } = useLot(origin?._location?.lotId);

  const [travelDistance, travelTime] = useMemo(() => {
    if (!origin._location || !destination._location) return [0, 0];
    return [
      Asteroid.getLotDistance(asteroid?.id, origin._location.lotIndex || 0, destination._location.lotIndex || 0),
      formatTimeRequirements(
        Asteroid.getLotTravelTimeReal(
          asteroid?.id,
          origin._location.lotIndex || 0,
          destination._location.lotIndex || 0,
          crewTravelBonus.totalBonus,
          crewDistBonus.totalBonus,
          crew?._timeAcceleration
        )
      )
    ];
  }, [asteroid?.id, origin?.id, destination?.id, crewDistBonus, crewTravelBonus, crew?._timeAcceleration]);

  const stats = useMemo(() => ([
    {
      label: 'Travel Time',
      value: formatTimer(travelTime?.total || 0),
      direction: getBonusDirection(crewTravelBonus),
      isTimeStat: true,
      tooltip: (
        <TimeBonusTooltip
          bonus={crewTravelBonus}
          title="Transport Time"
          totalTime={travelTime?.total || 0}
          crewRequired="start" />
      )
    },
    {
      label: 'Crewmates Restationed',
      value: crew?._crewmates?.length || 0,
      direction: 0,
    },
  ]), [crewTravelBonus, travelTime?.total]);

  const onStation = useCallback(() => {
    stationCrew();
  }, [stationCrew]);

  // handle auto-closing
  const lastStatus = useRef();
  useEffect(() => {
    if (lastStatus.current && stage !== lastStatus.current) {
      props.onClose();
    }
    lastStatus.current = stage;
  }, [stage]);

  const actionDetails = useMemo(() => {
    const icon = destination?.label === Entity.IDS.SHIP && !crewIsController
      ? <StationPassengersIcon />
      : <StationCrewIcon />;
    const label = destination?.label === Entity.IDS.SHIP
      ? (crewIsController ? 'Station Flight Crew' : 'Station Passengers')
      : 'Station Crew';
    const status = stage === actionStages.NOT_STARTED
      ? (
        destination?.label === Entity.IDS.SHIP
          ? `Send to ${crewIsOwner ? 'My ' : ''} Ship`
          : `Send to ${Building.TYPES[destination?.Building?.buildingType]?.name}`
      )
      : undefined;
    return { icon, label, status };
  }, [crewIsController, crewIsOwner, destination, stage]);

  const stationConfig = destination ? Station.TYPES[destination.Station?.stationType] : null;

  return (
    <>
      <ActionDialogHeader
        action={actionDetails}
        actionCrew={crew}
        crewAvailableTime={travelTime}
        location={{
          asteroid,
          lot,
          ship: destination?.label === Entity.IDS.SHIP ? destination : null
        }}
        onClose={props.onClose}
        overrideColor={stage === actionStages.NOT_STARTED ? (crewIsOwner ? theme.colors.main : theme.colors.green) : undefined}
        stage={stage} />

      <ActionDialogBody>
        <FlexSection>
          {(origin.label === Entity.IDS.SHIP || !originLot)
            ? (
              <ShipInputBlock
                title="Origin"
                ship={origin.label === Entity.IDS.SHIP ? origin : crew}
                disabled />
            )
            : (
              <LotInputBlock
                title="Origin"
                lot={originLot}
                disabled
              />
            )
          }

          <FlexSectionSpacer />

          {destination.label === Entity.IDS.SHIP
            ? (
              <ShipInputBlock
                title="Destination"
                titleDetails={
                  origin._location.lotIndex === 0 && destination._location.lotIndex === 0
                    ? <TransferDistanceTitleDetails><label>Orbital Transfer</label></TransferDistanceTitleDetails>
                    : <TransferDistanceDetails distance={travelDistance} timeBonus={crewTravelBonus.totalBonus} distanceBonus={crewDistBonus.totalBonus} />
                }
                ship={destination}
                disabled={stage !== actionStages.NOT_STARTED} />
            )
            : (
              <LotInputBlock
                title="Destination"
                titleDetails={
                  origin._location.lotIndex === 0 && destination._location.lotIndex === 0
                    ? <TransferDistanceTitleDetails><label>Orbital Transfer</label></TransferDistanceTitleDetails>
                    : <TransferDistanceDetails distance={travelDistance} timeBonus={crewTravelBonus.totalBonus} distanceBonus={crewDistBonus.totalBonus} />
                }
                lot={destinationLot}
                disabled={stage !== actionStages.NOT_STARTED} />
            )
          }
        </FlexSection>

        <FlexSection>
          <CrewInputBlock
            title={
              destination.label === Entity.IDS.SHIP
                ? (crewIsController ? 'Flight Crew' : 'Passengers')
                : 'Stationed Crew'
            }
            crew={crew} />

          <FlexSectionSpacer />

          <div style={{ alignSelf: 'flex-start', paddingTop: 4, width: '50%', overflow: 'hidden' }}>
            {!crewIsOwner && <CrewIndicator crew={destinationOwner} />}
            {destination?.Station && (
              <MiniBarChart
                color="#92278f"
                label="Crewmate Count"
                valueLabel={`${destination.Station.population + crew?.Crew?.roster?.length} / ${Station.TYPES[destination.Station.stationType].cap}`}
                value={(destination.Station.population + crew?.Crew?.roster?.length) / Station.TYPES[destination.Station.stationType].cap}
                deltaColor="#f644fa"
                deltaValue={crew?.Crew?.roster?.length / Station.TYPES[destination.Station.stationType].cap}
              />
            )}
          </div>
        </FlexSection>

        {/* turn this back on when payments are supported */}
        {false && !crewIsOwner && (
          <FlexSection style={{ alignItems: 'flex-start' }}>
            <SwayInputBlock
              title="Sway Payment"
              instruction="OPTIONAL: Include with transfer" />

            <FlexSectionSpacer />

            <div style={{ width: '50%' }} />

          </FlexSection>
        )}

        <ActionDialogStats
          stage={stage}
          stats={stats}
        />

      </ActionDialogBody>

      <ActionDialogFooter
        crewAvailableTime={travelTime}
        disabled={
          !destination ||
          !stationConfig ||
          !crewCan(Permission.IDS.STATION_CREW, destination) ||
          (stationConfig.cap && destination.Station?.population + crew?.Crew?.roster?.length > stationConfig.cap)
        }
        goLabel="Station"
        onGo={onStation}
        stage={stage}
        requireLaunched={false}
        waitForCrewReady
        {...props} />
    </>
  );
};

const Wrapper = (props) => {
  const { crew, loading: crewIsLoading } = useCrewContext();

  const originEntityId = crew?.Location?.location;

  const asteroidId = useStore(s => s.asteroids.origin);
  const lotId = useStore(s => s.asteroids.lot);
  const zoomScene = useStore(s => s.asteroids.zoomScene);

  const { data: asteroid, isLoading: asteroidIsLoading } = useAsteroid(asteroidId);
  const { data: lot, isLoading: lotIsLoading } = useLot(lotId);

  const destinationEntityId = useMemo(() => {
    if (props.destinationEntityId) return props.destinationEntityId;

    if (zoomScene?.type === 'SHIP' && zoomScene.shipId) {
      return { label: Entity.IDS.SHIP, id: zoomScene.shipId };
    } else if (lot?.building && lot?.building?.Building?.buildingType === Building.IDS.HABITAT) {
      return { label: Entity.IDS.BUILDING, id: lot?.building.id };
    } else if (lot?.surfaceShip) {
      return { label: Entity.IDS.SHIP, id: lot?.surfaceShip.id };
    } else if (lot?.ships?.length === 1) {
      return { label: Entity.IDS.SHIP, id: lot?.ships[0].id };
    } else if (lotId) {
      return { label: Entity.IDS.LOT, id: lotId };
    }

    return { label: Entity.IDS.ASTEROID, id: asteroidId };
  }, [asteroidId, lot?.building, lot?.surfaceShip, lotId, zoomScene]);

  const { data: destination, isLoading: destIsLoading } = useEntity(destinationEntityId);
  const { data: origin, isLoading: originIsLoading } = useEntity(originEntityId);

  const stationCrewManager = useStationCrewManager(destinationEntityId);
  const { actionStage } = stationCrewManager;

  const isLoading = asteroidIsLoading || crewIsLoading || destIsLoading || lotIsLoading || originIsLoading;

  useEffect(() => {
    if (!origin || !destination) {
      if (!isLoading) {
        if (props.onClose) props.onClose();
      }
    }
  }, [origin, destination, isLoading]);

  return (
    <ActionDialogInner
      actionImage="CrewManagement"
      isLoading={reactBool(isLoading)}
      stage={actionStage}>
      <StationCrew
        asteroid={asteroid}
        lot={lot}
        origin={origin}
        destination={destination}
        stationCrewManager={stationCrewManager}
        stage={actionStage}
        {...props} />
    </ActionDialogInner>
  )
};

export default Wrapper;
