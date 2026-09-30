import { useCallback, useEffect, useMemo } from 'react';
import styled from 'styled-components';
import ResourceScanWarning from './ResourceScanWarning';
import { Asteroid } from '@influenceth/sdk';

import { PlusIcon, ResourceGroupIcons } from '~/components/Icons';
import BonusBar from '~/components/BonusBar';
import useAsteroid from '~/hooks/useAsteroid';
import useAsteroidAbundances from '~/hooks/useAsteroidAbundances';
import useStore from '~/hooks/useStore';
import { keyify } from '~/lib/utils';
import { hexToRGB } from '~/theme';
import { majorBorderColor, Scrollable } from './components';
import { COACHMARK_IDS } from '~/contexts/CoachmarkContext';
import useCoachmarkRefSetter from '~/hooks/useCoachmarkRefSetter';

const ResourceWrapper = styled.div`
  flex: 1;
  overflow: hidden;
`;

const Row = styled.div`
  align-items: center;
  display: flex;
  flex-direction: row;
  font-size: 14px;
  padding: 8px 0;
  & > *:first-child {
    font-size: 24px;
  }
  & > label {
    flex: 1;
    padding-left: 4px;
  }
  & > span {
    color: #999;
    padding-right: 8px;
  }
`;

const Title = styled(Row)`
  border-bottom: 1px solid ${majorBorderColor};
  font-size: 16px;
  padding-top: 0;
  & > label {
    flex: 0 0 auto;
  }
  & > span {
    margin-left: auto;
  }
  & > *:first-child {
    height: 24px;
    width: 24px;
  }
`;

const YieldBonus = styled.div`
  align-items: center;
  color: ${p => p.theme.colors.resources[p.category] || 'white'};
  display: flex;
  flex-shrink: 0;
  font-size: 14px;
  gap: 5px;
  margin-right: 8px;
  white-space: nowrap;
`;

const OverallBonus = styled.div`
  display: flex;
  justify-content: flex-start;
  padding: 8px 0 0 4px;
  & > ${YieldBonus} {
    font-size: 16px;
  }
`;

const BonusSeparator = styled.span`
  color: #999;
  margin: 0 6px;
`;

const Circle = styled.div`
  background: currentColor;
  border-radius: 8px;
  display: inline-block;
  height: 8px;
  margin: 0 8px;
  width: 8px;
`;

const ResourceGroups = styled.div`
  padding-top: 16px;
`;

const ResourceList = styled.div``;
const Resource = styled(Row)`
  cursor: ${p => p.$disabled ? 'default' : p.theme.cursors.active};
  &:hover {
    background: ${p => p.$disabled ? 'transparent' : `rgba(${hexToRGB(p.theme.colors.resources[p.category])}, 0.15)`};
  }
  ${p => p.selected && `
    background: rgba(${hexToRGB(p.theme.colors.resources[p.category])}, 0.3);
    & span {
      color: white !important;
    }
  `}

  & > svg:first-child {
    color: ${p => p.theme.colors.resources[p.category]};
    font-size: 16px;
    margin: 0 4px;
  }
`;

const ResourceGroup = styled.div`
  ${Title} > svg {
    fill: ${p => p.theme.colors.resources[p.category]};
  }
  ${Circle} {
    color: ${p => p.theme.colors.resources[p.category]};
  }
  ${Resource} {
    & span {
      color: ${p => p.theme.colors.resources[p.category]};
    }
  }
  margin-bottom: 20px;
  &:last-child {
    margin-bottom: 0;
  }
`;

const AsteroidResources = ({ onClose }) => {
  const setCoachmarkRef = useCoachmarkRefSetter();

  const asteroidId = useStore(s => s.asteroids.origin);
  const { data: asteroid } = useAsteroid(asteroidId);
  const groupAbundances = useAsteroidAbundances(asteroid, { includeUnscanned: true });
  const scanned = asteroid?.Celestial?.scanStatus === Asteroid.SCAN_STATUSES.RESOURCE_SCANNED;
  const dispatchResourceMapSelect = useStore(s => s.dispatchResourceMapSelect);
  const dispatchResourceMapToggle = useStore(s => s.dispatchResourceMapToggle);
  const resourceMap = useStore(s => s.asteroids.resourceMap);
  const coachmarks = useStore(s => s.coachmarks);

  const onClick = useCallback((i) => () => {
    if (!scanned) return;
    if (resourceMap.active && resourceMap.selected === Number(i)) {
      dispatchResourceMapSelect();
    } else {
      dispatchResourceMapSelect(i);
      dispatchResourceMapToggle(true);
    }
  }, [resourceMap, scanned]);

  // default to most abundant emissive map when panel is opened...
  useEffect(() => {
    if (scanned && !resourceMap.active && groupAbundances.length > 0) {
      if (!resourceMap.selected) {
        dispatchResourceMapSelect(groupAbundances[0].resources[0].id);
      }
      dispatchResourceMapToggle(true);
    }
  }, []);

  const overallBonus = useMemo(() => (
    asteroid && Asteroid.Entity.getBonuses(asteroid).find((bonus) => bonus.type === 'yield' && bonus.level > 0)
  ), [asteroid]);

  return (
    <Scrollable>
      <ResourceWrapper>
        {!scanned && <ResourceScanWarning />}
        {overallBonus && (
          <OverallBonus>
            <YieldBonus>
              <BonusBar bonus={overallBonus.level} />
              <span>Overall Yield + {overallBonus.modifier}%</span>
            </YieldBonus>
          </OverallBonus>
        )}
        <ResourceGroups>
          {groupAbundances.map(({ categoryKey, category, resources, bonus, abundance: groupAbundance }) => (
            <ResourceGroup key={categoryKey} category={categoryKey}>
              <Title>
                {ResourceGroupIcons[keyify(category).toLowerCase()]}
                <label>{category}</label>
                {bonus?.level > 0 && (
                  <YieldBonus category={categoryKey}>
                    <BonusSeparator> - </BonusSeparator>
                    <BonusBar bonus={bonus.level} />
                    <span>Yield + {bonus.modifier}%</span>
                  </YieldBonus>
                )}
                {scanned && <span>{(groupAbundance * 100).toFixed(1)}%</span>}
              </Title>
              <ResourceList>
                {resources.map((resource) => {
                  const coachmarked = Number(resource.i) === coachmarks[COACHMARK_IDS.hudMenuTargetResource];
                  const isSelected = scanned && resourceMap.active && resourceMap.selected === Number(resource.i);
                  return (
                    <Resource
                      key={resource.i}
                      ref={coachmarked ? setCoachmarkRef(COACHMARK_IDS.hudMenuTargetResource) : undefined}
                      category={resource.categoryKey}
                      aria-disabled={!scanned}
                      $disabled={!scanned}
                      onClick={scanned ? onClick(resource.i) : undefined}
                      selected={isSelected}>
                      {isSelected ? <PlusIcon /> : <Circle />}
                      <label>{resource.name}</label>
                      {scanned && <span>{(resource.abundance * 100).toFixed(1)}%</span>}
                    </Resource>
                  );
                })}
              </ResourceList>
            </ResourceGroup>
          ))}
        </ResourceGroups>
      </ResourceWrapper>
    </Scrollable>
  );
};

export default AsteroidResources;
