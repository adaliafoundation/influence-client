import { useMemo } from 'react';
import { Entity, Ship } from '@influenceth/sdk';

import { LocationIcon } from '~/components/Icons';
import formatters from '~/lib/formatters';
import EntityName from '~/components/EntityName';
import TitleArea from '../components/TitleArea';

const ShipTitleArea = ({ ship }) => {
  const locations = useMemo(() => {
    if (!ship?.Location?.locations) return [];
    const asteroidEntity = ship.Location.locations.find((l) => l.label === Entity.IDS.ASTEROID);
    if (asteroidEntity) {
      const topLevel = <EntityName {...asteroidEntity} />;
      const buildingEntityId = ship.Location.locations.find((l) => l.label === Entity.IDS.BUILDING);
      if (buildingEntityId) {
        return [topLevel, <EntityName {...buildingEntityId} />];
      }

      const lotEntityId = ship.Location.locations.find((l) => l.label === Entity.IDS.LOT);
      if (lotEntityId) {
        return [topLevel, <EntityName {...lotEntityId} />];
      }

      return [topLevel, 'In Orbit'];
    } else {
      return ['In Flight'];
    }
  }, [ship?.Location?.locations]);

  return (
    <TitleArea
      background={`Ship_${ship?.Ship?.shipType || Ship.IDS.SHUTTLE}`}
      title={formatters.shipName(ship)}
      subtitle={`${Ship.TYPES[ship?.Ship?.shipType]?.name} #${ship?.id}`}
      upperLeft={(
        <>
          <LocationIcon />
          <span style={{ marginRight: 4, opacity: 0.55 }}>{locations[0]}{locations[1] && ' >'}</span>
          {locations[1]}
        </>
      )}
    />
  );
}

export default ShipTitleArea;