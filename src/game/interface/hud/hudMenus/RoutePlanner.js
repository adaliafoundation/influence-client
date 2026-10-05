import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { Crew, Crewmate, Entity, Inventory, Ship, Time } from '@influenceth/sdk';

import { CrewCaptainCardFramed } from '~/components/CrewmateCardFramed';
import Dropdown from '~/components/Dropdown';
import { CheckedIcon, CloseIcon, RefreshIcon, UncheckedIcon, WarningIcon } from '~/components/Icons';
import MouseoverInfoPane from '~/components/MouseoverInfoPane';
import NumberInput from '~/components/NumberInput';
import Porkchop from '~/components/Porkchop';
import SliderInput from '~/components/SliderInput';
import useAsteroid from '~/hooks/useAsteroid';
import useCoarseTime from '~/hooks/useCoarseTime';
import useConstants from '~/hooks/useConstants';
import useCrewContext from '~/hooks/useCrewContext';
import useStore from '~/hooks/useStore';
import formatters from '~/lib/formatters';
import { sampleAsteroidOrbit } from '~/lib/geometryUtils';
import { getCrewAbilityBonuses, reactBool, formatFixed, nativeBool } from '~/lib/utils';
import { MaterialBonusTooltip, MouseoverContent, ShipImage, formatMass } from '../actionDialogs/components';
import { Scrollable } from './components/components';
import useWalletShips from '~/hooks/useWalletShips';

const ShipSelection = styled.div`
  align-items: center;
  display: flex;
  flex-direction: row;
  margin: 10px 0;
  & > div:first-child {
    height: 80px;
    margin-right: 8px;
    width: 125px;
  }
  & button {
    ${p => p.isSimulated && `color: ${p.theme.colors.main};`}
    margin-bottom: 10px;
  }
`;

const Sliders = styled.div``;
const SliderInfoRow = styled.div`
  align-items: center;
  display: flex;
  flex-direction: row;
  label {
    color: #888;
    flex: 1;
    font-size: 14px;
    b {
      color: ${p => p.disabled ? p.theme.colors.warning : p.theme.colors.main};
      font-weight: normal;
    }
  }
  input {
    background: rgba(${p => p.theme.colors.mainRGB}, 0.1);
    border: 1px solid rgba(${p => p.theme.colors.mainRGB}, 0.5);
    transition: border-color 250ms ease;
    width: 85px;
    ${p => !p.disabled && `
      &:hover {
        border-color: ${p.theme.colors.main};
      }
    `}
  }
  sub {
    font-size: 12px;
    opacity: 0.75;
    margin-left: 3px;
  }
`;
const SliderSection = styled.div``;

const SectionHeader = styled.div`
  align-items: center;
  border-bottom: 1px solid #333;
  color: #777;
  display: flex;
  font-size: 13px;
  height: 22px;
  margin-bottom: 4px;
  text-transform: uppercase;
  & > span:first-child {
    flex: 1;
  }
  & > label {
    align-items: center;
    cursor: ${p => p.theme.cursors.active};
    display: flex;
    opacity: 0.7;
    transition: opacity 250ms ease;
    & > svg {
      margin-right: 2px;
    }
    &:hover {
      opacity: 1;
    }
  }
`;
const SectionBody = styled.div`
  padding-left: 12px;
`;

const InfoRow = styled.div`
  align-items: center;
  border-bottom: 1px solid #222;
  display: flex;
  flex-direction: row;
  height: 32px;
  line-height: 0;
  label {
    font-size: 90%;
    text-transform: uppercase;
  }
`;

const Note = styled.span`
  color: ${p => p.isError ? p.theme.colors.error : p.theme.colors.main};
  flex: 1;
  font-size: 80%;
  font-weight: bold;
  padding-right: 10px;
  text-align: right;
`;

const Value = styled.span`
  text-align: right;
  min-width: 90px;

  ${p => p.bonus && p.bonus !== 1 && `
    color: ${p.bonus < 1 ? p.theme.colors.error : p.theme.colors.success};
    &:after {
      content: "${p.bonus < 1 ? ' ▲' : ' ▼'}";
      font-size: 50%;
      padding-left: 2px;
      vertical-align: middle;
    }
  `};
`;

const Closer = styled.span`
  color: ${p => p.theme.colors.main};
  cursor: ${p => p.theme.cursors.active};
  opacity: 0.5;
  transition: opacity 250ms ease;
  &:hover {
    opacity: 1;
  }
`;

const resolution = 1;
const minDelay = 0.1; // TODO: could switch to 0 safely it seems
const maxDelay = minDelay + 365;
const minTof = Math.max(resolution, 1);
const maxTof = minTof + 365;

// contents: [{ type: InventoryItem }],
//     entity: { type: Entity },
//     inventoryType: { type: Number },
//     mass: { type: Number },
//     slot: { type: Number },
//     status: { type: Number },
//     reservedMass: { type: Number },
//     reservedVolume: { type: Number },
//     volume: { type: Number }

const simInventoryDefaults = { contents: [], mass: 0, volume: 0, reservedMass: 0, reservedVolume: 0, status: Inventory.STATUSES.AVAILABLE };

const getInventoriesByShipType = (shipType) => {
  const inventories = [];
  const config = Ship.TYPES[shipType];

  if (config.cargoSlot) {
    inventories.push({
      ...simInventoryDefaults,
      slot: config.cargoSlot,
      inventoryType: config.cargoInventoryType
    });
  }

  if (config.propellantSlot) {
    inventories.push({
      ...simInventoryDefaults,
      slot: config.propellantSlot,
      inventoryType: config.propellantInventoryType
    });
  }

  return inventories;
};

const InfoRowWithTooltip = ({ children, tooltip }) => {
  const refEl = useRef();
  const [hovered, setHovered] = useState();
  return (
    <InfoRow
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      ref={refEl}>
      {children}
      {tooltip && (
        <MouseoverInfoPane referenceEl={refEl.current} visible={hovered}>
          <MouseoverContent>
            {tooltip}
          </MouseoverContent>
        </MouseoverInfoPane>
      )}
    </InfoRow>
  );
};

const RoutePlanner = () => {
  const coarseTime = useCoarseTime();
  const { crew, loading: crewIsLoading } = useCrewContext();

  const originId = useStore(s => s.asteroids.origin);
  const destinationId = useStore(s => s.asteroids.destination);
  const dispatchReorientCamera = useStore(s => s.dispatchReorientCamera);
  const dispatchTravelSolution = useStore(s => s.dispatchTravelSolution);
  const timeOverride = useStore(s => s.timeOverride);
  const travelSolution = useStore(s => s.asteroids.travelSolution);

  const { data: origin } = useAsteroid(originId);
  const { data: destination } = useAsteroid(destinationId);
  const { data: myShips, isLoading: myShipsLoading } = useWalletShips();
  const { data: TIME_ACCELERATION } = useConstants('TIME_ACCELERATION');

  const [baseTime, setBaseTime] = useState();

  const [emode, setEmode] = useState(false);
  const [cargoMass, setCargoMass] = useState(0);
  const [foodSupplies, setFoodSupplies] = useState(0);
  const [propellantMass, setPropellantMass] = useState(0);
  const [ship, setShip] = useState();

  // TODO: should this use baseTime instead?
  const crewFoodSupplies = useMemo(() => {
    if (!crew) return 100;
    const realTime = Time.fromOrbitADays(coarseTime, TIME_ACCELERATION).toDate().getTime() / 1000;
    const lastFedAgo = Time.toGameDuration(realTime - (crew?.Crew?.lastFed || 0), parseInt(TIME_ACCELERATION));
    return lastFedAgo > 0 ? Math.round(100 * Crew.getCurrentFoodRatio(lastFedAgo, crew._foodBonuses?.consumption)) : 100;
  }, [coarseTime, crew?.Crew?.lastFed]);

  const shipList = useMemo(() => {
    const escapeModule = crew?.Ship?.emergencyAt > 0 ? [ Object.assign({ _simulated: false }, crew ) ] : [];
    if (crewIsLoading || myShipsLoading) return [];

    return [
      // add escape module
      ...escapeModule,

      // add my ships
      ...(myShips || []).sort((a, b) => {
        if (crew?._location?.shipId === a.id) return -1;
        if (crew?._location?.shipId === b.id) return 1;

        const aLoc = a.Location.location;
        const bLoc = b.Location.location;

        if (aLoc.label === Entity.IDS.ASTEROID && aLoc.id === originId) return -1;
        if (bLoc.label === Entity.IDS.ASTEROID && bLoc.id === originId) return 1;

        if (aLoc.id === originId) return -1;
        if (bLoc.id === originId) return 1;

        return 0;
      }),

      // add simulations
      ...Object.keys(Ship.TYPES).map((s, i) => ({
        label: Entity.IDS.SHIP,
        id: -(1 + i),
        Name: { name: `Simulated ${Ship.TYPES[s].name}` },
        Ship: { shipType: Number(s), status: Ship.STATUSES.AVAILABLE },
        Location: { location: { label: Entity.IDS.ASTEROID, id: originId } },
        Inventories: getInventoriesByShipType(s),
        _simulated: true
      }))
    ].map((s) => ({
      ...s,
      _name: `${s.Ship.transitDeparture > 0 ? '[In Flight] ' : ''}${formatters.shipName(s)}`
    }))
  }, [crewIsLoading, crew?._location?.shipId, myShips, myShipsLoading, originId]);

  // select default
  useEffect(() => {
    if (shipList.length > 0 && !ship) {
      if (!!crew) {
        setShip(shipList[0]);
      } else { // if no crew, default to simulate shuttle (assuming in tutorial)
        setShip(shipList.find((s) => s._simulated && s.Ship.shipType === Ship.IDS.SHUTTLE));
      }
    }
  }, [!!crew, crewIsLoading, shipList, ship]);

  const toggleEmode = useCallback(() => {
    setEmode((e) => !e);
  }, []);

  const inventoryBonuses = useMemo(() => ({
    mass: crew?._inventoryBonuses?.mass,
    volume: crew?._inventoryBonuses?.volume
  }), [crew?._inventoryBonuses?.mass, crew?._inventoryBonuses?.volume]);

  const shipConfig = useMemo(() => {
    if (!ship) return null;

    const shipTypeConfig = Ship.TYPES[ship.Ship.shipType];
    const cargoInventory = ship.Inventories.find((i) => i.slot === shipTypeConfig.cargoSlot);
    const propellantInventory = ship.Inventories.find((i) => i.slot === shipTypeConfig.propellantSlot);

    const config = {};
    config.emode = ship._simulated ? emode : ship?.Ship?.emergencyAt > 0;
    config.maxCargoMass = config.emode ? 0 : (Inventory.getType(cargoInventory?.inventoryType, inventoryBonuses)?.massConstraint || 0);
    config.maxPropellantMass = (config.emode ? shipTypeConfig.emergencyPropellantCap : 1)
      * (Inventory.getType(propellantInventory?.inventoryType, inventoryBonuses)?.massConstraint || 0);

    if (ship._simulated) {
      config.initialCargoMass = config.maxCargoMass * 0.5;
      config.initialPropellantMass = config.maxPropellantMass * 0.5;
    } else {
      config.initialCargoMass = cargoInventory?.mass || 0;
      config.initialPropellantMass = propellantInventory?.mass || 0;
    }

    return config;
  }, [inventoryBonuses, emode, ship]);

  useEffect(() => {
    if (!shipConfig) return;
    setCargoMass(shipConfig.initialCargoMass);
    setPropellantMass(shipConfig.initialPropellantMass);
    setFoodSupplies((shipConfig.emode || ship?._simulated) ? 100 : crewFoodSupplies);
  }, [shipConfig, ship]);

  useEffect(() => {
    if (!ship?._simulated) {
      setFoodSupplies(crewFoodSupplies);
    }
  }, [crewFoodSupplies, ship]);

  // if no crew, assume this is tutorial simulation (so minimize cargo, maximize propellant and food)
  useEffect(() => {
    if (!crew && !crewIsLoading && !!shipConfig) {
      setCargoMass(0);
      setPropellantMass(shipConfig.maxPropellantMass);
      setFoodSupplies(100);
    }
  }, [crew, crewIsLoading, shipConfig]);

  const onSetCargoMass = useCallback((amount) => {
    const parsed = parseInt(amount * 1_000_000) || 0;
    setCargoMass(Math.max(0, Math.min(shipConfig?.maxCargoMass, Math.floor(parsed))));
  }, [shipConfig]);

  const onSetPropellantMass = useCallback((amount) => {
    const parsed = parseInt(amount * 1_000_000) || 0;
    setPropellantMass(Math.max(0, Math.min(shipConfig?.maxPropellantMass, Math.floor(parsed))));
  }, [shipConfig]);

  const onSetFoodSupplies = useCallback((amount) => {
    const parsed = parseInt(amount) || 0;
    setFoodSupplies(Math.max(0, Math.min(100, Math.floor(parsed))));
  }, [shipConfig]);

  const exhaustBonus = useMemo(() => getCrewAbilityBonuses(Crewmate.ABILITY_IDS.PROPELLANT_EXHAUST_VELOCITY, crew), [crew]);
  const exhaustBonusMultiplier = exhaustBonus?.totalBonus;
  const shipParams = useMemo(() => {
    if (!ship) return 0;
    const variantMod = 1 + (Ship.Entity.getVariant(ship)?.exhaustVelocityModifier || 0);
    const exhaustVelocity = (Ship.TYPES[ship.Ship.shipType]?.exhaustVelocity * exhaustBonusMultiplier) * variantMod || 0;
    const hullMass = Ship.TYPES[ship.Ship.shipType]?.hullMass || 0;
    const wetMass = hullMass + cargoMass + propellantMass;
    const maxDeltaV = Ship.propellantToDeltaV(ship.Ship.shipType, wetMass, propellantMass, exhaustBonusMultiplier);

    return {
      ...ship,
      actualCargoMass: cargoMass,
      actualPropellantMass: propellantMass,
      exhaustVelocity,
      hullMass,
      maxDeltaV
    };
  }, [ship, cargoMass, propellantMass, exhaustBonusMultiplier]);

  useEffect(() => {
    dispatchReorientCamera(true);

    return () => {
      dispatchReorientCamera(true);
    }
  }, [dispatchReorientCamera]);

  // baseTime is zero-time of the chart rendered. update if...
  //  - not set yet OR significantly different (i.e. time_acceleration changed)
  //  - use was fast-forwarding and is no longer
  //  - travel-solution was just cleared because no longer valid
  const isFastForwarding = (Math.abs(timeOverride?.speed) > 1);
  useEffect(() => {
    if (!baseTime || ((coarseTime - baseTime) / baseTime > 0.05)) {
      setBaseTime(coarseTime);
    }
  }, [coarseTime, TIME_ACCELERATION]);
  useEffect(() => {
    if (!isFastForwarding) setBaseTime(coarseTime);
  }, [isFastForwarding]);
  useEffect(() => {
    if (travelSolution?.departureTime && travelSolution?.departureTime < coarseTime) {
      setBaseTime(coarseTime);
    }
  }, [coarseTime, travelSolution?.departureTime]);

  const { originPath, destinationPath } = useMemo(() => {
    if (!origin || !destination || !baseTime) return {};
    // TODO: could do each of these in a worker as well
    //  (might as well move to porkchop at that point)
    const p1 = performance.now();
    const paths = {
      originPath: sampleAsteroidOrbit(
        baseTime,
        origin.Orbit,
        minDelay,
        maxDelay,
        resolution
      ),
      destinationPath: sampleAsteroidOrbit(
        baseTime,
        destination.Orbit,
        minDelay + minTof,
        maxDelay + maxTof,
        resolution
      )
    };

    console.log('time to sample trajectories', performance.now() - p1);
    return paths;
  }, [baseTime, origin, destination]);

  const lastFedAt = useMemo(() => {
    return baseTime - Crew.getTimeSinceFed(foodSupplies / 100, crew?._foodBonuses?.consumption) / 86400;
  }, [baseTime, crew, foodSupplies]);

  return (
    <Scrollable style={{ marginLeft: -12, paddingLeft: 12 }}>

      <ShipSelection isSimulated={ship?._simulated}>
        <ShipImage shipType={ship?.Ship?.shipType} simulated={reactBool(ship?._simulated)} />

        <div>
          <SectionHeader style={{ border: 0, margin: 0 }}>
            <span>Ship</span>
            <label onClick={ship?._simulated ? toggleEmode : undefined}>
              {shipConfig?.emode ? <CheckedIcon style={{ color: 'red' }} /> : <UncheckedIcon />}
              Emergency Mode
            </label>
          </SectionHeader>

          <Dropdown
            labelKey="_name"
            onChange={setShip}
            options={shipList}
            valueKey="id"
            size="small"
            style={{ textTransform: 'none', fontSize: '80%' }}
            width={230} />
        </div>

      </ShipSelection>

      <Sliders>
        <SliderSection>
          <SliderInfoRow disabled={!ship?._simulated}>
            <label><b>{ship?._simulated ? 'Simulated' : 'Actual'}</b> Onboard Cargo</label>
            <NumberInput
              disabled={nativeBool(!ship?._simulated || shipConfig?.emode)}
              min={0}
              max={shipConfig?.maxCargoMass / 1_000_000 || 0}
              onChange={onSetCargoMass}
              step={0.1}
              value={cargoMass / 1_000_000} />
            <sub>t</sub>
          </SliderInfoRow>
          <SliderInput
            disabled={nativeBool(!ship?._simulated || shipConfig?.emode)}
            min={0}
            max={shipConfig?.maxCargoMass / 1_000_000 || 0}
            increment={0.1}
            onChange={onSetCargoMass}
            value={cargoMass / 1_000_000 || 0} />
        </SliderSection>

        <SliderSection>
          <SliderInfoRow disabled={!ship?._simulated}>
            <label><b>{ship?._simulated ? 'Simulated' : 'Actual'}</b> Onboard Propellant</label>
            <NumberInput
              disabled={nativeBool(!ship?._simulated)}
              min={0}
              max={shipConfig?.maxPropellantMass / 1_000_000 || 0}
              onChange={onSetPropellantMass}
              step={0.1}
              value={propellantMass / 1_000_000} />
            <sub>t</sub>
          </SliderInfoRow>
          <SliderInput
            disabled={nativeBool(!ship?._simulated)}
            min={0}
            max={shipConfig?.maxPropellantMass / 1_000_000 || 0}
            increment={0.1}
            onChange={onSetPropellantMass}
            value={propellantMass / 1_000_000 || 0} />
        </SliderSection>

        {!shipConfig?.emode && (
          <SliderSection>
            <SliderInfoRow disabled={!ship?._simulated}>
              <label><b>{ship?._simulated ? 'Simulated' : 'Actual'}</b> Food Supplies</label>
              <NumberInput
                disabled={nativeBool(!ship?._simulated)}
                min={0}
                max={100}
                onChange={onSetFoodSupplies}
                step={1}
                value={foodSupplies || 0} />
              <sub style={{ marginRight: -4 }}>%</sub>
            </SliderInfoRow>
            <SliderInput
              disabled={nativeBool(!ship?._simulated)}
              min={0}
              max={100}
              increment={0.1}
              onChange={onSetFoodSupplies}
              value={foodSupplies || 0} />
          </SliderSection>
        )}
      </Sliders>

      <SectionHeader style={{ marginBottom: 10 }}>
        <span>Ballistic Transfer Graph</span>
        {!travelSolution && (coarseTime > (baseTime + 5)) && (
          <Closer onClick={() => setBaseTime(coarseTime)}><RefreshIcon /></Closer>
        )}
        {travelSolution && (
          <Closer onClick={dispatchTravelSolution}><CloseIcon /></Closer>
        )}
      </SectionHeader>
      <SectionBody>
        {shipParams && originPath && destinationPath && (
          <Porkchop
            originId={originId}
            destinationId={destinationId}
            baseTime={baseTime}
            emode={shipConfig?.emode}
            lastFedAt={lastFedAt}
            nowTime={coarseTime}
            originPath={originPath}
            destinationPath={destinationPath}
            minDelay={minDelay}
            maxDelay={maxDelay}
            minTof={minTof}
            maxTof={maxTof}
            exhaustBonus={exhaustBonus?.totalBonus}
            shipParams={shipParams}
            size={348}
          />
        )}
      </SectionBody>

      {travelSolution && (
        <>
          <SectionHeader>Route Details</SectionHeader>
          <SectionBody style={{ display: 'flex', paddingBottom: 20 }}>
            {crew && (
              <div style={{ paddingRight: 10, paddingTop: 5 }}>
                <CrewCaptainCardFramed crewId={crew?.id} width={67} />
              </div>
            )}
            <div style={{ flex: 1 }}>
              <InfoRow>
                <label>Depart</label>
                <Note>{travelSolution.departureTime > coarseTime ? '+' : ''}{formatFixed(Time.toRealDuration(24 * (travelSolution.departureTime - coarseTime), TIME_ACCELERATION), 1)}h</Note>
                <Value>
                  {Time.fromOrbitADays(travelSolution.departureTime, TIME_ACCELERATION).toGameClockADays(true)}
                </Value>
              </InfoRow>

              <InfoRow>
                <label>Arrive</label>
                <Note>{travelSolution.arrivalTime > coarseTime ? '+' : ''}{formatFixed(Time.toRealDuration(24 * (travelSolution.arrivalTime - coarseTime), TIME_ACCELERATION), 1)}h</Note>
                <Value>
                  {Time.fromOrbitADays(travelSolution.arrivalTime, TIME_ACCELERATION).toGameClockADays(true)}
                </Value>
              </InfoRow>

              <InfoRowWithTooltip
                tooltip={exhaustBonus.totalBonus && exhaustBonus.totalBonus !== 1 && (
                  <MaterialBonusTooltip
                    bonus={exhaustBonus}
                    isTimeStat
                    title="Propellant Utilization"
                    titleValue={`${formatFixed(100 / exhaustBonus.totalBonus, 1)}%`} />
                )}>
                <label>Propellant</label>
                <Note isError={travelSolution.usedPropellantPercent > 100}>
                  {travelSolution.usedPropellantPercent > 1000
                    ? <WarningIcon />
                    : `${formatFixed(travelSolution.usedPropellantPercent, 1)}%`
                  }
                </Note>
                <Value bonus={exhaustBonus.totalBonus}>
                  {formatMass(travelSolution.usedPropellantMass, { minPrecision: 4 })}
                </Value>
              </InfoRowWithTooltip>
            </div>
          </SectionBody>
        </>
      )}
    </Scrollable>
  );
};

export default RoutePlanner;
