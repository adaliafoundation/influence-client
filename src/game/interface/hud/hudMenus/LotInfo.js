import { SurfaceTransferIcon } from '~/components/Icons';
import ResourceRequirement from '~/components/ResourceRequirement';
import { getBuildingRequirements } from '../actionDialogs/components';
import useDeliveryManager from '~/hooks/actionManagers/useDeliveryManager';

import { useMemo } from 'react';
import styled from 'styled-components';
import { Building, Ship, Product } from '@influenceth/sdk';
import moment from 'moment';

import useStore from '~/hooks/useStore';
import useLot from '~/hooks/useLot';
import { reactBool, reactPreline } from '~/lib/utils';
import CrewIndicator from '~/components/CrewIndicator';
import { HudMenuCollapsibleSection, Scrollable } from './components/components';
import LotTitleArea from './components/LotTitleArea';
import PolicyPanels from './components/PolicyPanels';
import useCrew from '~/hooks/useCrew';
import useDescriptionAnnotation from '~/hooks/useDescriptionAnnotation';
import useIpfsContent from '~/hooks/useIpfsContent';

const Description = styled.div`
  color: ${p => p.theme.colors.main};
  font-size: 14px;
  line-height: 20px;
  max-height: 272px;
  overflow: hidden auto;
  word-break: break-word;
`;

const Requirements = styled.div`
  label {
    color: ${p => p.theme.colors.secondaryText};
    display: block;
    font-size: 14px;
    margin-bottom: 8px;
  }
`;

const ItemsList = styled.div`
  display: flex;
  flex-wrap: wrap;
  & > div {
    flex-shrink: 0;
    margin-right: 6px;
    margin-bottom: 4px;
    &:last-child {
      margin-right: 0;
    }
  }
`;

const ConstructionMaterialsGrid = ({ building }) => {
  const items = useMemo(() => {
    return getBuildingRequirements(building).map((item) => ({
      i: Number(item.i), 
      numerator: item.totalRequired,
    }));
  }, [building]);

  return (
    <>
      <Requirements>
        <label>Building Materials</label>
        <ItemsList>
          {items.map((item) => (
            <ResourceRequirement
              key={item.i}
              noStyles
              item={item}
              resource={Product.TYPES[item.i]}
              size="75px"
              tooltipContainer="hudMenuTooltip" />
          ))}
        </ItemsList>
      </Requirements>
    </>
  );
};

const LotInfo = () => {
  const lotId = useStore(s => s.asteroids.lot);
  const { data: lot } = useLot(lotId);
  const { data: annotation, isLoading: isAnnotationLoading } = useDescriptionAnnotation(lot?.building || lot?.surfaceShip);
  const { data: description, isLoading: isContentLoading } = useIpfsContent(annotation?.ipfs?.hash);
  const { data: controller } = useCrew(lot?.building?.Control?.controller?.id);

  const gracePeriodPretty = useMemo(() => {
    return moment(Date.now() - Building.GRACE_PERIOD * 1e3).fromNow(true)
  }, []);

  const siteOrBuilding = (lot?.building?.Building?.status === Building.CONSTRUCTION_STATUSES.OPERATIONAL ? 'Building' : 'Site');

  if (!lot || isAnnotationLoading || isContentLoading) return null;
  return (
    <>
      <Scrollable hasTray={reactBool(false)}>
        <LotTitleArea lot={lot} />

        {description && (
          <HudMenuCollapsibleSection titleText="Description">
            <Description>
              {reactPreline(description)}
            </Description>
          </HudMenuCollapsibleSection>
        )}

        {lot?.building && (
          <>
            <HudMenuCollapsibleSection
              titleText={`${description ? 'Type ' : ''}Description`}
              collapsed={!!description}>
              <Description>
                {lot.building.Building?.status === Building.CONSTRUCTION_STATUSES.OPERATIONAL
                  ? Building.TYPES[lot.building.Building.buildingType].description
                  : `
                    Construction sites are used to reserve a lot and stage materials there
                    prior to building construction. They have a limited reservation period
                    of ${gracePeriodPretty}, after which any materials already sent to the site
                    become public.
                  `}
              </Description>
            </HudMenuCollapsibleSection>

            <HudMenuCollapsibleSection titleText="Construction" collapsed>
              <ConstructionMaterialsGrid building={lot.building} />
            </HudMenuCollapsibleSection>

            <HudMenuCollapsibleSection titleText={`${siteOrBuilding} Permissions`} collapsed>
              <div style={{ marginBottom: 10 }}>
                <CrewIndicator crew={controller} label={`${siteOrBuilding} Administrator`} />
              </div>
              <PolicyPanels entity={lot.building} />
            </HudMenuCollapsibleSection>
          </>
        )}

        {!lot?.building && lot?.surfaceShip && (
          <>
            <HudMenuCollapsibleSection titleText="Landed Ship Description" collapsed={!!description}>
              <Description>
                {Ship.TYPES[lot.surfaceShip.Ship.shipType]?.description}
              </Description>
            </HudMenuCollapsibleSection>

            <HudMenuCollapsibleSection titleText="Landed Ship Permissions" collapsed>
              <PolicyPanels entity={lot?.surfaceShip} />
            </HudMenuCollapsibleSection>
          </>
        )}

        <HudMenuCollapsibleSection titleText="Lot Permissions" collapsed>
          <PolicyPanels entity={lot} />
        </HudMenuCollapsibleSection>

      </Scrollable>
    
    </>
  );
};

export default LotInfo;
