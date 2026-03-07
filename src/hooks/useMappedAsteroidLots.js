import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from 'react-query';
import { Building, Entity, Lot } from '@influenceth/sdk';

import { options as lotLeaseOptions } from '~/components/filters/LotLeaseFilter';
import useAsteroidWalletBuildings from '~/hooks/useAsteroidWalletBuildings';
import useAsteroidLotData from '~/hooks/useAsteroidLotData';
import useWalletLeasedLots from '~/hooks/useWalletLeasedLots';
import useWalletShips from '~/hooks/useWalletShips';
import useStore from '~/hooks/useStore';
import { getAndCacheEntity } from '~/lib/activities';
import { locationsArrToObj } from '~/lib/utils';
import theme from '~/theme';

const lotLeaseOptionKeys = Object.keys(lotLeaseOptions);

const LotAttribute = {
  HAS_SAMPLES:   { value: "hasSamples"  , mask: 0b0000000000000001, shift: 0 },
  HAS_CREW:      { value: "hasCrew"     , mask: 0b0000000000000010, shift: 1 },
  LEASE_STATUS:  { value: "leaseStatus" , mask: 0b0000000000001100, shift: 2 },
  BUILDING_TYPE: { value: "buildingType", mask: 0b0000001111110000, shift: 4 },
}

const LotSpecialType = { EMPTY: 0, CONTRUCTION_SITE: 62, LANDED_SHIP: 63}

const useMappedAsteroidLots = (i) => {
  const queryClient = useQueryClient();

  const isAssetSearchMatchingDefault = useStore(s => s.isAssetSearchMatchingDefault);
  const mappedLotSearch = useStore(s => s.assetSearch.lotsMapped);
  const openHudMenu = useStore(s => s.openHudMenu);
  const highlightConfig = useStore(s => s.assetSearch.lotsMapped.highlight);
  // const mapResourceId = useStore(s => s.asteroids.resourceMap?.active && s.asteroids.resourceMap?.selected);

  const [rebuildTally, setRebuildTally] = useState(0);

  // get all packed lot data from server
  const { data: lotData, isLoading: lotDataLoading, dataUpdatedAt: lotDataUpdatedAt } = useAsteroidLotData(i);

  // get all leased lots from the server
  const { data: leasedLots, isLoading: leasedLotsLoading, dataUpdatedAt: dataUpdatedAt1 } = useWalletLeasedLots(i);
  const [lotLeasedMap, leasedTally] = useMemo(() => ([
    (leasedLots || []).reduce((acc, d) => ({ ...acc, [Lot.toIndex(d.id)]: true }), {}),
    leasedLots?.length || 0
  ]), [leasedLots, dataUpdatedAt1]);

  // get all occupied-by-me buildings from the server
  const { data: walletLots, isLoading: walletLotsLoading, dataUpdatedAt: dataUpdatedAt2 } = useAsteroidWalletBuildings(i);
  const myOccupationMap = useMemo(() => {
    if (walletLotsLoading) return null;
    return (walletLots || []).reduce((acc, p) => {
      const _locations = locationsArrToObj(p?.Location?.locations || []);
      return {
        ...acc,
        [_locations.lotIndex]: true
      };
    }, {});
  }, [walletLots, walletLotsLoading, dataUpdatedAt2]);

  // get all occupied-by-me ships from the server
  const { data: walletShips, isLoading: walletShipsLoading, dataUpdatedAt: dataUpdatedAt3 } = useWalletShips();
  const myShipMap = useMemo(() => {
    if (walletShipsLoading) return null;
    return (walletShips || []).reduce((acc, p) => {
      const _locations = locationsArrToObj(p?.Location?.locations || []);
      return {
        ...acc,
        [_locations.lotIndex]: true
      };
    }, {});
  }, [walletShips, walletShipsLoading, dataUpdatedAt3]);

  // determine if search is on or not
  const searchIsOn = useMemo(() => {
    return openHudMenu === 'ASTEROID_MAP_SEARCH' || !isAssetSearchMatchingDefault('lotsMapped');
  }, [openHudMenu, mappedLotSearch]);

  // init highlight config helpers
  const { highlightValueMap, highlightColorMap } = useMemo(() => {
    let colorMap;
    let valueMap = {};
    if (highlightConfig) {
      valueMap = Object.keys(highlightConfig.colorMap).reduce((acc, key, i) => {
        acc[key] = i;
        return acc;
      }, {});
      colorMap = Object.values(highlightConfig.colorMap);
    } else if (searchIsOn) {
      colorMap = { 0: '#ff00ff' };
    } else {
      colorMap = { 0: theme.colors.main, 1: '#ffffff' };
    }
    return {
      highlightColorMap: colorMap,
      highlightValueMap: valueMap
    }
  }, [highlightConfig, searchIsOn]);

  // create "search results" test function
  const isFilterMatch = useCallback((unpacked) => {
    const filters = mappedLotSearch?.filters || {};
    if (searchIsOn) {
      if (filters.category && !filters.category.includes(unpacked.category.toString())) return false;
      if (filters.leasability && filters.leasability !== unpacked.leasability) return false;
      if (filters.occupiedBy && filters.occupiedBy !== unpacked.occupiedBy) return false;
      if (filters.hasCrew && !unpacked.crewPresent) return false;
      if (filters.hasCoresForSale && !unpacked.coresPresent) return false;
      return true;
    } else {
      return unpacked.category > 0;
    }
  }, [mappedLotSearch?.filters, searchIsOn]);

  // build sparse array of search results
  // TODO (enhancement): should send this to a worker if possible
  const [lotResultMap, lotUseMap, lotColorMap, lotUseTallies, resultTally] = useMemo(() => {
    const lotResult = {};
    const lotColor = {};
    const lotUse = {};

    let unpacked = {};
    let isResult = false;
    let lotUseTallies = {};
    let resultTally = 0;

    if (lotData && myOccupationMap && myShipMap) {
      for (let i = 1; i < lotData.length; i++) {

        // unpack this lot data
        unpacked.type = (lotData[i] & LotAttribute.BUILDING_TYPE.mask) >>> LotAttribute.BUILDING_TYPE.shift;
        unpacked.leasability = (lotData[i] & LotAttribute.LEASE_STATUS.mask) >>> LotAttribute.LEASE_STATUS.shift;
        unpacked.crewPresent = (lotData[i] & LotAttribute.HAS_CREW.mask) >>> LotAttribute.HAS_CREW.shift;
        unpacked.coresPresent = (lotData[i] & LotAttribute.HAS_SAMPLES.mask) >>> LotAttribute.HAS_SAMPLES.shift;

        unpacked.leasability = lotLeaseOptionKeys[unpacked.leasability];
        unpacked.category = Building.TYPES[unpacked.type]?.category ?? 0;

        unpacked.occupiedBy = unpacked.category === 0
          ? 'unoccupied'
          : (
            (myOccupationMap[i] || myShipMap[i])
              ? 'me'
              : 'other'
          );

        // determine if this lot should be "bright"
        isResult = false;
        if (isFilterMatch(unpacked)) {
          isResult = true;
          resultTally++;
        }

        // determine if this lot should have an icon
        if (unpacked.type > 0) {
          lotUse[i] = unpacked.type;
          lotUseTallies[unpacked.type] = (lotUseTallies[unpacked.type] || 0) + 1;
          lotUseTallies.total = (lotUseTallies.total || 0) + 1;
        }

        // if this lot has something, include in the results
        if (isResult) {
          lotResult[i] = isResult;

          // (if including, also calculate the color)
          if (highlightConfig) {    // custom highlight colors
            lotColor[i] = highlightValueMap[unpacked[highlightConfig.field]];
          } else if (searchIsOn) {  // (default in search mode) 0 magenta
            lotColor[i] = 0;
          } else {                  // (default in non-search mode) 0 blue, 1 white
            lotColor[i] = (myOccupationMap[i] || myShipMap[i]) ? 1 : 0;
          }
        }
      }
    }

    return [lotResult, lotUse, lotColor, lotUseTallies, resultTally];
  }, [lotData, lotDataUpdatedAt, myOccupationMap, myShipMap, isFilterMatch, highlightValueMap, rebuildTally]);

  const refetch = useCallback(() => {
    setRebuildTally((t) => t + 1);
  }, [])

  const processEvent = useCallback(async (eventType, body) => {
    console.log('processEvent', eventType, body);

    let asteroidId, lotIndex, buildingType;

    // TODO: the above does not block prepopping of other activities, so any
    // getAndCacheEntity may result in double-fetches on invalidation via this event

    // construction site planned
    if (eventType === 'ConstructionPlanned') {
      asteroidId = body.event.returnValues.asteroid.id;
      lotIndex = Lot.toIndex(body.event.returnValues.lot.id);
      buildingType = LotSpecialType.CONTRUCTION_SITE;

    // construction site -> building
    } else if (eventType === 'ConstructionFinished') {
      const building = await getAndCacheEntity(body.event.returnValues.building, queryClient);
      const _location = locationsArrToObj(building?.Location?.locations || []);
      asteroidId = _location.asteroidId;
      lotIndex = _location.lotIndex;
      buildingType = building?.Building?.buildingType ?? 0;

    // building -> construction site
    } else if (eventType === 'ConstructionDeconstructed') {
      const building = await getAndCacheEntity(body.event.returnValues.building, queryClient);
      const _location = locationsArrToObj(building?.Location?.locations || []);
      asteroidId = _location.asteroidId;
      lotIndex = _location.lotIndex;
      buildingType = LotSpecialType.CONTRUCTION_SITE;

    // construction site abandoned
    } else if (eventType === 'ConstructionAbandoned') {
      const building = await getAndCacheEntity(body.event.returnValues.building, queryClient);
      const _location = locationsArrToObj(building?.Location?.locations || []);
      asteroidId = _location.asteroidId;
      lotIndex = _location.lotIndex;
      buildingType = LotSpecialType.EMPTY;

    // ship moved to empty lot
    } else if (eventType === 'ShipDocked' || eventType === 'ShipAssemblyFinished') {
      const entityId = body.event.returnValues.dock || body.event.returnValues.destination;
      if (entityId?.label === Entity.IDS.LOT) {
        const position = Lot.toPosition(entityId);
        asteroidId = position.asteroidId;
        lotIndex = position.lotIndex;
        buildingType = LotSpecialType.LANDED_SHIP;
      }

    // ship undocked from empty lot
    } else if (eventType === 'ShipUndocked') {
      if (body.event.returnValues.dock.label === Entity.IDS.LOT) {
        const position = Lot.toPosition(body.event.returnValues.dock);
        asteroidId = position.asteroidId;
        lotIndex = position.lotIndex;
        buildingType = LotSpecialType.EMPTY;
      }
    }

    if (asteroidId && lotIndex && buildingType !== undefined) {
      // TODO: these events could/should technically go through the same invalidation process as primary events
      //  (it's just that these events won't match as much data b/c most may not be relevant to my crew)
      queryClient.setQueryData([ 'asteroidPackedLotData', Number(asteroidId) ], (currentLotsValue) => {
        const newLotsValue = currentLotsValue.slice();
        newLotsValue[lotIndex] =
          (newLotsValue[lotIndex] & (~ LotAttribute.BUILDING_TYPE.mask))  // clear existing building
          | (buildingType << LotAttribute.BUILDING_TYPE.shift)                // set to new buildingCategory
        return newLotsValue;
      });
    }
  }, []);

  const isLoading = lotDataLoading || leasedLotsLoading || walletLotsLoading;

  return useMemo(() => {
    return {
      data: {
        lotUseTallies,
        leasedTally,
        resultTally,
        colorMap: highlightColorMap,
        lotResultMap,
        lotUseMap,
        lotColorMap,
        lotLeasedMap,
        lastLotUpdate: Date.now()
      },
      isLoading,
      processEvent,
      refetch
    };
  }, [
    lotUseTallies,
    leasedTally,
    resultTally,
    highlightColorMap,
    lotResultMap,
    lotUseMap,
    lotColorMap,
    lotLeasedMap,
    isLoading,
    processEvent,
    refetch
  ]);
};

export default useMappedAsteroidLots;
