import { useCallback, useMemo } from 'react';
import styled from 'styled-components';
import { Building, Entity } from '@influenceth/sdk'

import { getStoryImageUrl } from '~/lib/assetUtils';
import { getBuildingSpriteStyle, SPRITE_ATLAS_GROUPS, useSpriteAtlases } from '~/lib/spriteUtils';
import ChoicesDialog from './ChoicesDialog';
import { ResourceImage } from './ResourceThumbnail';
import ClipCorner from './ClipCorner';
import useBuilding from '~/hooks/useBuilding';
import formatters from '~/lib/formatters';
import useAsteroid from '~/hooks/useAsteroid';

const coverImage = getStoryImageUrl('influence/production/images/stories/adalian-recruitment/3.jpg', { w: 1500 });

const BuildingThumbnailWrapper = styled.div`
  border: 1px solid #333;
  ${p => p.theme.clipCorner(10)};
  color: #333;
  position: relative;
  height: 140px;
  width: 225px;
`;

const Flourish = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  & h3 {
    border-bottom: 1px solid #333;
    color: #999;
    font-size: 16px;
    font-weight: normal;
    margin: 0 0 10px;
    padding-bottom: 5px;
    text-transform: uppercase;
  }
`;
const HabCard = styled.div`
  background: rgba(${p => p.theme.colors.mainRGB}, 0.2);
  ${p => p.theme.clipCorner(10)};
  flex: 1;
  padding: 15px;

  & > div:last-child {
    margin-top: 15px;
    div {
      color: white;
      font-size: 110%;
      margin-bottom: 4px;
    }
    label {
      color: #777;
      span {
        color: white;
        font-weight: normal;
      }
    }
  }
`;

// TODO: remove this in favor of new sdk location functions
const fromEntityFormat = (loc) => {
  if (!loc) return null;

  // ship -> building -> lot -> asteroid
  if (loc.label === Entity.IDS.SHIP) {
    return { shipId: loc.id };

  } else if (loc.label === Entity.IDS.BUILDING) {
    return { buildingId: loc.id };

  } else if (loc.label === Entity.IDS.LOT) {
    const split = 2 ** 32;
    return {
      asteroidId: loc.id % split,
      lotId: Math.round(loc.id / split)
    };

  } else if (loc.label === Entity.IDS.ASTEROID) {
    return { asteroidId: loc.id };
  }

  throw `Invalid location label: "${loc.label}" (${typeof loc.label})`;
};

// TODO: this dialog may now be deprecated
const SelectHabitatDialog = ({ onAccept, onReject }) => {
  useSpriteAtlases(SPRITE_ATLAS_GROUPS.buildings);

  const randomAssignment = 1;// TODO: should not be hardcoded
  const { data: habitat } = useBuilding(randomAssignment);
  const habitatLocation = useMemo(() => fromEntityFormat(habitat?.Location?.location), [habitat])
  const { data: asteroid } = useAsteroid(habitatLocation?.asteroidId);

  const onSelectHabitat = useCallback((choice) => () => {
    if (choice.id === 1) return onAccept(randomAssignment);
    return onReject();
  }, [randomAssignment]);

  return (
    <ChoicesDialog
      dialogTitle="Crewmate Creation"
      onCloseDestination={'/'/* TODO: */}
      coverImage={coverImage}
      coverImageCenter="35% 75%"
      content="All new crewmates begin their lives at a Habitat, a purpose-made life support structure from where they may venture out to perform tasks."
      choices={[
        { id: 1, text: 'Pick for me. Automatically select one of the starting Habitats on Adalia Prime; a reasonable starting location for new Adalians.' },
        { id: null, text: <>Pick for myself. Search the current asteroid for potential starting Habitats built by others. NOTE: Once you've found a suitable Habitat, select the <b>Recruit Crewmate</b> option to continue.</> },
      ]}
      onSelect={onSelectHabitat}
      prompt="Where would you like to create this crewmate?"
      flourish={(
        <Flourish>
          <h3>Starting Location</h3>
          <HabCard>
            <BuildingThumbnailWrapper>
              <ResourceImage style={getBuildingSpriteStyle(Building.IDS.HABITAT) || undefined} />
              <ClipCorner dimension={10} />
            </BuildingThumbnailWrapper>
            <div>
              <div>{formatters.buildingName(habitat)}</div>
              {asteroid && (
                <label>
                  {asteroid?.Name?.name} &gt; <span>{formatters.lotName(habitatLocation.lotId)}</span>
                </label>
              )}
            </div>
          </HabCard>
        </Flourish>
      )}
      title="Crew Starting Habitat"
    />
  );
};

export default SelectHabitatDialog;
