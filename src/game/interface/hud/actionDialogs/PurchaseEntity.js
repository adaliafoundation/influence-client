import { useEffect, useMemo } from 'react';
import styled from 'styled-components';
import { Entity, Ship } from '@influenceth/sdk';

import { PurchaseEntityIcon, SwayIcon } from '~/components/Icons';
import useCrewContext from '~/hooks/useCrewContext';

import {
  ActionDialogFooter,
  ActionDialogHeader,
  ActionDialogBody,
  FlexSection,
  FlexSectionInputBlock,
  FlexSectionSpacer,
  MarketplaceAlert,
  ShipInputBlock,
} from './components';
import { ActionDialogInner } from '../ActionDialog';
import actionStages from '~/lib/actionStages';
import { locationsArrToObj, reactBool } from '~/lib/utils';
import useNftSaleManager from '~/hooks/actionManagers/useNftSaleManager';
import CrewIndicator from '~/components/CrewIndicator';
import useEntity from '~/hooks/useEntity';
import useCrew from '~/hooks/useCrew';
import formatters from '~/lib/formatters';
import { useSwayBalance } from '~/hooks/useWalletTokenBalance';
import useAsteroid from '~/hooks/useAsteroid';

const Note = styled.div`
  color: ${p => p.theme.colors.main};
  padding: 15px 30px 0;
  text-align: center;
`;

const PurchaseEntity = ({ asteroid, lot, entity, actionManager, stage, ...props }) => {
  const { purchaseListing } = actionManager;
  const { crew } = useCrewContext();
  const { data: controller } = useCrew(entity?.Control?.controller?.id);
  const { data: swayBalance } = useSwayBalance();

  const insufficientSway = useMemo(() => {
    return entity?.Nft?.price > swayBalance;
  }, [entity, swayBalance]);

  return (
    <>
      <ActionDialogHeader
        action={{
          icon: <PurchaseEntityIcon />,
          label: 'Buy Ship',
          status: stage === actionStages.NOT_STARTED ? 'Purchase Agreement' : '',
        }}
        actionCrew={crew}
        location={{ asteroid, lot, ship: entity }}
        onClose={props.onClose}
        stage={stage} />

      <ActionDialogBody style={{ paddingBottom: 15 }}>
        <FlexSection>
          <ShipInputBlock title="Ship" ship={entity} />

          <FlexSectionSpacer />

          <FlexSectionInputBlock bodyStyle={{ background: 'transparent' }}>
            <CrewIndicator crew={controller} />

          </FlexSectionInputBlock>
        </FlexSection>

        <FlexSection>
          <MarketplaceAlert scheme={insufficientSway ? 'error' : 'success'}>
            <div>
              <div>
                <label>Buy Ship</label>
                <div>
                  <b>{formatters.shipName(entity)}</b>
                  {entity?.Name?.name && <span>{Ship.TYPES[entity?.Ship?.shipType]?.name} #{entity.id.toLocaleString()}</span>}
                </div>
              </div>
              <div>
                <label>Total</label>
                <span>
                  <SwayIcon />
                  -{(entity?.Nft?.price / 1e6).toLocaleString()}
                </span>
              </div>
            </div>
          </MarketplaceAlert>
        </FlexSection>

        <Note>Note: Control of the ship's manifest and inventories will transfer with any sale.</Note>
      </ActionDialogBody>

      <ActionDialogFooter
        disabled={insufficientSway}
        goLabel="Buy"
        onGo={purchaseListing}
        stage={stage}
        {...props} />
    </>
  );
};

const Wrapper = ({ entity: rawEntity, ...props }) => {
  const { data: entity, isLoading: entityIsLoading } = useEntity(rawEntity);
  const loc = useMemo(() => locationsArrToObj(entity?.Location?.locations || []), [entity]);
  const { data: asteroid, isLoading: asteroidIsLoading } = useAsteroid(loc.asteroidId);
  const { data: lot, isLoading: lotIsLoading } = useEntity({ id: loc.lotId, label: Entity.IDS.LOT });

  const saleManager = useNftSaleManager(entity);
  const stage = saleManager.isPendingPurchase ? actionStages.STARTING : actionStages.NOT_STARTED

  useEffect(() => {
    if (props.onClose) {
      if (!entity && !entityIsLoading) {
        props.onClose();
      }
      if (loc?.asteroidId && !asteroid && !asteroidIsLoading) {
        props.onClose();
      }
      if (loc?.lotId && !lot && !lotIsLoading) {
        props.onClose();
      }
    }
  }, [asteroid, entity, lot, asteroidIsLoading, lotIsLoading, entityIsLoading]);

  return (
    <ActionDialogInner
      actionImage="Agreements"
      isLoading={reactBool(asteroidIsLoading, lotIsLoading, entityIsLoading)}
      stage={stage}>
      <PurchaseEntity
        asteroid={asteroid}
        lot={lot}
        entity={entity}
        actionManager={saleManager}
        stage={stage}
        {...props} />
    </ActionDialogInner>
  )
};

export default Wrapper;
