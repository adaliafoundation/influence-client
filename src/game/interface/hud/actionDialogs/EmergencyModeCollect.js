import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { Inventory, Product, Ship, Time } from '@influenceth/sdk';

import { EmergencyModeCollectIcon } from '~/components/Icons';
import useCrewContext from '~/hooks/useCrewContext';
import useShip from '~/hooks/useShip';
import { reactBool, formatTimer } from '~/lib/utils';

import {
  ActionDialogFooter,
  ActionDialogHeader,
  ActionDialogStats,
  ActionDialogBody,
  FlexSection,
  FlexSectionInputBlock,
  FlexSectionSpacer,
  formatMass,
  ShipInputBlock,
  EmergencyPropellantSection,
  ProgressBarSection,
  formatResourceMass,
  formatResourceVolume
} from './components';
import { ActionDialogInner } from '../ActionDialog';
import ResourceThumbnail from '~/components/ResourceThumbnail';
import actionStages from '~/lib/actionStages';
import theme, { hexToRGB } from '~/theme';
import useAsteroid from '~/hooks/useAsteroid';
import useShipEmergencyManager from '~/hooks/actionManagers/useShipEmergencyManager';
import useSyncedTime from '~/hooks/useSyncedTime';

// TODO: should probably be able to select a ship (based on ships on that lot -- i.e. might have two ships in a spaceport)
//  - however, could you launch two ships at once? probably not because crew needs to be on ship?

const Warning = styled.div`
  align-items: center;
  background: rgba(${p => hexToRGB(p.theme.colors.red)}, 0.2);
  color: ${p => p.theme.colors.red};
  display: flex;
  flex-direction: row;
  font-size: 96%;
  padding: 10px;
  width: 100%;
  & > svg {
    font-size: 30px;
    margin-right: 12px;
  }
`;
const Note = styled.div`
  color: white;
  font-size: 95%;
  padding: 15px 10px 10px;
`;

const EmergencyModeCollect = ({ asteroid, lot, manager, ship, stage, ...props }) => {
  const syncedTime = useSyncedTime();

  const { collectEmergencyPropellant, actionStage } = manager;

  const { crew } = useCrewContext();

  const resourceId = Product.IDS.HYDROGEN_PROPELLANT;

  const [collectableAmount, setCollectableAmount] = useState(0);

  const {
    propellantInventory,
    propellantInventoryConfig,
    startingAmount,
    totalAmount,
    totalEmergencyFraction
  } = useMemo(() => {
    const shipConfig = Ship.TYPES[ship.Ship.shipType];
    const propellantInventory = ship.Inventories.find((i) => i.slot === shipConfig.propellantSlot);
    const propellantInventoryConfig = Inventory.getType(propellantInventory.inventoryType, crew?._inventoryBonuses);
    const startingAmount = propellantInventory.mass / Product.TYPES[resourceId].massPerUnit;
    const maxTankAmount = propellantInventoryConfig.massConstraint / Product.TYPES[resourceId].massPerUnit;
    const maxEmergencyAmount = shipConfig.emergencyPropellantCap * maxTankAmount;
    const totalAmount = startingAmount + collectableAmount;
    const totalEmergencyFraction = totalAmount / maxEmergencyAmount;
    return {
      propellantInventory,
      propellantInventoryConfig,
      startingAmount,
      maxTankAmount,
      maxEmergencyAmount,
      totalAmount,
      totalEmergencyFraction
    };
  }, [crew?._inventoryBonuses, resourceId, ship, collectableAmount]);

  const recalculateCollectableAmount = useCallback(() => {
    setCollectableAmount(
      Math.floor(
        Ship.Entity.getEmergencyPropellantAmount(ship, crew?._inventoryBonuses, crew?._timeAcceleration) - startingAmount
      )
    );
  }, [crew, ship, startingAmount]);

  useEffect(() => {
    recalculateCollectableAmount();
    const i = setInterval(recalculateCollectableAmount, 1000);
    return () => clearInterval(i);
  }, [recalculateCollectableAmount]);

  const maxGenerationTime = useMemo(() => {
    return Time.toRealDuration(
      Ship.Entity.getTimeUntilEmergencyPropellantFull(ship, crew?._inventoryBonuses),
      crew?._timeAcceleration
    );
  }, [crew?._timeAcceleration, ship]);

  const stats = useMemo(() => ([
    {
      label: 'Generation Time',
      value: formatTimer(
        Math.min(
          maxGenerationTime,
          syncedTime - ship.Ship.emergencyAt
        )
      ),
      direction: 0,
      isTimeStat: true,
    },
    {
      label: 'Remaining Time Until Limit',
      value: formatTimer(
        Math.max(0, maxGenerationTime - (syncedTime - ship.Ship.emergencyAt))
      ),
      direction: 0,
    },
    {
      label: 'Propellant Mass Generated',
      value: formatResourceMass(collectableAmount, resourceId),
      direction: 0,
    },
    {
      label: 'Propellant Volume Generated',
      value: formatResourceVolume(collectableAmount, resourceId),
      direction: 0,
    },
  ]), [maxGenerationTime, ship, syncedTime]);

  const onCollect = useCallback(() => {
    collectEmergencyPropellant();
  }, [collectEmergencyPropellant]);

  // handle auto-closing
  const lastStatus = useRef();
  useEffect(() => {
    // (close on status change from)
    if (lastStatus.current && actionStage !== lastStatus.current) {
      props.onClose();
    }
    lastStatus.current = actionStage;
  }, [actionStage]);

  return (
    <>
      <ActionDialogHeader
        action={{
          icon: <EmergencyModeCollectIcon />,
          label: 'Collect Propellant',
          status: stage === actionStages.NOT_STARTED ? 'Emergency Generation Active' : undefined
        }}
        actionCrew={crew}
        location={{ asteroid, lot, ship }}
        onClose={props.onClose}
        overrideColor={stage === actionStages.NOT_STARTED ? theme.colors.orange : undefined}
        stage={stage} />

      <ActionDialogBody>
        <FlexSection>

          <FlexSectionInputBlock
            title="Propellant"
            image={<ResourceThumbnail resource={Product.TYPES[resourceId]} tooltipContainer={null} />}
            label={(
              <>
                <div style={{ color: theme.colors.orange }}>EMERGENCY</div>
                {Product.TYPES[resourceId].name}
              </>
            )}
            disabled={stage !== actionStages.NOT_STARTED}
            sublabel={`${formatMass(propellantInventory.mass)}`}
            bodyStyle={{ backgroundColor: `rgba(${hexToRGB(theme.colors.orange)}, 0.2)` }}
          />

          <FlexSectionSpacer />

          <ShipInputBlock
            title="Ship"
            disabled={stage !== actionStages.NOT_STARTED}
            ship={ship} />

        </FlexSection>

        <ProgressBarSection
          overrides={{
            barColor: theme.colors.lightOrange,
            // color: 'white',//theme.colors.lightOrange,
            left: `${Math.floor(totalEmergencyFraction * 100)}%`,
            center: (
              <small style={{ textTransform: 'uppercase' }}>
                {totalEmergencyFraction >= 1 ? 'Max Emergency Propellant Generated' : 'Generating Emergency Propellant...'}
              </small>
            ),
            right: <span style={{ opacity: 0 }}>{Math.floor(totalEmergencyFraction * 100)}</span>,
          }}
          finishTime={ship.Ship.emergencyAt + maxGenerationTime}
          startTime={ship.Ship.emergencyAt}
          stage={actionStages.IN_PROGRESS}
          title="Generated Amount"
          width="100%"
        />

        <FlexSection style={{ marginBottom: -15 }}>
          <EmergencyPropellantSection
            title="Propellant Tank"
            propellantPregeneration={startingAmount * Product.TYPES[resourceId].massPerUnit}
            propellantPostgeneration={totalAmount * Product.TYPES[resourceId].massPerUnit}
            propellantTankMax={propellantInventoryConfig.massConstraint}
            emergencyPropellantCap={Ship.TYPES[ship.Ship.shipType].emergencyPropellantCap}
          />
        </FlexSection>

        <ActionDialogStats
          stage={stage}
          stats={stats}
        />

      </ActionDialogBody>

      <ActionDialogFooter
        disabled={!(ship?.Ship?.emergencyAt > 0) || collectableAmount <= 0}
        goLabel="Collect"
        onGo={onCollect}
        stage={stage}
        waitForCrewReady
        {...props} />
    </>
  );
};

const Wrapper = (props) => {
  const { crew } = useCrewContext();
  const { data: asteroid, isLoading: asteroidIsLoading } = useAsteroid(crew?._location?.asteroidId);
  const { data: lot, isLoading: lotIsLoading } = useAsteroid(crew?._location?.lotId);

  const { data: maybeShip, isLoading: shipIsLoading } = useShip(crew?._location?.shipId);
  const ship = useMemo(() => {
    return (!maybeShip && crew?.Ship?.emergencyAt > 0) ? crew : maybeShip;
  }, [crew]);

  const manager = useShipEmergencyManager();
  const { actionStage } = manager;

  const isLoading = asteroidIsLoading || lotIsLoading || shipIsLoading;
  useEffect(() => {
    if ((!asteroid || !ship) && !isLoading && props.onClose) {
      props.onClose();
    }
  }, [asteroid, ship, isLoading]);

  return (
    <ActionDialogInner
      actionImage="Travel"
      isLoading={reactBool(isLoading)}
      stage={actionStage}>
      <EmergencyModeCollect
        asteroid={asteroid}
        lot={lot}
        ship={ship}
        manager={manager}
        stage={actionStage}
        {...props} />
    </ActionDialogInner>
  )
};

export default Wrapper;
