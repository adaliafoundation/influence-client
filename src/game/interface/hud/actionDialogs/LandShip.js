import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Asteroid, Crewmate, Dock, Entity, Inventory, Lot, Permission, Product, Ship, Time } from '@influenceth/sdk';

import { LandShipIcon, RouteIcon, ShipIcon, WarningOutlineIcon } from '~/components/Icons';
import useCrewContext from '~/hooks/useCrewContext';
import { reactBool, formatTimer, formatFixed, getCrewAbilityBonuses } from '~/lib/utils';

import {
  ActionDialogFooter,
  ActionDialogHeader,
  ActionDialogStats,
  ActionDialogTabs,
  ActionDialogBody,
  FlexSection,
  FlexSectionInputBlock,
  FlexSectionSpacer,
  ProgressBarSection,
  AsteroidImage,
  PropellantSection,
  ShipTab,
  LandingSelectionDialog,
  PropulsionTypeSection,
  LotInputBlock,
  formatMass,
  getBonusDirection,
  TimeBonusTooltip,
  MaterialBonusTooltip,
  formatTimeRequirements
} from './components';
import useLot from '~/hooks/useLot';
import { ActionDialogInner } from '../ActionDialog';
import actionStages from '~/lib/actionStages';
import theme from '~/theme';
import formatters from '~/lib/formatters';
import useShip from '~/hooks/useShip';
import useShipDockingManager from '~/hooks/actionManagers/useShipDockingManager';
import useAsteroid from '~/hooks/useAsteroid';

const LandShip = ({ asteroid, manager, ship, stage, ...props }) => {
  const { currentDockingAction, dockShip } = manager;
  const { crew, crewCan } = useCrewContext();

  // TODO: should this default to hopper-assisted if no propellant?
  const [powered, setPowered] = useState(true);
  const [tab, setTab] = useState(0);

  const [selectedDestinationIndex, setSelectedDestinationIndex] = useState(
    props.preselect?.destinationLotId ? Lot.toIndex(props.preselect?.destinationLotId) : undefined
  );
  const [destinationSelectorOpen, setDestinationSelectorOpen] = useState();
  const destinationLotId = currentDockingAction?.meta?.lotId
    || (selectedDestinationIndex && Lot.toId(asteroid?.id, selectedDestinationIndex))
    || undefined;
  const { data: destinationLot } = useLot(destinationLotId);

  const [hopperBonus, distBonus, exhaustBonus] = useMemo(() => {
    if (!crew) return {};
    const bonusIds = [
      Crewmate.ABILITY_IDS.HOPPER_TRANSPORT_TIME,
      Crewmate.ABILITY_IDS.FREE_TRANSPORT_DISTANCE,
      Crewmate.ABILITY_IDS.PROPELLANT_EXHAUST_VELOCITY
    ];

    const abilities = getCrewAbilityBonuses(bonusIds, crew) || {};
    return bonusIds.map((id) => abilities[id] || {});
  }, [crew]);

  const groundDelay = useMemo(() => {
    const delay = destinationLot?.building ? Dock.Entity.getGroundDelay(destinationLot.building) : 0;
    return Time.toRealDuration(delay, crew?._timeAcceleration);
  }, [crew?._timeAcceleration, destinationLot?.building]);

  const [escapeVelocity, propellantRequirement, poweredTime, tugTime] = useMemo(() => {
    const escapeVelocity = Asteroid.Entity.getEscapeVelocity(asteroid) * 1000;
    const propellantRequired = Ship.Entity.getPropellantRequirement(ship, escapeVelocity, exhaustBonus.totalBonus);
    const destinationLotIndex = destinationLot ? Lot.toIndex(destinationLot?.id) : 1;
    return [
      escapeVelocity,
      propellantRequired,
      0, // TODO: poweredTime may be a thing in the future
      Time.toRealDuration(
        Asteroid.getLotTravelTime(asteroid?.id, 0, destinationLotIndex, hopperBonus.totalBonus, distBonus.totalBonus),
        crew?._timeAcceleration
      )
    ];
  }, [asteroid, destinationLot?.id, distBonus, hopperBonus, powered, exhaustBonus, ship]);

  const [propellantLoaded, deltaVLoaded] = useMemo(() => {
    if (!ship) return 0;
    const shipConfig = Ship.TYPES[ship.Ship.shipType];
    const propellantMass = (ship.Inventories || []).find((inv) => inv.slot === shipConfig.propellantSlot)?.mass || 0;
    const deltaV = Ship.Entity.propellantToDeltaV(ship, propellantMass, hopperBonus.totalBonus);
    return [
      propellantMass,
      deltaV
    ];
  }, [ship]);


  const launchTime = useMemo(() => {
    return formatTimeRequirements([
      [groundDelay, 'Ground Delay'],
      powered ? [poweredTime, 'Powered Landing'] : [tugTime, 'Tug to Surface'],
    ]);
  }, [groundDelay, powered, poweredTime, tugTime]);

  const stats = useMemo(() => ([
    {
      label: 'Time until Docked',
      value: formatTimer(launchTime?.total || 0),
      direction: launchTime?.total > 0 ? getBonusDirection(hopperBonus) : 0,
      isTimeStat: true,
      tooltip: hopperBonus.totalBonus !== 1 && launchTime?.total > 0 && (
        <TimeBonusTooltip
          bonus={hopperBonus}
          title="Time until Docked"
          totalTime={launchTime?.total || 0}
          crewRequired="duration" />
      )
    },
    {
      label: 'Propellant Used',
      value: powered ? formatMass(propellantRequirement) : 0,
      direction: powered && propellantRequirement > 0 ? getBonusDirection(exhaustBonus) : 0,
      isTimeStat: true,
      tooltip: propellantRequirement > 0 && exhaustBonus.totalBonus !== 1 && (
        <MaterialBonusTooltip
          bonus={exhaustBonus}
          isTimeStat
          title="Propellant Utilization"
          titleValue={`${formatFixed(100 / exhaustBonus.totalBonus, 1)}%`} />
      )
    },
    {
      label: 'Escape Velocity',
      value: `${formatFixed(escapeVelocity, 1)} m/s`,
      direction: 0,
    },
    {
      label: 'Wet Mass',
      value: formatMass(
        Ship.TYPES[ship.Ship.shipType].hullMass
        + ship.Inventories.reduce((acc, inv) => acc + (inv.status === Inventory.STATUSES.AVAILABLE ? inv.mass : 0), 0)
      ),
      direction: 0,
    },
  ]), [escapeVelocity, hopperBonus, launchTime?.total, exhaustBonus, propellantRequirement, ship]);

  const onLand = useCallback(() => {
    if (!destinationLot) return;
    dockShip(
      destinationLot.building || { label: Entity.IDS.LOT, id: destinationLot.id },
      !powered,
      destinationLot.id
    );
  }, [destinationLot, powered]);

  // handle auto-closing
  const lastStatus = useRef();
  useEffect(() => {
    // (close on status change from)
    if (lastStatus.current && stage !== lastStatus.current) {
      props.onClose();
    }
    lastStatus.current = stage;
  }, [stage]);

  const propellantProduct = Product.TYPES[Product.IDS.HYDROGEN_PROPELLANT];

  return (
    <>
      <ActionDialogHeader
        action={{
          icon: <LandShipIcon />,
          label: 'Land Ship',
          status: stage === actionStages.NOT_STARTED ? 'Return from Orbit' : undefined,
        }}
        actionCrew={crew}
        location={{ asteroid, lot: destinationLot, ship }}
        crewAvailableTime={launchTime}
        taskCompleteTime={launchTime}
        onClose={props.onClose}
        overrideColor={stage === actionStages.NOT_STARTED ? theme.colors.main : undefined}
        stage={stage} />

      <ActionDialogBody>

        <ActionDialogTabs
          onSelect={setTab}
          selected={tab}
          tabs={[
            { icon: <RouteIcon />, label: 'Land' },
            { icon: <ShipIcon />, label: 'Ship' },
          ]}
        />

        {tab === 0 && (
          <>
            <FlexSection>
              <FlexSectionInputBlock
                title="Origin"
                image={<AsteroidImage asteroid={asteroid} />}
                label={formatters.asteroidName(asteroid)}
                sublabel="Orbit"
              />

              <FlexSectionSpacer />

              <LotInputBlock
                title="Destination"
                lot={destinationLot}
                disabled={stage !== actionStages.NOT_STARTED}
                onClick={() => setDestinationSelectorOpen(true)}
                isSelected={stage === actionStages.NOT_STARTED}
              />
            </FlexSection>

            <FlexSection style={{ marginBottom: -15 }}>
              <PropulsionTypeSection
                disabled={stage !== actionStages.NOT_STARTED}
                objectLabel="Landing"
                onSetPowered={(x) => stage === actionStages.NOT_STARTED ? setPowered(x) : null}
                powered={powered}
                propulsiveTime={poweredTime}
                tugTime={tugTime} />

              <FlexSectionSpacer />

              <PropellantSection
                title="Propellant"
                deltaVLoaded={deltaVLoaded}
                deltaVRequired={powered ? escapeVelocity : 0}
                propellantLoaded={propellantLoaded}
                propellantRequired={powered ? propellantRequirement : 0}
                narrow
              />
            </FlexSection>

            {stage === actionStages.NOT_STARTED && destinationLot?.building && (
              <ProgressBarSection
                overrides={{
                  barColor: theme.colors.lightOrange,
                  color: theme.colors.lightOrange,
                  left: <><WarningOutlineIcon /> Landing Delay</>,
                  right: formatTimer(groundDelay)
                }}
                stage={stage}
                title="Port Traffic"
              />
            )}
          </>
        )}

        {tab === 1 && (
          <ShipTab
            pilotCrew={crew}
            inventoryBonuses={crew?._inventoryBonuses}
            deltas={{
              propellantMass: powered ? -propellantRequirement : 0,
              propellantVolume: powered ? -(propellantRequirement * propellantProduct.volumePerUnit / propellantProduct.massPerUnit) : 0,
            }}
            ship={ship}
            stage={stage} />
        )}

        <ActionDialogStats
          stage={stage}
          stats={stats}
        />

      </ActionDialogBody>

      <ActionDialogFooter
        crewAvailableTime={launchTime}
        taskCompleteTime={launchTime}
        disabled={(powered && propellantRequirement > propellantLoaded) || (destinationLot?.building && !crewCan(Permission.IDS.DOCK_SHIP, destinationLot.building))}
        goLabel="Land"
        onGo={onLand}
        stage={stage}
        waitForCrewReady
        {...props} />

      {stage === actionStages.NOT_STARTED && (
        <LandingSelectionDialog
          asteroid={asteroid}
          initialSelection={selectedDestinationIndex}
          onClose={() => setDestinationSelectorOpen(false)}
          onSelected={setSelectedDestinationIndex}
          originLotIndex={0}
          open={destinationSelectorOpen}
          ship={ship}
        />
      )}
    </>
  );
};

const Wrapper = (props) => {
  const { data: ship, isLoading: shipIsLoading } = useShip(props.shipId);
  const dockingManager = useShipDockingManager(props.shipId);
  const { actionStage, currentDockingAction } = dockingManager;

  const { data: asteroid, isLoading: asteroidIsLoading } = useAsteroid(currentDockingAction?.meta?.asteroidId || ship?._location?.asteroidId);

  const isLoading = shipIsLoading || asteroidIsLoading;

  useEffect(() => {
    if (!asteroid || !ship) {
      if (!isLoading) {
        if (props.onClose) props.onClose();
      }
    }
  }, [asteroid, ship, isLoading]);

  return (
    <ActionDialogInner
      actionImage="Travel"
      isLoading={reactBool(isLoading)}
      stage={actionStage}>
      {asteroid && ship && (
        <LandShip
          asteroid={asteroid}
          manager={dockingManager}
          ship={ship}
          stage={actionStage}
          {...props} />
      )}
    </ActionDialogInner>
  )
};

export default Wrapper;
