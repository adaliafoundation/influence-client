import styled from 'styled-components';
import { Building, Process, Product, StarterMission } from '@influenceth/sdk';

import ResourceThumbnail, { ResourceImage, ResourceThumbnailWrapper } from '~/components/ResourceThumbnail';
import { getBuildingSpriteStyle, SPRITE_ATLAS_GROUPS, useSpriteAtlases } from '~/lib/spriteUtils';
import { Eyebrow, Muted } from './MissionStyles';

const Assets = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin-top: 14px;
  & > section { min-width: 0; }
`;
const Tiles = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
`;
const Tile = styled.figure`
  margin: 0;
  width: 76px;
  & figcaption {
    color: #a4afb8;
    font-size: 12px;
    line-height: 1.4;
    margin-top: 6px;
    overflow-wrap: anywhere;
  }
`;
export const RouteSelect = styled.select`
  width: 100%;
  background: #101920;
  border: 1px solid #34434f;
  color: white;
  padding: 8px;
  margin-top: 12px;
  font: inherit;
  font-size: 12px;
`;

const Materials = ({ title, productIds }) => (
  <section>
    <Eyebrow>{title}</Eyebrow>
    <Tiles>{productIds.map(id => (
      <Tile key={id}>
        <ResourceThumbnail resource={Product.TYPES[id]} size="64px" tooltipContainer={null} role="img" aria-label={Product.TYPES[id].name} />
        <figcaption>{Product.TYPES[id].name}</figcaption>
      </Tile>
    ))}</Tiles>
  </section>
);

const MissionObjectiveAssets = ({ mission, objectiveIndex, routeId }) => {
  useSpriteAtlases(SPRITE_ATLAS_GROUPS.buildings);
  const route = StarterMission.ROUTE_TYPES[routeId];
  const isProductionLoop = mission.id === StarterMission.IDS.CLOSE_THE_PRODUCTION_LOOP;
  const requirements = mission.requirements;
  const processorMissions = Object.values(StarterMission.TYPES).filter(m => m.requirements.processorType);
  const stages = isProductionLoop ? [Process.TYPES[route.stage1ProcessId], Process.TYPES[route.stage2ProcessId]] : [];
  const stage = stages[objectiveIndex];
  const buildingTypes = isProductionLoop
    ? stage ? [processorMissions.find(m => m.requirements.processorType === stage.processorType).requirements.buildingType] : []
    : objectiveIndex === 0 && requirements.buildingType ? [requirements.buildingType] : [];
  const exampleProcess = requirements.processorType
    ? Object.values(Process.TYPES).find(p => p.processorType === requirements.processorType)
    : null;
  const rawRequirements = StarterMission.TYPES[StarterMission.IDS.BEGIN_EXTRACTION].requirements;
  const rawExamples = Object.values(Product.TYPES)
    .filter(p => p.i >= rawRequirements.rawProductIdMin && p.i <= rawRequirements.rawProductIdMax)
    .slice(0, 3).map(p => p.i);
  const showMaterials = mission.id === StarterMission.IDS.PROSPECT_THE_SURFACE || objectiveIndex === 1;
  if (mission.id === StarterMission.IDS.MAKE_LANDFALL && objectiveIndex > 0) return null;

  return (
    <Assets aria-label="Buildings and materials">
      {!!buildingTypes.length && <section>
        <Eyebrow>{isProductionLoop ? 'Route buildings' : 'Buildings'}</Eyebrow>
        <Tiles>{buildingTypes.map(type => (
          <Tile key={type}>
            <ResourceThumbnailWrapper size="76px" role="img" aria-label={Building.TYPES[type].name}>
              <ResourceImage style={getBuildingSpriteStyle(type) || undefined} />
            </ResourceThumbnailWrapper>
            <figcaption>{Building.TYPES[type].name}</figcaption>
          </Tile>
        ))}</Tiles>
      </section>}
      {isProductionLoop ? <>
        {stage && <Materials title="Inputs" productIds={Object.keys(stage.inputs)} />}
        <Materials title={objectiveIndex === 0 ? 'Intermediate' : 'Final outputs'}
          productIds={objectiveIndex === 0 ? [route.intermediateProductId] : Object.keys(stages[1].outputs)} />
      </> : showMaterials && (exampleProcess ? <>
        <Materials title="Example outputs" productIds={Object.keys(exampleProcess.outputs)} />
        <Muted style={{ fontSize: 12 }}>{exampleProcess.name}. Any supported process qualifies.</Muted>
      </> : mission.id !== StarterMission.IDS.MAKE_LANDFALL && <>
        <Materials title="Example materials" productIds={rawExamples} />
        <Muted style={{ fontSize: 12 }}>{mission.id === StarterMission.IDS.ESTABLISH_STORAGE
          ? 'Receive qualifying goods of your choice.'
          : 'Choose any raw resource that meets the objective.'}</Muted>
      </>)}
    </Assets>
  );
};

export default MissionObjectiveAssets;
