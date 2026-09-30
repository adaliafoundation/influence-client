import { useEffect, useMemo } from 'react';
import styled from 'styled-components';
import { Building, Inventory } from '@influenceth/sdk';

import {
  UnplanBuildingIcon,
  WarningOutlineIcon
} from '~/components/Icons';
import useCrewContext from '~/hooks/useCrewContext';
import useConstructionManager from '~/hooks/actionManagers/useConstructionManager';

import {
  ActionDialogFooter,
  ActionDialogHeader,
  ActionDialogBody,
  FlexSection,
  FlexSectionInputBlock,
  BuildingImage,
  FlexSectionSpacer,
} from './components';
import { ActionDialogInner, useAsteroidAndLot } from '../ActionDialog';
import actionStage from '~/lib/actionStages';
import { reactBool } from '~/lib/utils';

const UnplanWarning = styled.div`
  align-items: center;
  color: ${p => p.theme.colors.error};
  display: flex;
  flex: 1;
  height: 100%;
  justify-content: flex-end;
  & span:last-child {
    font-size: 175%;
    line-height: 1em;
    margin-left: 8px;
  }
`;

const UnplanBuilding = ({ asteroid, lot, constructionManager, stage, ...props }) => {
  const { currentConstructionAction, unplanConstruction } = useConstructionManager(lot?.id);
  const { crew } = useCrewContext();

  const siteEmpty = useMemo(() => {
    const inv = (lot?.building?.Inventories || []).find((i) => Inventory.TYPES[i.inventoryType].category === Inventory.CATEGORIES.SITE);
    return ((inv?.mass + inv?.reservedMass) === 0);
  }, [lot?.building]);

  const buildingType = currentConstructionAction?.buildingType || 0;

  return (
    <>
      <ActionDialogHeader
        action={{
          icon: <UnplanBuildingIcon />,
          label: 'Remove Building Site',
          status: stage === actionStage.NOT_STARTED ? 'Confirm' : '',
        }}
        actionCrew={crew}
        location={{ asteroid, lot }}
        onClose={props.onClose}
        stage={stage} />

      <ActionDialogBody style={{ paddingBottom: 15 }}>
        <FlexSection>
          <FlexSectionInputBlock
            title="Current Plans"
            image={<BuildingImage buildingType={buildingType} unfinished />}
            label={Building.TYPES[buildingType].name}
            disabled
            sublabel="Site Plans"
          />
          {!siteEmpty && (
            <>
              <FlexSectionSpacer />
              <FlexSectionInputBlock bodyStyle={{ background: 'transparent' }}>
                <UnplanWarning>
                  <span>On-site materials<br/>must be removed</span>
                  <span><WarningOutlineIcon /></span>
                </UnplanWarning>
              </FlexSectionInputBlock>
            </>
          )}
        </FlexSection>
      </ActionDialogBody>

      <ActionDialogFooter
        disabled={!siteEmpty}
        goLabel="Remove Site"
        onGo={unplanConstruction}
        stage={stage}
        {...props} />
    </>
  );
};

const Wrapper = (props) => {
  const { asteroid, lot, isLoading } = useAsteroidAndLot(props);
  const constructionManager = useConstructionManager(lot?.id);
  const { stageByActivity } = constructionManager;

  useEffect(() => {
    if (!asteroid || !lot) {
      if (!isLoading) {
        if (props.onClose) props.onClose();
      }
    }
  }, [asteroid, lot, isLoading]);

  return (
    <ActionDialogInner
      actionImage="ConstructionPlan"
      isLoading={reactBool(isLoading)}
      stage={stageByActivity.unplan}>
      <UnplanBuilding
        asteroid={asteroid}
        lot={lot}
        constructionManager={constructionManager}
        stage={stageByActivity.unplan}
        {...props} />
    </ActionDialogInner>
  )
};

export default Wrapper;
