import { useCallback, useState } from 'react';
import styled from 'styled-components';
import { Entity } from '@influenceth/sdk';

import MarketplaceLink from '~/components/MarketplaceLink';
import Button from '~/components/ButtonAlt';
import CrewIndicator from '~/components/CrewIndicator';
import { LinkIcon } from '~/components/Icons';
import { renderDummyAsteroid } from '~/game/scene/asteroid/helpers/utils';
import useAsteroid from '~/hooks/useAsteroid';
import useCrew from '~/hooks/useCrew';
import useCrewContext from '~/hooks/useCrewContext';
import useStore from '~/hooks/useStore';
import useWebWorker from '~/hooks/useWebWorker';
import constants from '~/lib/constants';
import exportGLTF from '~/lib/graphics/exportGLTF';
import { nativeBool, reactBool } from '~/lib/utils';
import { HudMenuCollapsibleSection, Scrollable } from './components/components';
import EntityNameForm from './components/EntityNameForm';
import AsteroidTitleArea from './components/AsteroidTitleArea';
import EntityDescriptionForm from './components/EntityDescriptionForm';
import PolicyPanels from './components/PolicyPanels';
import SwitchToAdministratingCrew from './components/SwitchToAdministratingCrew';

const AdminActions = styled.div`
  border-bottom: 1px solid #333;
  margin-bottom: 20px;
  padding-bottom: 15px;
`;
const ButtonArea = styled.div`
  & > button {
    margin-bottom: 10px;
    width: 260px;
  }
`;

const AdminAsteroid = ({}) => {
  const asteroidId = useStore(s => s.asteroids.origin);
  const { crew, authorize } = useCrewContext();
  const { data: asteroid } = useAsteroid(asteroidId);
  const { data: controller } = useCrew(asteroid?.Control?.controller?.id);
  const webWorkerPool = useWebWorker();

  const [exportingModel, setExportingModel] = useState(false);

  const download3dModel = useCallback(() => {
    if (exportingModel || !asteroid) return;
    setExportingModel(true);
    renderDummyAsteroid(asteroid, constants.MODEL_EXPORT_RESOLUTION, webWorkerPool, (asteroidModel, dispose) => {
      exportGLTF(asteroidModel, `asteroid_${asteroid.id}`, () => {
        try {
          dispose();
        } catch (e) { console.warn(e); }
        setExportingModel(false);
      });
    });
  }, [asteroid, exportingModel, webWorkerPool]);

  const authorization = authorize('controls', [crew, asteroid], [crew, asteroid]);

  return (
    <>
      <Scrollable>
        <AsteroidTitleArea asteroid={asteroid} />

        {authorization.status === 'denied' && (
          <SwitchToAdministratingCrew entity={asteroid} />
        )}

        {asteroid && authorization.status !== 'denied' && (
          <fieldset disabled={authorization.status !== 'allowed'} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
            <HudMenuCollapsibleSection titleText="Update Name" collapsed>
              <EntityNameForm
                entity={asteroid ? { id: asteroid.id, label: Entity.IDS.ASTEROID } : null}
                originalName={asteroid?.Name?.name}
                label="Asteroid Name" />
            </HudMenuCollapsibleSection>

            <HudMenuCollapsibleSection titleText="Update Description" collapsed>
              <EntityDescriptionForm
                entity={asteroid ? { id: asteroid.id, label: Entity.IDS.ASTEROID } : null}
                originalDesc={``}
                label="Asteroid Description" />
            </HudMenuCollapsibleSection>

            <HudMenuCollapsibleSection titleText="Update Lot Policy" collapsed>
              <PolicyPanels editable entity={asteroid} />
            </HudMenuCollapsibleSection>

            <HudMenuCollapsibleSection titleText="Admin Actions" collapsed>
              <AdminActions>
                <CrewIndicator crew={controller} label="Administrator" />
              </AdminActions>

              <ButtonArea>
                <MarketplaceLink
                  chain={asteroid?.Nft?.chain}
                  assetType="asteroid"
                  id={asteroid?.id}>
                  {(onClick, setRefEl) => (
                    <Button setRef={setRefEl} onClick={onClick}><LinkIcon /> <span>List for Sale</span></Button>
                  )}
                </MarketplaceLink>

                <Button
                  disabled={nativeBool(exportingModel)}
                  loading={reactBool(exportingModel)}
                  onClick={download3dModel}>
                  Download 3D Model
                </Button>
              </ButtonArea>
            </HudMenuCollapsibleSection>
          </fieldset>
        )}
      </Scrollable>
    </>
  );
};

export default AdminAsteroid;
