import { useEffect, useMemo } from 'react';
import styled from 'styled-components';
import { Permission } from '@influenceth/sdk';

import { AgreementIcon, PermissionIcon } from '~/components/Icons';
import useCrewContext from '~/hooks/useCrewContext';
import useLotLeaseAuctionManager from '~/hooks/actionManagers/useLotLeaseAuctionManager';
import actionStage from '~/lib/actionStages';
import { formatFixed, reactBool } from '~/lib/utils';
import { getAsteroidAuctionSettings, getLotLeaseAuctionStatus, toSway } from '~/lib/leaseUtils';
import theme, { hexToRGB } from '~/theme';

import { ActionDialogInner, useAsteroidAndLot } from '../ActionDialog';
import {
  ActionDialogBody,
  ActionDialogFooter,
  ActionDialogHeader,
  ActionDialogStats,
  BuildingInputBlock,
  FlexSection,
  FlexSectionInputBlock,
  FlexSectionSpacer
} from './components';

const DescTitle = styled.div`
  align-items: center;
  background: rgba(${p => hexToRGB(p.theme.colors.orange)}, 0.5);
  color: white;
  display: flex;
  font-size: 21px;
  padding: 8px;
  & svg {
    font-size: 26px;
    margin-right: 6px;
  }
`;

const Desc = styled.div`
  color: ${p => p.theme.colors.main};
  font-size: 90%;
  padding: 10px;
  & > b {
    color: white;
    font-weight: normal;
  }
`;

const StartLotLeaseAuction = ({ asteroid, lot, actionManager, stage, ...props }) => {
  const { startAuction } = actionManager;
  const { crew } = useCrewContext();

  const auctionDetails = useMemo(() => {
    const settings = getAsteroidAuctionSettings(asteroid);
    return {
      gracePeriodDays: settings.gracePeriod / 86400,
      auctionDays: Permission.AUCTION_DESCENDING_PERIOD / 86400,
      startPrice: toSway(Permission.getAuctionPriceAtStep(0)),
      endPrice: toSway(Permission.getAuctionPriceAtStep(Permission.AUCTION_STEPS - 1)),
    };
  }, [asteroid]);

  const stats = useMemo(() => ([
    {
      label: 'Grace Period',
      value: `${formatFixed(auctionDetails.gracePeriodDays, 2)} days`,
      direction: 0
    },
    {
      label: 'Auction Duration',
      value: `${formatFixed(auctionDetails.auctionDays, 0)} days`,
      direction: 0
    },
    {
      label: 'Starting Price',
      value: `${formatFixed(auctionDetails.startPrice, 2)} SWAY`,
      direction: 0
    },
    {
      label: 'Ending Price',
      value: `${formatFixed(auctionDetails.endPrice, 2)} SWAY`,
      direction: 0
    },
  ]), [auctionDetails]);

  return (
    <>
      <ActionDialogHeader
        action={{
          icon: <AgreementIcon />,
          label: 'Start Lease Auction',
          status: stage === actionStage.NOT_STARTED ? 'Owner Action' : undefined,
        }}
        overrideColor={stage === actionStage.NOT_STARTED ? theme.colors.orange : undefined}
        actionCrew={crew}
        location={{ asteroid, lot }}
        onClose={props.onClose}
        stage={stage} />

      <ActionDialogBody>
        <FlexSection>
          <BuildingInputBlock
            title="Location"
            building={lot?.building}
          />

          <FlexSectionSpacer />

          <FlexSectionInputBlock title="Details">
            <DescTitle>
              <PermissionIcon />
              <span>Start an auction</span>
            </DescTitle>
            <Desc>
              You have <b>asteroid control</b> and may start a repossession auction.
            </Desc>
          </FlexSectionInputBlock>
        </FlexSection>

        <ActionDialogStats
          stage={stage}
          stats={stats}
        />

        {stats?.length > 0 ? null : <div style={{ height: 20 }} />}
      </ActionDialogBody>

      <ActionDialogFooter
        goLabel="Start Auction"
        onGo={startAuction}
        stage={stage}
        waitForCrewReady
        {...props} />
    </>
  );
};

const Wrapper = (props) => {
  const { asteroid, lot, isLoading } = useAsteroidAndLot(props);
  const auctionManager = useLotLeaseAuctionManager(lot?.id);
  const { actionStage } = auctionManager;

  useEffect(() => {
    if (!asteroid || !lot) {
      if (!isLoading) {
        if (props.onClose) props.onClose();
      }
    }

    if (asteroid && lot && getLotLeaseAuctionStatus({ asteroid, lot }).isAuctionActive) {
      if (props.onClose) props.onClose();
    }
  }, [asteroid, lot, isLoading, props.onClose]);

  return (
    <ActionDialogInner
      actionImage="Management"
      isLoading={reactBool(isLoading)}
      stage={actionStage}>
      <StartLotLeaseAuction
        asteroid={asteroid}
        lot={lot}
        actionManager={auctionManager}
        stage={actionStage}
        {...props} />
    </ActionDialogInner>
  );
};

export default Wrapper;
