import { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import cloneDeep from 'lodash/cloneDeep';
import { Crewmate, Product, Ship, Time } from '@influenceth/sdk';

import {
  LocationIcon,
  RouteIcon,
  SetCourseIcon,
  ShipIcon,
  RotatedShipMarkerIcon,
  WarningOutlineIcon
} from '~/components/Icons';
import useActionCrew from '~/hooks/useActionCrew';
import useAsteroid from '~/hooks/useAsteroid';
import useCoarseTime from '~/hooks/useCoarseTime';
import useCrewContext from '~/hooks/useCrewContext';
import useShip from '~/hooks/useShip';
import useStore from '~/hooks/useStore';
import useShipTravelManager from '~/hooks/actionManagers/useShipTravelManager';
import actionStages from '~/lib/actionStages';
import formatters from '~/lib/formatters';
import { displayTimeFractionDigits, formatFixed, formatTimer, getCrewAbilityBonuses, reactBool } from '~/lib/utils';
import theme from '~/theme';

import { ActionDialogInner } from '../ActionDialog';
import {
  ActionDialogFooter,
  ActionDialogHeader,
  ActionDialogStats,
  ActionDialogTabs,
  ActionDialogBody,
  FlexSection,
  FlexSectionSpacer,
  Section,
  AsteroidImage,
  PropellantSection,
  formatMass,
  ShipTab,
  formatVelocity,
  ShipInputBlock,
  MaterialBonusTooltip,
  getBonusDirection,
  formatTimeRequirements,
} from './components';
const Banner = styled.div`
  align-items: center;
  background: rgba(${p => p.theme.colors.mainRGB}, 0.5);
  color: white;
  display: flex;
  flex-direction: row;
  margin-bottom: 16px;

  & label {
    font-size: 18px;
    font-weight: bold;
    padding: 6px 12px;
    width: calc(50% - 20px);
    &:last-child {
      text-align: right;
    }
  }

  & span {
    font-size: 80%;
    text-align: center;
    text-transform: uppercase;
    width: 40px;
  }
`;

const CourseRow = styled.div`
  align-items: center;
  display: flex;
  flex-direction: row;
  margin-bottom: 20px;
  & > div:first-child,
  & > div:last-child {
    flex: 0 0 92px;
  }
`;

const Course = styled.div`
  display: flex-inline;
  flex-direction: column;
  margin: 0 10px;
  width: 100%;
`;

const CourseLabels = styled.div`
  align-items: center;
  color: #aaa;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  width: 100%;
  & b {
    color: ${p => p.theme.colors.brightMain};
    text-transform: uppercase;
  }
`;

const CourseGraphic = styled(CourseLabels)`
  color: white;
  & label {
    align-items: center;
    display: flex;
    font-size: 26px;
    margin: 9px 15px;
    & span {
      display: inline-block;
      line-height: 1em;
      margin-left: 8px;
    }
  }
`;

const Dashes = styled.div`
  flex: 1;
  height: 2px;
  background-image: repeating-linear-gradient(to right, ${p => p.theme.colors.brightMain} 0%, ${p => p.theme.colors.brightMain} 70%, transparent 70%, transparent 100%);
  background-position: left top;
  background-repeat: repeat-x;
  background-size: 20px 2px;
  ${p => p.flip && `transform: scaleX(-1);`}
`;
const CourseDeltaV = styled(CourseLabels)`
  font-size: 90%;
  justify-content: center;
  & b {
    color: white;
    text-transform: none;
  }
`;

const TimingDetails = styled.div`
  align-self: flex-start;
  width: 50%;
  & > div {
    background: rgba(${p => p.theme.colors.mainRGB}, 0.2);
    color: white;
    display: flex;
    flex-direction: row;
    line-height: 1em;
    margin-bottom: 4px;
    padding: 8px 8px;
    &:last-child {
      margin-bottom: 0px;
    }
    & > label {
      flex: 1;
      font-size: 95%;
    }
    & > span {
      font-size: 18px;
      font-weight: bold;
      & b {
        align-items: center;
        color: ${p => p.theme.colors.main};
        display: flex;
        & svg {
          margin-right: 6px;
        }
      }
      & i {
        font-size: 14px;
        font-style: normal;
        margin-left: 4px;
        opacity: 0.5;
      }
    }
  }
`;

const DiamondOuter = styled.div`
  background: ${p => p.theme.colors.brightMain};
  clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
  height: 2em;
  width: 2em;
`;
const DiamondInner = styled(DiamondOuter)`
  align-items: center;
  background: black;
  clip-path: polygon(
    50% 1px,
    calc(100% - 1px) 50%,
    50% calc(100% - 1px),
    1px 50%
  );
  display: flex;
  justify-content: center;
  padding-top: 2px;
`;

const LocationDiamond = () => (
  <DiamondOuter>
    <DiamondInner>
      <LocationIcon />
    </DiamondInner>
  </DiamondOuter>
);

const propellantProduct = Product.TYPES[Product.IDS.HYDROGEN_PROPELLANT];

const SetCourse = ({ origin, destination, manager, ship, stage, travelSolution, ...props }) => {
  const coarseTime = useCoarseTime(true);
  const createAlert = useStore(s => s.dispatchAlertLogged);
  const dispatchHudMenuOpened = useStore(s => s.dispatchHudMenuOpened);
  const dispatchTravelMode = useStore(s => s.dispatchTravelMode);

  const { currentTravelAction, depart, arrive, travelStatus } = manager;
  const crew = useActionCrew(currentTravelAction);

  const [tab, setTab] = useState(0);

  const exhaustBonus = useMemo(() => {
    return getCrewAbilityBonuses(Crewmate.ABILITY_IDS.PROPELLANT_EXHAUST_VELOCITY, crew);
  }, [crew]);

  const [shipConfig, cargoInv, propellantInv] = useMemo(() => {
    if (!ship) return [];
    const shipConfig = Ship.TYPES[ship.Ship.shipType];
    const cargoInv = ship.Inventories.find((inventory) => inventory.slot === shipConfig.cargoSlot) || { mass: 0 };
    const propellantInv = ship.Inventories.find((inventory) => inventory.slot === shipConfig.propellantSlot);
    return [shipConfig, cargoInv, propellantInv];
  }, [ship]);

  const delay = useMemo(() => {
    return Math.max(0, travelSolution.departureTime - coarseTime) * 86400;
  }, [coarseTime, travelSolution]);

  const tof = useMemo(() => {
    return Math.max(0, travelSolution.arrivalTime - travelSolution.departureTime) * 86400
  }, [travelSolution]);

  const realWorldDelay = useMemo(() => {
    return Time.toRealDuration(delay, crew._timeAcceleration);
  }, [crew?._timeAcceleration, delay]);

  const realWorldTof = useMemo(() => {
    return Time.toRealDuration(tof, crew._timeAcceleration);
  }, [crew?._timeAcceleration, tof]);

  const arrivingIn = useMemo(() => {
    return Math.max(0, travelSolution.arrivalTime - coarseTime);
  }, [coarseTime, travelSolution]);

  const propellantMassLoaded = useMemo(() => {
    if (!propellantInv) return 0;
    let totalMass = propellantInv.mass;
    if (currentTravelAction) totalMass += travelSolution.usedPropellantMass || 0;
    return totalMass;
  }, [currentTravelAction, propellantInv]);

  const deltaVLoaded = useMemo(() => {
    if (!ship || !propellantMassLoaded) return 0;

    const cloneShip = cloneDeep(ship);
    try {
      cloneShip.Inventories.find((inventory) => inventory.slot === shipConfig.propellantSlot).mass = propellantMassLoaded;
      return Ship.Entity.propellantToDeltaV(cloneShip, propellantMassLoaded, exhaustBonus?.totalBonus);
    } catch {
      return 0;
    }
  }, [propellantMassLoaded, exhaustBonus, ship]);

  const travelTime = useMemo(() => {
    if (currentTravelAction) {
      return formatTimeRequirements(currentTravelAction.finishTime - currentTravelAction.startTime);
    }
    return formatTimeRequirements([
      [realWorldDelay, 'Wait for Scheduled Departure'],
      [realWorldTof, 'Time in Flight']
    ]);
  }, [currentTravelAction, realWorldDelay, realWorldTof]);

  const stats = useMemo(() => ([
    {
      label: 'Propellant Used',
      value: formatMass(travelSolution.usedPropellantMass),
      direction: getBonusDirection(exhaustBonus),
      isTimeStat: true,
      tooltip: exhaustBonus.totalBonus !== 1 && (
        <MaterialBonusTooltip
          bonus={exhaustBonus}
          isTimeStat
          title="Propellant Utilization"
          titleValue={`${formatFixed(100 / exhaustBonus.totalBonus, 1)}%`} />
      )
    },
    {
      label: 'Delta-V Used',
      value: formatVelocity(travelSolution.deltaV),
      direction: 0,
    },
    {
      label: 'Arriving In',
      value: formatTimer(Time.toRealDuration(arrivingIn * 86400, crew?._timeAcceleration), 3),
      direction: 0,
      isTimeStat: true,
    },
    // {
    //   label: 'Max Acceleration',
    //   value: <>1.712 m/s<sup>2</sup></>,
    //   direction: 0,
    // },
    {
      label: 'Wet Mass',
      value: formatMass(shipConfig.hullMass + propellantMassLoaded + cargoInv?.mass),
      direction: 0,
    },
    {
      label: 'Dry Mass',
      value: formatMass(shipConfig.hullMass + propellantMassLoaded + cargoInv?.mass - travelSolution.usedPropellantMass),
      direction: 0,
    },
    // {
    //   label: 'Cargo Volume',
    //   value: formatVolume(cargoInv.volume),
    //   direction: 0,
    // },
    {
      label: 'Passengers',
      value: ship.Station?.population || crew.Crew?.roster.length || 0,
      direction: 0,
    },
  ]), [arrivingIn, cargoInv, travelSolution, exhaustBonus, propellantInv, shipConfig]);

  const onDepart = useCallback(() => {
    return depart();
  }, [depart]);

  const onArrive = useCallback(() => {
    return arrive();
  }, [arrive]);

  useEffect(() => {
    if (travelStatus === 'READY' && delay <= 0) {
      createAlert({
        type: 'GenericAlert',
        data: { content: 'Scheduled departure time has past.' },
        level: 'warning',
        // duration: 0,
      });
      props.onClose();
    }
  }, [delay]);

  const deltas = (stage && ![actionStages.NOT_STARTED, actionStages.STARTING].includes(stage)) ? { } : 
    {
      propellantMass: -travelSolution.usedPropellantMass,
      propellantVolume: -travelSolution.usedPropellantMass / propellantProduct.massPerUnit * propellantProduct.volumePerUnit,
    };

  return (
    <>
      <ActionDialogHeader
        action={{
          icon: <SetCourseIcon />,
          label: 'Set Course',
          status: stage === actionStages.NOT_STARTED ? 'Travel to Asteroid' : undefined,
        }}
        actionCrew={crew}
        location={{ asteroid: origin, ship }}
        crewAvailableTime={travelTime}
        taskCompleteTime={travelTime}
        onClose={props.onClose}
        overrideColor={stage === actionStages.NOT_STARTED ? theme.colors.main : undefined}
        stage={stage} />

      <ActionDialogBody>

        <ActionDialogTabs
          onSelect={setTab}
          selected={tab}
          tabs={[
            { icon: <RouteIcon />, label: 'Route' },
            { icon: <ShipIcon />, label: 'Ship' },
          ]}
        />

        {tab === 0 && (
          <>
            <Section>
              <Banner>
                <label>{formatters.asteroidName(origin)}</label>
                <span>to</span>
                <label>{formatters.asteroidName(destination)}</label>
              </Banner>
              <CourseRow>
                <AsteroidImage asteroid={origin} />
                <Course>
                  <CourseLabels>
                    <div>Orbit</div>
                    <b>Flight Time</b>
                    <div>Orbit</div>
                  </CourseLabels>
                  <CourseGraphic>
                    <LocationDiamond />
                    <Dashes />
                    <label>
                      <RotatedShipMarkerIcon />
                      <span>
                        {formatTimer(realWorldTof, 2)}
                      </span>
                    </label>
                    <Dashes flip />
                    <LocationDiamond />
                  </CourseGraphic>
                  <CourseDeltaV>
                    <span>Trip Delta-V: <b>{formatVelocity(travelSolution.deltaV, { minPrecision: 3 })}</b></span>
                  </CourseDeltaV>
                </Course>
                <AsteroidImage asteroid={destination} />
              </CourseRow>
            </Section>

            <FlexSection style={{ marginTop: 20 }}>
              <ShipInputBlock
                ship={ship}
                disabled={stage !== actionStages.NOT_STARTED}
                isMine />

              <FlexSectionSpacer />

              <TimingDetails>
                {travelStatus === 'READY' && (
                  <div>
                    <label>Departure Delay</label>
                    <span>
                      {realWorldDelay > 300
                        ? <b><WarningOutlineIcon /> {formatTimer(realWorldDelay, 2)}</b>
                        : <>{formatTimer(realWorldDelay, 2)}</>}
                    </span>
                  </div>
                )}
                <div>
                  <label>Depart</label>
                  <span>
                    {(Time.fromOrbitADays(travelSolution.departureTime, crew._timeAcceleration).toGameClockADays() || 0).toLocaleString(undefined, { minimumFractionDigits: displayTimeFractionDigits })}
                    <i>DAYS</i>
                  </span>
                </div>
                {travelStatus !== 'READY' && (
                  <div>
                    <label>Time in Flight</label>
                    <span>
                      {(travelSolution.arrivalTime - travelSolution.departureTime).toLocaleString(undefined, { minimumFractionDigits: displayTimeFractionDigits })}
                      <i>DAYS</i>
                    </span>
                  </div>
                )}
                <div>
                  <label>Arrive</label>
                  <span>
                    {(Time.fromOrbitADays(travelSolution.arrivalTime, crew._timeAcceleration).toGameClockADays() || 0).toLocaleString(undefined, { minimumFractionDigits: displayTimeFractionDigits })}
                    <i>DAYS</i>
                  </span>
                </div>
              </TimingDetails>

            </FlexSection>

            <FlexSection style={{ marginBottom: -15 }}>
              <PropellantSection
                title="Requirements"
                deltaVRequired={travelSolution.deltaV}
                deltaVLoaded={deltaVLoaded}
                propellantRequired={travelSolution.usedPropellantMass}
                propellantLoaded={propellantMassLoaded}
              />
            </FlexSection>
          </>
        )}

        {tab === 1 && (
          <ShipTab
            pilotCrew={crew}
            inventoryBonuses={crew?._inventoryBonuses}
            deltas={deltas}
            ship={ship}
            stage={stage} />
        )}

        <ActionDialogStats
          stage={stage}
          stats={stats}
        />

      </ActionDialogBody>

      <ActionDialogFooter
        crewAvailableTime={travelTime}
        taskCompleteTime={travelTime}
        disabled={propellantMassLoaded < travelSolution.usedPropellantMass}
        goLabel="Schedule"
        onGo={onDepart}
        finalizeLabel="Arrive"
        onFinalize={onArrive}
        stage={stage}
        waitForCrewReady
        {...props} />
    </>
  );
};

const Wrapper = (props) => {
  const { crew } = useCrewContext();

  const { data: maybeShip, isLoading: shipIsLoading } = useShip(crew?._location?.shipId);
  const ship = useMemo(() => {
    return (!shipIsLoading && !maybeShip && crew?.Ship?.emergencyAt > 0) ? crew : maybeShip;
  }, [crew]);

  const manager = useShipTravelManager(ship);
  const { actionStage, currentTravelAction, currentTravelSolution, isLoading: solutionIsLoading } = manager;

  const defaultOrigin = useStore(s => s.asteroids.origin);
  const defaultDestination = useStore(s => s.asteroids.destination);
  const proposedTravelSolution = useStore(s => s.asteroids.travelSolution);

  const travelSolution = useMemo(
    () => (solutionIsLoading || currentTravelAction) ? currentTravelSolution : proposedTravelSolution,
    [currentTravelAction, proposedTravelSolution, solutionIsLoading]
  );

  const { data: origin, isLoading: originIsLoading } = useAsteroid(currentTravelAction?.originId || defaultOrigin);
  const { data: destination, isLoading: destinationIsLoading } = useAsteroid(currentTravelAction?.destinationId || defaultDestination);

  // close dialog if cannot load both asteroids or if no travel solution
  useEffect(() => {
    if (!origin || !destination || !ship) {
      if (!originIsLoading && !destinationIsLoading && !shipIsLoading) {
        if (props.onClose) props.onClose();
      }
    }

    if (!travelSolution) {
      if (!solutionIsLoading) {
        if (props.onClose) props.onClose();
      }
    }
  }, [origin, destination, originIsLoading, destinationIsLoading, travelSolution, solutionIsLoading]);

  const isLoading = originIsLoading || destinationIsLoading || shipIsLoading || !travelSolution;
  return (
    <ActionDialogInner
      actionImage="Travel"
      isLoading={reactBool(isLoading)}
      stage={actionStage}>
      <SetCourse
        origin={origin}
        destination={destination}
        manager={manager}
        stage={actionStage}
        ship={ship}
        travelSolution={travelSolution}
        {...props} />
    </ActionDialogInner>
  )
};

export default Wrapper;
