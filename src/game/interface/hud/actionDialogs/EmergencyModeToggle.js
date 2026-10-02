import { useCallback, useEffect, useMemo } from 'react';
import styled from 'styled-components';
import { Inventory, Product, Ship } from '@influenceth/sdk';

import { CloseIcon, EmergencyModeEnterIcon, EmergencyModeExitIcon, WarningOutlineIcon } from '~/components/Icons';
import useCrewContext from '~/hooks/useCrewContext';
import useShip from '~/hooks/useShip';
import { reactBool, formatFixed } from '~/lib/utils';

import {
  ActionDialogFooter,
  ActionDialogHeader,
  ActionDialogStats,
  ActionDialogBody,
  ShipTab,
  formatMass,
  formatVolume,
  formatResourceVolume,
  formatResourceMass,
} from './components';
import useAsteroid from '~/hooks/useAsteroid';
import useStationedCrews from '~/hooks/useStationedCrews';
import actionStages from '~/lib/actionStages';
import theme, { hexToRGB } from '~/theme';
import { ActionDialogInner } from '../ActionDialog';
import useShipEmergencyManager from '~/hooks/actionManagers/useShipEmergencyManager';

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

const EmergencyModeToggle = ({ asteroid, lot, manager, ship, stage, ...props }) => {
  const { activateEmergencyMode, deactivateEmergencyMode } = manager;

  const { crew } = useCrewContext();

  const { data: shipCrews } = useStationedCrews(ship);
  const shipPassengerCrews = useMemo(() => (shipCrews || []).filter((c) =>( c.id !== crew?.id && c.Crew?.roster?.length > 0)), [shipCrews]);

  const inEmergencyMode = useMemo(() => {
    if (manager.isActivating) return false;
    if (manager.isDeactivating) return true;
    return ship?.Ship?.emergencyAt > 0;
  }, [manager, ship]);

  const cargoInventory = useMemo(() => {
    const shipConfig = Ship.TYPES[ship.Ship.shipType];
    return ship.Inventories.find((i) => i.slot === shipConfig.cargoSlot);
  }, [ship]);

  const propellantInventory = useMemo(() => {
    const shipConfig = Ship.TYPES[ship.Ship.shipType];
    return ship.Inventories.find((i) => i.slot === shipConfig.propellantSlot);
  }, [ship]);

  const propellantJettisoned = useMemo(() => {
    if (inEmergencyMode) {  // if exiting emergency mode, jettison up to 10% of max propellant
      const shipConfig = Ship.TYPES[ship.Ship.shipType];
      const maxProp = shipConfig.emergencyPropellantCap * Inventory.getType(propellantInventory.inventoryType, crew?._inventoryBonuses)?.massConstraint;
      return Math.min(propellantInventory.mass, maxProp) / Product.TYPES[Product.IDS.HYDROGEN_PROPELLANT].massPerUnit;
    }
    return 0;
  }, [crew?._inventoryBonuses, inEmergencyMode, propellantInventory, ship]);

  const stats = useMemo(() => ([
    {
      label: 'Cargo Mass Jettisoned',
      value: formatMass(inEmergencyMode ? 0 : cargoInventory.mass),
      direction: 0,
    },
    {
      label: 'Cargo Volume Jettisoned',
      value: formatVolume(inEmergencyMode ? 0 : cargoInventory.volume),
      direction: 0,
    },
    {
      label: 'Propellant Mass Jettisoned',
      value: formatResourceMass(propellantJettisoned, Product.IDS.HYDROGEN_PROPELLANT),
      direction: 0,
    },
    {
      label: 'Propellant Volume Jettisoned',
      value: formatResourceVolume(propellantJettisoned, Product.IDS.HYDROGEN_PROPELLANT),
      direction: 0,
    },
  ]), [cargoInventory, inEmergencyMode, propellantInventory]);

  const onToggle = useCallback(() => {
    if (inEmergencyMode) {
      return deactivateEmergencyMode();
    } else {
      return activateEmergencyMode();
    }
  }, [activateEmergencyMode, deactivateEmergencyMode, inEmergencyMode]);

  const actionDetails = useMemo(() => {
    const icon = inEmergencyMode ? <EmergencyModeExitIcon /> : <EmergencyModeEnterIcon />;
    const label = `${inEmergencyMode ? 'Exit' : 'Enter'} Emergency Mode`;
    const status = stage === actionStages.NOT_STARTED
      ? `${inEmergencyMode ? 'Restore' : 'Prepare'} Ship`
      : undefined;
    return { icon, label, status };
  }, [ship, stage]);

  const warnings = useMemo(() => {
    const w = [];
    const shipConfig = Ship.TYPES[ship.Ship.shipType];
    if (inEmergencyMode) {
      if (shipConfig.emergencyPropellantCap < 1) {
        w.push({
          icon: <WarningOutlineIcon />,
          text: `WARNING: Up to ${formatFixed(shipConfig.emergencyPropellantCap * 100, 1)}% of propellant capacity
            will be jettisoned when exiting Emergency Mode.`
        });
      }
    } else {
      w.push({
        icon: <WarningOutlineIcon />,
        text: `WARNING: All cargo in the ship's cargo hold will be jettisoned. This action is irreversible.`
      });
      if (shipPassengerCrews.length > 0) {
        w.push({
          icon: <CloseIcon />,
          text: 'All passengers must be ejected before the ship can enter Emergency Mode.'
        });
      }
    }
    return w;
  }, [ship, shipPassengerCrews]);

  return (
    <>
      <ActionDialogHeader
        action={actionDetails}
        actionCrew={crew}
        location={{ asteroid, lot, ship }}
        onClose={props.onClose}
        overrideColor={stage === actionStages.NOT_STARTED ? theme.colors.orange : undefined}
        stage={stage} />

      <ActionDialogBody>
        <ShipTab
          pilotCrew={crew}
          inventoryBonuses={crew?._inventoryBonuses}
          deltas={inEmergencyMode
            ? {
              propellantMass: -propellantJettisoned * Product.TYPES[Product.IDS.HYDROGEN_PROPELLANT].massPerUnit,
              propellantVolume: -propellantJettisoned * Product.TYPES[Product.IDS.HYDROGEN_PROPELLANT].volumePerUnit,
            }
            : {
              cargoMass: -cargoInventory?.mass,
              cargoVolume: -cargoInventory?.volume,
            }
          }
          statWarnings={inEmergencyMode
            ? (
              propellantJettisoned > 0
                ? {
                  propellantMass: true,
                  propellantVolume: true,
                }
                : {}
            )
            : {
              cargoMass: true,
              cargoVolume: true,
            }
          }
          ship={ship}
          stage={stage}
          warnings={warnings} />

        <ActionDialogStats
          stage={stage}
          stats={stats}
        />

      </ActionDialogBody>

      <ActionDialogFooter
        disabled={!inEmergencyMode && shipPassengerCrews?.length > 0}
        goLabel={inEmergencyMode ? 'Exit' : 'Enter'}
        onGo={onToggle}
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
  const { data: ship, isLoading: shipIsLoading } = useShip(crew?._location?.shipId);

  const manager = useShipEmergencyManager();
  const { actionStage } = manager;

  const isLoading = asteroidIsLoading || lotIsLoading || shipIsLoading;
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
      <EmergencyModeToggle
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
