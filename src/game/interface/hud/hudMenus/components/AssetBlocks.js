import { useCallback, useMemo } from 'react';
import styled, { keyframes } from 'styled-components';
import { Asteroid, Building, Dock, Entity, Inventory, Permission, Station } from '@influenceth/sdk';

import AsteroidRendering from '~/components/AsteroidRendering';
import ClipCorner from '~/components/ClipCorner';
import EntityName from '~/components/EntityName';
import {
  BioreactorBuildingIcon,
  ConstructIcon,
  ExtractorBuildingIcon,
  FactoryBuildingIcon,
  FormLotAgreementIcon,
  HabitatBuildingIcon,
  MarketplaceBuildingIcon,
  MyAssetIcon,
  RefineryBuildingIcon,
  ShipIcon,
  ShipyardBuildingIcon,
  SpaceportBuildingIcon,
  WarehouseBuildingIcon,
  TankfarmBuildingIcon
} from '~/components/Icons';
import useExtractionManager from '~/hooks/actionManagers/useExtractionManager';
import useProcessManager from '~/hooks/actionManagers/useProcessManager';
import useConstructionManager from '~/hooks/actionManagers/useConstructionManager';
import { ResourceImage } from '~/components/ResourceThumbnail';
import { useShipLink } from '~/components/ShipLink';
import { getShipIcon } from '~/lib/assetUtils';
import formatters from '~/lib/formatters';
import { formatFixed, formatTimer, getTerminatedAgreementStatus, locationsArrToObj } from '~/lib/utils';
import { majorBorderColor } from './components';
import useSyncedTime from '~/hooks/useSyncedTime';
import { useLotLink } from '~/components/LotLink';
import useBlockTime from '~/hooks/useBlockTime';

const thumbnailDimension = 65;
const iconThumbnailDimension = 36;

const MyAssetWrapper = styled.div`
  position: absolute;
  top: 2px;
  left: 2px;
  color: white;
`;

const Thumbnail = styled.div`
  background: black;
  border: 1px solid ${majorBorderColor};
  flex: 0 0 ${thumbnailDimension}px;
  ${p => p.theme.clipCorner(10)};
  height: ${thumbnailDimension}px;
  margin-right: 8px;
  position: relative;
  width: ${thumbnailDimension}px;
`;
const IconThumbnail = styled(Thumbnail)`
  align-items: center;
  ${p => p.theme.clipCorner(8)};
  display: flex;
  flex: 0 0 ${iconThumbnailDimension}px;
  font-size: 22px;
  height: ${iconThumbnailDimension}px;
  justify-content: center;
  width: ${iconThumbnailDimension}px;
  & ${MyAssetWrapper} {
    font-size: 10px;
  }
`;

const HoverContent = styled.span`
  display: none;
`;
const NotHoverContent = styled.span`
  font-weight: bold;
`;

const SelectableRow = styled.div`
  align-items: center;
  background: #181818;
  color: #999;
  cursor: ${p => p.theme.cursors.active};
  display: flex;
  flex-direction: row;
  font-size: 14px;
  margin-bottom: 3px;
  padding: 8px 6px;
  position: relative;
  width: 100%;

  &:hover {
    background: rgba(${p => p.theme.colors.darkMainRGB}, 0.2);
    ${HoverContent} {
      display: inline;
    }
    ${NotHoverContent} {
      display: none;
    }
  }
`;

const Details = styled.div`
  align-items: flex-start;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  & > label {
    font-size: inherit !important;
  }
  & > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const Info = styled.div`
  align-self: stretch;
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;

  & > label,
  & > ${Details} > label {
    color: white;
    display: block;
    font-size: 17px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    & > span {
      margin-left: 5px;
      opacity: 0.5;
    }
  }
  & > div {
    margin-top: 2px;
    & > b {
      color: white;
      font-weight: normal;
    }
  }
`;

const Status = styled.div`
  color: ${p => {
    if (Array.isArray(p.highlight)) {
      let c = p.theme.colors;
      p.highlight.forEach((k) => c = k ? c[k] : c);
      return (typeof c === 'string') ? c : '#555';
    } else if (p.highlight) {
      return p.theme.colors[p.highlight];
    } else {
      return 'white';
    }
  }};
  font-weight: bold;
`;

// TODO: progress should be an attribute, or else each of these creates a new class every second
const BarWrapper = styled.span`
  background: ${majorBorderColor};
  border-radius: 3px;
  display: block;
  position: relative;
  height: 3px;
  margin-top: 6px;
  width: 100%;
`;
const Bar = styled.div.attrs((p) => {
  const progressColor = p.progressColor || 'main';
  const background = p.theme.colors[p.progress === 1 && progressColor === 'main' ? 'success' : progressColor];
  return {
    style: {
      background,
      width: `${100 * p.progress}%`,
    }
  }
})`
  border-radius: 3px;
  position: absolute;
  height: 100%;
  left: 0;
  top: 0;
  transition: width 1000ms linear;
`;

const getBuildingIcon = (buildingType) => {
  switch(buildingType) {
    case Building.IDS.BIOREACTOR: return <BioreactorBuildingIcon />;
    case Building.IDS.EXTRACTOR: return <ExtractorBuildingIcon />;
    case Building.IDS.FACTORY: return <FactoryBuildingIcon />;
    case Building.IDS.HABITAT: return <HabitatBuildingIcon />;
    case Building.IDS.MARKETPLACE: return <MarketplaceBuildingIcon />;
    case Building.IDS.REFINERY: return <RefineryBuildingIcon />;
    case Building.IDS.SHIPYARD: return <ShipyardBuildingIcon />;
    case Building.IDS.SPACEPORT: return <SpaceportBuildingIcon />;
    case Building.IDS.WAREHOUSE: return <WarehouseBuildingIcon />;
    case Building.IDS.TANK_FARM: return <TankfarmBuildingIcon />;
    default: return <ConstructIcon />;
  }
}
export const AgreementBlock = ({ agreement, onSelectCrew, selectedCrew, setRef }) => {
  const blockTime = useBlockTime();

  const location = useMemo(() => locationsArrToObj(agreement.Location?.locations || [agreement.Location?.locations]), []);

  const onLotLink = useLotLink((
    agreement.label === Entity.IDS.LOT
    ? { asteroidId: location.asteroidId, lotId: agreement.id }
    : (
      agreement.label === Entity.IDS.BUILDING
      ? { asteroidId: location.asteroidId, lotId: location.lotId }
      : {}
    )
  ));
  const onShipLink = useShipLink(
    agreement.label === Entity.IDS.SHIP
    ? { shipId: agreement.id, zoomToShip: true }
    : {}
  );

  const [icon, name, onLink] = useMemo(() => {
    if (agreement.label === Entity.IDS.BUILDING) {
      return [
        getBuildingIcon(agreement.Building?.buildingType),
        formatters.buildingName(agreement),
        onLotLink
      ];
    }
    if (agreement.label === Entity.IDS.SHIP) {
      return [
        <ShipIcon />,
        formatters.shipName(agreement),
        onShipLink
      ];
    }
    if (agreement.label === Entity.IDS.LOT) {
      return [
        <FormLotAgreementIcon />,
        formatters.lotName(agreement),
        onLotLink
      ];
    }
  }, [agreement, onLotLink, onShipLink]);

  const [status, progress, progressColor] = useMemo(() => {
    if (agreement._agreement._type === Permission.POLICY_IDS.PREPAID) { // TODO: factor in noticeTime?
      const timeRemaining = agreement._agreement.endTime - blockTime;
      if (timeRemaining > 0) {
        return [
          formatTimer(timeRemaining, 2),
          1 - timeRemaining / (agreement._agreement.endTime - agreement._agreement.startTime),
          timeRemaining < 7 * 86400 ? 'error' : 'main'
        ];
      }
      return [getTerminatedAgreementStatus(agreement._agreement.status), 1, 'error'];
    }
    return [
      Permission.POLICY_TYPES[agreement._agreement._type]?.name || 'Allowlist',
      1,
      'main'
    ];
  }, [blockTime]);

  const onClick = useCallback(() => {
    onLink();
    onSelectCrew(agreement.Control?.controller?.id, agreement._agreement.permitted?.id);
  }, [onLink, onSelectCrew, agreement]);

  return (
    <SelectableRow ref={setRef} onClick={onClick}>
      <IconThumbnail>
        {selectedCrew?.id && agreement.Control?.controller?.id === selectedCrew?.id && <MyAssetWrapper><MyAssetIcon /></MyAssetWrapper>}
        {icon}
        <ClipCorner dimension={8} color={majorBorderColor} />
      </IconThumbnail>
      <Info>
        <Details>
          <label>
            {Permission.TYPES[agreement._agreement?.permission]?.name}
          </label>
          <span>
            <HoverContent>{name}</HoverContent>
            <NotHoverContent>{status}</NotHoverContent>
          </span>
        </Details>
        <BarWrapper><Bar progress={progress} progressColor={progressColor} /></BarWrapper>
      </Info>
    </SelectableRow>
  );
};

export const AsteroidBlock = ({ asteroid, onClick, onRenderReady, selectedCrew, showRender }) => {
  const rarity = useMemo(() => {
    if ([Asteroid.SCAN_STATUSES.SURFACE_SCANNED, Asteroid.SCAN_STATUSES.RESOURCE_SCANNED].includes(asteroid.Celestial.scanStatus)) {
      return Asteroid.Entity.getRarity(asteroid);
    }
    return '';
  }, [asteroid]);

  const isMine = useMemo(() => (
    selectedCrew?.id && (
      selectedCrew.id === asteroid.Control?.controller?.id
      || (selectedCrew._siblingCrewIds || []).includes(asteroid.Control?.controller?.id)
    )
  ), [selectedCrew, asteroid.Control?.controller?.id]);

  return (
    <SelectableRow onClick={onClick}>
      <Thumbnail>
        {isMine && <MyAssetWrapper><MyAssetIcon /></MyAssetWrapper>}
        {showRender && <AsteroidRendering asteroid={asteroid} onReady={onRenderReady} />}
        <ClipCorner dimension={10} color={majorBorderColor} />
      </Thumbnail>
      <Info>
        <label>{formatters.asteroidName(asteroid)}</label>
        <div>
          {Asteroid.Entity.getSize(asteroid)}
          <b style={{ marginLeft: 4 }}>{Asteroid.Entity.getSpectralType(asteroid)}-type</b>
        </div>
      </Info>
      <Status highlight={['rarity', rarity]}>
        {asteroid.Celestial.scanStatus === Asteroid.SCAN_STATUSES.UNSCANNED && `Unscanned`}
        {[Asteroid.SCAN_STATUSES.SURFACE_SCANNING, Asteroid.SCAN_STATUSES.RESOURCE_SCANNING].includes(asteroid.Celestial.scanStatus) && `Scanning...`}
        {[Asteroid.SCAN_STATUSES.SURFACE_SCANNED, Asteroid.SCAN_STATUSES.RESOURCE_SCANNED].includes(asteroid.Celestial.scanStatus) && rarity}
      </Status>
    </SelectableRow>
  );
};

export const BuildingBlock = ({ building, onSelectCrew, selectedCrew, setRef }) => {
  const syncedTime = useSyncedTime();
  const buildingLoc = locationsArrToObj(building?.Location?.locations);
  const onClickBuilding = useLotLink(buildingLoc);
  const { currentExtraction } = useExtractionManager(buildingLoc?.lotId);
  const { currentProcess } = useProcessManager(buildingLoc?.lotId, building.Processors?.[0]?.slot);
  const { currentConstructionAction } = useConstructionManager(buildingLoc?.lotId);

  const [progress, progressColor] = useMemo(() => {
    if (building?.Building?.status === Building.CONSTRUCTION_STATUSES.OPERATIONAL) {
      if (Building.TYPES[building?.Building?.buildingType]?.category === Building.CATEGORIES.STORAGE) {
        const inventory = (building.Inventories || []).find((i) => i.status === Inventory.STATUSES.AVAILABLE);
        const filledCapacity = Inventory.getFilledCapacity(inventory?.inventoryType, selectedCrew?._inventoryBonuses);
        const usage = inventory
          ? Math.min(1,
            Math.max(
              ((inventory.mass || 0) + (inventory.reservedMass || 0)) / filledCapacity.filledMass,
              ((inventory.volume || 0) + (inventory.reservedVolume || 0)) / filledCapacity.filledVolume,
            )
          )
          : 0;
        return [usage, usage < 0.75 ? 'main' : (usage < 0.9 ? 'warning' : 'error')];
      }

      // TODO: ecs refactor -- must get startTime, finishTime from action items for all the following
      // TODO: should have multiple bars for multiple processes / inventories
      // TODO: anything to show for marketplace?
      // TODO: how do drydocks work at shipyard?

      if (building?.Building?.buildingType === Building.IDS.SPACEPORT) {
        const usage = Math.min(1, building.Dock.dockedShips / Dock.TYPES[building.Dock.dockType].cap);
        return [usage, usage < 0.75 ? 'main' : (usage < 0.9 ? 'warning' : 'error')];
      }
      else if (building?.Building?.buildingType === Building.IDS.HABITAT) {
        const usage = Math.min(1, building.Station.population / Station.TYPES[building.Station.stationType].cap);
        return [usage, usage < 0.75 ? 'main' : (usage < 0.9 ? 'warning' : 'error')];
      }

      else if (building?.Building?.buildingType === Building.IDS.EXTRACTOR && currentExtraction) {
        return [
          Math.min(1, (syncedTime - currentExtraction.startTime) / (currentExtraction.finishTime - currentExtraction.startTime)),
          'main'
        ];
      }
      else if (currentProcess) {
        return [
          Math.min(1, (syncedTime - currentProcess?.startTime) / (currentProcess?.finishTime - currentProcess?.startTime)),
          'main'
        ];
      }
    }

    if (building?.Building?.status === Building.CONSTRUCTION_STATUSES.PLANNED) {
      return [
        Math.min(1, 1 - (building?.Building?.plannedAt + Building.GRACE_PERIOD - syncedTime) / Building.GRACE_PERIOD),
        'error'
      ];
    }

    if (building?.Building?.status === Building.CONSTRUCTION_STATUSES.UNDER_CONSTRUCTION && currentConstructionAction) {
      return [
        Math.min(1, (syncedTime - currentConstructionAction.startTime) / (currentConstructionAction.finishTime - currentConstructionAction.startTime)),
        'main'
      ];
    }
    return [0];
  }, [building, selectedCrew?._inventoryBonuses, syncedTime]);

  const status = useMemo(() => {
    if (building?.Building?.status === Building.CONSTRUCTION_STATUSES.OPERATIONAL) {
      if (building?.Building?.buildingType === Building.IDS.EXTRACTOR && building?.Extractors?.[0]?.status > 0) {
        return 'Extracting';

      } else if (building?.Processors?.length && building?.Processors?.[0]?.status > 0) {
        return 'Processing';

      } else if (
        Building.TYPES[building?.Building?.buildingType]?.category === Building.CATEGORIES.STORAGE
        || [Building.IDS.SPACEPORT, Building.IDS.HABITAT].includes(building?.Building?.buildingType)
      ) {
        return `${formatFixed(100 * progress, 1)}% Full`
      }
      return 'Idle';
    }
    if (
      building?.Building?.status === Building.CONSTRUCTION_STATUSES.PLANNED
      && building?.Building?.plannedAt + Building.GRACE_PERIOD < syncedTime
    ) {
      return 'At Risk';
    }
    return `${Building.CONSTRUCTION_STATUS_LABELS[building?.Building?.status || 0]}`;
  }, [building, progress, syncedTime]);

  const onClick = useCallback(() => {
    onClickBuilding();
    onSelectCrew(building.Control?.controller?.id);
  }, [onClickBuilding, onSelectCrew, building?.Control?.controller?.id, buildingLoc?.lotId]);

  const isMine = useMemo(() => (
    selectedCrew?.id && (
      selectedCrew.id === building.Control?.controller?.id
      || (selectedCrew._siblingCrewIds || []).includes(building.Control?.controller?.id)
    )
  ), [selectedCrew, building.Control?.controller?.id]);

  return (
    <SelectableRow ref={setRef} onClick={onClick}>
      <IconThumbnail>
        {isMine && <MyAssetWrapper><MyAssetIcon /></MyAssetWrapper>}
        {getBuildingIcon(building?.Building?.buildingType)}
        <ClipCorner dimension={8} color={majorBorderColor} />
      </IconThumbnail>
      <Info>
        <Details>
          <label>
            {formatters.buildingName(building)}
          </label>
          <span>
            <HoverContent>{formatters.lotName(buildingLoc?.lotIndex)}</HoverContent>
            <NotHoverContent>{status === 'Under Construction' ? 'Construction' : status}</NotHoverContent>
          </span>
        </Details>
        <BarWrapper><Bar progress={progress} progressColor={progressColor} /></BarWrapper>
      </Info>
    </SelectableRow>
  );
};

export const ShipBlock = ({ ship, onSelectCrew, selectedCrew, setRef }) => {
  const onClickShip = useShipLink({ shipId: ship.id, zoomToShip: true });
  const location = useMemo(() => locationsArrToObj(ship.Location?.locations || []));

  const status = useMemo(() => {
    if (location?.buildingId) return 'Docked';
    if (location?.lotIndex) return 'Landed';
    if (!location?.lotIndex && ship.Ship?.transitDestination) return 'In Flight';
    if (!location?.lotIndex && !ship.Ship?.transitDestination) return 'In Orbit';
    return '';
  }, [location, ship.Ship?.transitDestination]);

  const onClick = useCallback(() => {
    onClickShip();
    onSelectCrew(ship.Control?.controller?.id);
  }, [onClickShip, onSelectCrew, ship?.Control?.controller?.id]);

  const isMine = useMemo(() => (
    selectedCrew?.id && (
      selectedCrew.id === ship.Control?.controller?.id
      || (selectedCrew._siblingCrewIds || []).includes(ship.Control?.controller?.id)
    )
  ), [selectedCrew, ship.Control?.controller?.id]);

  return (
    <SelectableRow ref={setRef} onClick={onClick}>
      <Thumbnail>
        {isMine && <MyAssetWrapper><MyAssetIcon /></MyAssetWrapper>}
        <ResourceImage src={getShipIcon(ship.Ship.shipType, 'w150')} contain />
        <ClipCorner dimension={10} color={majorBorderColor} />
      </Thumbnail>
      <Info>
        <label style={{ maxWidth: 192 }}>{formatters.shipName(ship)}</label>
        <div>
          <EntityName {...(ship.Ship?.transitDestination || ship.Location?.location)} />
        </div>
      </Info>
      <Status highlight={status === 'In Flight' ? 'inFlight' : (status === 'In Orbit' ? 'main' : null)}>
        {status}
      </Status>
    </SelectableRow>
  );
};