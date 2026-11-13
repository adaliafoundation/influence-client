import { prospectingOnchain } from '~/game/prospecting/store';
import { useCallback, useEffect, useMemo } from 'react';
import { Asteroid, Building, Crewmate, Permission, Product, Ship } from '@influenceth/sdk';

import useStore from '~/hooks/useStore';
import constants from '~/lib/constants';
import AsteroidNameFilter from './filters/AsteroidNameFilter';
import BooleanFilter from './filters/BooleanFilter';
import BuildingAccessFilter from './filters/BuildingAccessFilter';
import BuildingNameFilter from './filters/BuildingNameFilter';
import CheckboxFilter from './filters/CheckboxFilter';
import CrewOwnershipFilter from './filters/CrewOwnershipFilter';
import LotIdFilter from './filters/LotIdFilter';
import LotOccupiedFilter from './filters/LotOccupiedFilter';
import LotLeaseFilter from './filters/LotLeaseFilter';
import OwnershipFilter from './filters/OwnershipFilter';
import RangeFilter from './filters/RangeFilter';
import SurfaceAreaFilter from './filters/SurfaceAreaFilter';
import TextFilter from './filters/TextFilter';

// spectral type filter configs
const spectralTypeOptions = Object.keys(Asteroid.SPECTRAL_TYPES).reduce((acc, spectralId) => ([
  ...acc,
  { key: spectralId, label: `${Asteroid.getSpectralType(spectralId)}-type`, initialValue: true }
]), []);

const scanStatusOptions = [
  { key: Asteroid.SCAN_STATUSES.UNSCANNED, label: 'Un-scanned', initialValue: true },
  { key: Asteroid.SCAN_STATUSES.SURFACE_SCANNED, label: 'Long-range scanned', initialValue: true },
  { key: Asteroid.SCAN_STATUSES.RESOURCE_SCANNED, label: 'Orbital scanned', initialValue: true }
];

const scanStatusColors = {
  [Asteroid.SCAN_STATUSES.UNSCANNED]: '#333333',
  [Asteroid.SCAN_STATUSES.SURFACE_SCANNED]: '#00c7ff',
  [Asteroid.SCAN_STATUSES.RESOURCE_SCANNED]: '#ff00f2'
};

const agreementRoleOptions = [
  { key: 'lessor', label: 'Lessor', initialValue: true },
  { key: 'lessee', label: 'Lessee', initialValue: true },
];

const agreementTimingOptions = [
  { key: 'active', label: 'Active', initialValue: true },
  { key: 'recently_expired', label: 'Recently Expired', initialValue: true },
  { key: 'old_expired', label: 'Long Expired', initialValue: false },
];

const agreementPermissions = Object.keys(Permission.TYPES).map((key) => ({
  key, label: Permission.TYPES[key].name, initialValue: true
})).sort((a, b) => a.label < b.label ? -1 : 1);

const spectralTypeColors = {
  1: '#6efaf4',
  2: '#00f3ff',
  3: '#00ebff',
  4: '#00e1ff',
  5: '#00d5ff',
  6: '#00c7ff',
  7: '#00b6ff',
  8: '#50a0ff',
  9: '#a084ff',
  10: '#d65dff',
  11: '#ff00f2'
};

// building type filter configs
const buildingTypeOptions = Object.keys(Building.TYPES)
  .filter((k) => k > 0)
  .reduce((acc, key) => ([
    ...acc,
    { key, label: Building.TYPES[key].name, initialValue: true }
  ]), []);

// building type filter configs
const shipTypeOptions = Object.keys(Ship.TYPES)
  .filter((k) => k > 0 && Number(k) !== Ship.IDS.ESCAPE_MODULE)
  .reduce((acc, key) => ([
    ...acc,
    { key, label: Ship.TYPES[key].name, initialValue: true }
  ]), []);

const shipVariantOptions = Object.keys(Ship.VARIANT_TYPES)
  .filter((k) => k > 0)
  .reduce((acc, key) => ([
    ...acc,
    { key, label: Ship.VARIANT_TYPES[key].name, initialValue: true }
  ]), []);

const buildingCategoryColors = {
    0: '#666666', // empty lot
    1: '#ff8c00', // STORAGE
    2: '#d9352b', // EXTRACTION
    3: '#cc3777', // REFINING
    4: '#0a9900', // AGRICULTURE
    5: '#b3855c', // MANUFACTURING
    6: '#4848b3', // SHIPBUILDING
    7: '#19d9ff', // TRANSPORT
    8: '#57ff65', // TRADE
    9: '#ffff00', // HOUSING
    // (extras)
    14: '#777777',  // construction site
    15: '#ffffff',  // landed light transport
  };

const lotSearchBuildingCategoryOptions = Object.entries(Building.CATEGORIES).reduce((acc, [name, id]) => ([
  ...acc,
  { key: id, label: `${name.charAt(0)}${name.slice(1).toLowerCase()}`, initialValue: true }
]), []);
lotSearchBuildingCategoryOptions.splice(0, 0, { key: 0, label: 'Empty Lot', initialValue: true });
lotSearchBuildingCategoryOptions.splice(1, 0, { key: 14, label: 'Construction Site', initialValue: true });
lotSearchBuildingCategoryOptions.push({ key: 15, label: 'Light Transport (landed)', initialValue: true });

const lotSearchBuildingTypeOptions = Object.keys(Building.TYPES).reduce((acc, key) => ([
  ...acc,
  { key, label: Building.TYPES[key].name, initialValue: true }
]), []);
lotSearchBuildingTypeOptions.splice(1, 0, { key: 14, label: 'Construction Site', initialValue: true });
lotSearchBuildingTypeOptions.push({ key: 15, label: 'Light Transport (landed)', initialValue: true });

const constructionStatusOptions = Object.keys(Building.CONSTRUCTION_STATUS_LABELS)
  .reduce((acc, key) => ([
    ...acc,
    { key, label: Building.CONSTRUCTION_STATUS_LABELS[key], initialValue: true }
  ]), [])
  .filter(({ key }) => key > 0);

const actionItemStatusOptions = [
  { key: 'pending', label: 'Pending', initialValue: true },
  { key: 'failed', label: 'Failed', initialValue: true },
  { key: 'ready', label: 'Ready', initialValue: true },
  { key: 'unready', label: 'In Progress', initialValue: true },
  { key: 'unstarted', label: 'Scheduled', initialValue: true },
  { key: 'plan', label: 'Planned', initialValue: true },
  { key: 'agreement', label: 'Expiring Agreements', initialValue: true },
];

// resource type filter configs
const resourceTypeOptions = Object.keys(Product.TYPES)
  .filter((k) => Product.TYPES[k].type === 'Raw Material')
  .reduce((acc, key) => ([
    ...acc,
    { key, label: Product.TYPES[key].name, initialValue: true }
  ]), []);

// crewmate class filter configs
const crewmateClassOptions = Object.keys(Crewmate.CLASSES).reduce((acc, key) => ([
  ...acc,
  { key, label: Crewmate.CLASSES[key].name, initialValue: true }
]), []);

// crewmate collection filter configs
const crewmateCollectionOptions = Object.keys(Crewmate.COLLECTIONS).reduce((acc, key) => ([
  ...acc,
  { key, label: Crewmate.COLLECTIONS[key].name, initialValue: true }
]), []);

const surfaceAreaConfig = {
  fieldNames: { min: 'surfaceAreaMin', max: 'surfaceAreaMax' },
  labels: { min: 'Min (km²)', max: 'Max (km²)' },
  rangeLimits: { min: 13, max: 1768485 }
};

const axisConfig = {
  fieldNames: { min: 'axisMin', max: 'axisMax' },
  // fieldNote: formatters.period,
  labels: { min: 'Min (AU)', max: 'Max (AU)' },
  rangeLimits: { min: constants.MIN_AXIS, max: constants.MAX_AXIS }
};

const inclinationConfig = {
  fieldNames: { min: 'incMin', max: 'incMax' },
  labels: { min: 'Min (Deg)', max: 'Max (Deg)' },
  rangeLimits: { min: constants.MIN_INCLINATION, max: constants.MAX_INCLINATION },
  displayFormatter: (r) => r > 0 ? Math.round(100 * 180 * r / Math.PI) / 100 : '',
  searchFormatter: (d) => d >= 0 ? Math.PI * d / 180 : undefined
};

const eccConfig = {
  fieldNames: { min: 'eccMin', max: 'eccMax' },
  rangeLimits: { min: constants.MIN_ECCENTRICITY, max: constants.MAX_ECCENTRICITY }
};

const yieldConfig = {
  fieldNames: { min: 'yieldMin', max: 'yieldMax' },
  labels: { min: 'Min (tonnes)', max: 'Max (tonnes)' },
  rangeLimits: { min: 0, max: 10000 }
};

// TODO: there is probably a more performant and/or organized way to break these apart
//  (and to memoize any inputs possible)
const SearchFilters = ({ assetType, highlighting, isListView = false }) => {
  const asteroidId = useStore(s => s.asteroids.origin);
  const zoomStatus = useStore(s => s.asteroids.zoomStatus);
  const filters = useStore(s => s.assetSearch[assetType].filters);
  const updateFilters = useStore(s => s.dispatchFiltersUpdated(assetType));

  const onFiltersChange = useCallback((update) => {
    const newFilters = {...(filters || {})};
    Object.keys(update).forEach((k) => {
      if (update[k] === undefined) {
        delete newFilters[k];
      } else {
        newFilters[k] = update[k];
      }
    });
    updateFilters(newFilters);
  }, [filters, updateFilters]);

  const filterProps = useMemo(() => ({
    assetType,
    filters,
    onChange: onFiltersChange,
    isListView
  }), [assetType, filters, highlighting, onFiltersChange, isListView]);

  useEffect(() => {
    // for most types, default filter to asteroid if one is selected
    if (['buildings','coresamples','leases','lots','ships'].includes(assetType)) {
      onFiltersChange({ asteroid: asteroidId });
    }
    else if (['actionitems'].includes(assetType)) {
      onFiltersChange({ asteroid: zoomStatus === 'in' ? asteroidId : undefined });
    }
  }, [asteroidId, assetType, zoomStatus]);

  if (assetType === 'agreements') {
    return (
      <>
        {/* TODO: asteroid */}
        {/* TODO: crew search */}
        {/* TODO: agreement type */}

        <CheckboxFilter
          {...filterProps}
          fieldName="role"
          options={agreementRoleOptions}
          title="Role" />

        <CheckboxFilter
          {...filterProps}
          fieldName="timing"
          options={agreementTimingOptions}
          title="Expiration" />

        <CheckboxFilter
          {...filterProps}
          fieldName="permission"
          options={agreementPermissions}
          title="Permission" />
      </>
    );
  }

  if (assetType === 'asteroids' || assetType === 'asteroidsMapped') {
    return (
      <>
        <OwnershipFilter {...filterProps} />

        <SurfaceAreaFilter {...filterProps} {...surfaceAreaConfig} />

        <CheckboxFilter
          {...filterProps}
          defaultColorMap={spectralTypeColors}
          fieldName="spectralType"
          highlightFieldName="spectralType"
          options={spectralTypeOptions}
          title="Spectral Type" />

        <CheckboxFilter
          {...filterProps}
          defaultColorMap={scanStatusColors}
          fieldName="scanStatus"
          highlightFieldName="scanStatus"
          options={scanStatusOptions}
          title="Scanning Status" />

        <RangeFilter
          {...filterProps}
          {...axisConfig}
          highlightFieldName="axis"
          step={0.1}
          title="Semi-major Axis" />

        <RangeFilter
          {...filterProps}
          {...inclinationConfig}
          highlightFieldName="inclination"
          step={0.01}
          title="Orbit Inclination"
          {...inclinationConfig} />

        <RangeFilter
          {...filterProps}
          {...eccConfig}
          highlightFieldName="eccentricity"
          step={0.001}
          title="Orbit Eccentricity" />

        <AsteroidNameFilter {...filterProps} />
      </>
    );
  }
  if (assetType === 'buildings') {
    return (
      <>
        <TextFilter
          {...filterProps}
          fieldName="asteroid"
          isId
          placeholder="Filter by Asteroid Id..."
          title="Asteroid" />

        <TextFilter
          {...filterProps}
          fieldName="name"
          placeholder="Filter by Name..."
          title="Building Name" />

        <CheckboxFilter
          {...filterProps}
          fieldName="type"
          options={buildingTypeOptions}
          title="Type" />

        <BuildingAccessFilter {...filterProps} />
      </>
    );
  }
  if (assetType === 'coresamples') {
    return (
      <>
        <TextFilter
          {...filterProps}
          fieldName="asteroid"
          isId
          placeholder="Filter by Asteroid Id..."
          title="Asteroid" />

        <CheckboxFilter
          {...filterProps}
          fieldName="resource"
          options={resourceTypeOptions}
          title="Resource Type" />

        <RangeFilter
          {...filterProps}
          {...yieldConfig}
          title="Yield" />
      </>
    );
  }
  if (assetType === 'crews') {
    return (
      <>
        <CrewOwnershipFilter {...filterProps} />

        <TextFilter
          {...filterProps}
          fieldName="name"
          title="Name" />
      </>
    )
  }
  if (assetType === 'crewmates') {
    return (
      <>
        <TextFilter
          {...filterProps}
          fieldName="name"
          title="Name" />

        <TextFilter
          {...filterProps}
          fieldName="crew"
          isId
          placeholder="Filter by Crew Id..."
          title="Crew" />

        <CheckboxFilter
          {...filterProps}
          fieldName="class"
          options={crewmateClassOptions}
          title="Class" />

        <CheckboxFilter
          {...filterProps}
          fieldName="collection"
          options={crewmateCollectionOptions}
          title="Collection" />
      </>
    )
  }
  if (assetType === 'lotsMapped') {
    return (
      <>
        <LotIdFilter {...filterProps} />

        <BuildingNameFilter {...filterProps} />

        <CheckboxFilter
          {...filterProps}
          defaultColorMap={buildingCategoryColors}
          fieldName="category"
          highlightFieldName="category"
          options={lotSearchBuildingCategoryOptions}
          title="Building Categories" />

        <LotOccupiedFilter {...filterProps} />

        <LotLeaseFilter {...filterProps} />

        <BooleanFilter
          {...filterProps}
          title="Crew"
          fieldName="hasCrew"
          label="Stationed Crew" />

        <BooleanFilter
          {...filterProps}
          title={prospectingOnchain() ? "Claims" : "Core Samples"}
          fieldName="hasCoresForSale"
          label={prospectingOnchain() ? "Claims for Sale" : "Core Samples for Sale"} />
      </>
    );
  }
  if (assetType === 'lots') {
    return (
      <>
        <TextFilter
          {...filterProps}
          fieldName="asteroid"
          isId
          placeholder="Filter by Asteroid Id..."
          title="Asteroid" />

        <TextFilter
          {...filterProps}
          fieldName="controller"
          isId
          placeholder="Filter by Controlling Crew Id..."
          title="Controller" />

        <TextFilter
          {...filterProps}
          fieldName="occupier"
          isId
          placeholder="Filter by Occupying Crew Id..."
          title="Occupier" />

        <CheckboxFilter
          {...filterProps}
          fieldName="building"
          options={lotSearchBuildingTypeOptions}
          title="Buildings" />

        <CheckboxFilter
          {...filterProps}
          fieldName="construction"
          options={constructionStatusOptions}
          title="Construction Status" />
      </>
    );
  }
  if (assetType === 'ships') {
    return (
      <>
        <TextFilter
          {...filterProps}
          fieldName="asteroid"
          isId
          placeholder="Filter by Asteroid Id..."
          title="Asteroid" />

        <TextFilter
          {...filterProps}
          fieldName="name"
          placeholder="Filter by Name..."
          title="Ship Name" />

        <CheckboxFilter
          {...filterProps}
          fieldName="type"
          options={shipTypeOptions}
          title="Type" />

        <CheckboxFilter
          {...filterProps}
          fieldName="variant"
          options={shipVariantOptions}
          title="Variant" />
      </>
    );
  }
  if (assetType === 'actionitems') {
    return (
      <>
        <TextFilter
          {...filterProps}
          fieldName="asteroid"
          isId
          placeholder="Filter by Asteroid Id..."
          title="Asteroid" />

        <CheckboxFilter
          {...filterProps}
          fieldName="status"
          options={actionItemStatusOptions}
          title="Status" />
      </>
    )
  }
  return null;
};

export default SearchFilters;