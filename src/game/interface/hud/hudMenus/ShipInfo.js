import styled from 'styled-components';
import { Ship } from '@influenceth/sdk';

import useDescriptionAnnotation from '~/hooks/useDescriptionAnnotation';
import useStore from '~/hooks/useStore';
import useShip from '~/hooks/useShip';
import { HudMenuCollapsibleSection, Scrollable } from './components/components';
import ShipTitleArea from './components/ShipTitleArea';
import PolicyPanels from './components/PolicyPanels';
import useIpfsContent from '~/hooks/useIpfsContent';
import { reactPreline } from '~/lib/utils';

const Description = styled.div`
  color: ${p => p.theme.colors.main};
  font-size: 14px;
  line-height: 20px;

  max-height: 272px;
  overflow: hidden auto;
  word-break: break-word;
`;

const ShipInfo = () => {
  const zoomScene = useStore(s => s.asteroids.zoomScene);

  const { data: ship } = useShip(zoomScene?.type === 'SHIP' ? zoomScene?.shipId : null);
  const { data: annotation, isLoading: isAnnotationLoading } = useDescriptionAnnotation(ship);
  const { data: description, isLoading: isContentLoading } = useIpfsContent(annotation?.ipfs?.hash);

  if (!ship || isAnnotationLoading || isContentLoading) return null;
  return (
    <>
      <Scrollable hasTray>
        <ShipTitleArea ship={ship} />

        {description && (
          <HudMenuCollapsibleSection titleText="Description">
            <Description>
              {reactPreline(description)}
            </Description>
          </HudMenuCollapsibleSection>
        )}

        <HudMenuCollapsibleSection titleText="Type Description" collapsed={!!description}>
          <Description>
            {Ship.TYPES[ship.Ship.shipType]?.description}
          </Description>
        </HudMenuCollapsibleSection>

        <HudMenuCollapsibleSection titleText="Ship Permissions" collapsed>
          <PolicyPanels entity={ship} />
        </HudMenuCollapsibleSection>

      </Scrollable>
    </>
  );
};

export default ShipInfo;