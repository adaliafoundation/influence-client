import { useMemo } from 'react';
import styled from 'styled-components';
import { Entity } from '@influenceth/sdk';

import useLot from '~/hooks/useLot';
import useShip from '~/hooks/useShip';
import useStore from '~/hooks/useStore';
import { HudMenuCollapsibleSection, Scrollable } from './components/components';
import EntityNameForm from './components/EntityNameForm';
import ShipTitleArea from './components/ShipTitleArea';
import PolicyPanels from './components/PolicyPanels';
import CrewIndicator from '~/components/CrewIndicator';
import useCrew from '~/hooks/useCrew';
import ListForSalePanel from './components/ListForSalePanel';
import EntityDescriptionForm from './components/EntityDescriptionForm';
import useCrewContext from '~/hooks/useCrewContext';
import SwitchToAdministratingCrew from './components/SwitchToAdministratingCrew';

const AdminShip = ({}) => {
  const lotId = useStore(s => s.asteroids.lot);
  const zoomScene = useStore(s => s.asteroids.zoomScene);
  const { crew } = useCrewContext();

  const zoomShipId = zoomScene?.type === 'SHIP' ? zoomScene.shipId : null;
  const { data: zoomShip } = useShip(zoomShipId);
  const { data: lot } = useLot(lotId);

  const ship = useMemo(() => zoomShipId ? zoomShip : lot?.surfaceShip, [lot, zoomShip, zoomShipId]);
  const { data: controller } = useCrew(ship?.Control?.controller?.id);

  return (
    <>
      <Scrollable>
        <ShipTitleArea ship={ship} />

        {crew?.id !== ship?.Control?.controller?.id && (
          <SwitchToAdministratingCrew entity={ship} />
        )}

        {crew?.id && crew.id === ship?.Control?.controller?.id && (
          <>
            <HudMenuCollapsibleSection titleText="Update Name" collapsed>
              <EntityNameForm
                entity={ship ? { id: ship.id, label: Entity.IDS.SHIP } : null}
                originalName={ship?.Name?.name}
                label="Ship Name" />
            </HudMenuCollapsibleSection>

            <HudMenuCollapsibleSection titleText="Update Description" collapsed>
              <EntityDescriptionForm
                entity={ship ? { id: ship.id, label: Entity.IDS.SHIP } : null}
                originalDesc={``}
                label="Ship Description" />
            </HudMenuCollapsibleSection>

            <HudMenuCollapsibleSection titleText="Update Permissions" collapsed>
              <PolicyPanels editable entity={ship} />
            </HudMenuCollapsibleSection>

            <HudMenuCollapsibleSection titleText="Ship Settings" collapsed>
              <CrewIndicator crew={controller} label="Flight Crew" />
              <div style={{ height: 15 }} />
              <ListForSalePanel
                entity={ship}
                forSaleWarning="Note: Control of the ship's manifest and inventories will transfer with any sale." />
            </HudMenuCollapsibleSection>
          </>
        )}

      </Scrollable>
    </>
  );
};

export default AdminShip;
