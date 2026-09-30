import AuthorizationNotice from '~/components/AuthorizationNotice';
import { useEffect, useMemo } from 'react';
import styled from 'styled-components';
import { Building } from '@influenceth/sdk';

import {
  PermissionIcon,
  TakeControlIcon,
  WarningIcon
} from '~/components/Icons';
import useCrewContext from '~/hooks/useCrewContext';
import theme, { hexToRGB } from '~/theme';
import { reactBool, formatTimer } from '~/lib/utils';

import { ActionDialogInner, useAsteroidAndLot } from '../ActionDialog';
import {
  ActionDialogFooter,
  ActionDialogHeader,
  ActionDialogStats,

  FlexSection,
  FlexSectionInputBlock,
  ProgressBarSection,
  ActionDialogBody,
  BuildingInputBlock,
  FlexSectionSpacer,
  FlexSectionBlock
} from './components';
import actionStage from '~/lib/actionStages';
import useRepoManager from '~/hooks/actionManagers/useRepoManager';
import CrewIndicator from '~/components/CrewIndicator';
import useCrew from '~/hooks/useCrew';

const DescTitle = styled.div`
  align-items: center;
  background: rgba(${p => hexToRGB(p.theme.colors.error)}, 0.5);
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

const MouseoverWarning = styled.span`
  & b { color: ${theme.colors.error}; }
  & em { font-weight: bold; font-style: normal; color: white; }
`;

const RepoBuilding = ({ asteroid, lot, actionManager, stage, ...props }) => {
  const { repoBuilding, takeoverType, authorization } = actionManager;
  const { crew } = useCrewContext();
  const { data: delinquentController } = useCrew(lot?.building?.Control?.controller?.id);

  const stats = useMemo(() => ([]), []);

  // TODO: if repo construction site, go to "construct" dialog after

  const buildingOrSite = lot?.building?.Building?.status === Building.CONSTRUCTION_STATUSES.OPERATIONAL
    ? 'Building'
    : 'Construction Site';

  return (
    <>
      <ActionDialogHeader
        action={{
          icon: <TakeControlIcon />,
          label: takeoverType === 'squatted'
            ? `Repossess ${buildingOrSite}`
            : 'Claim Construction Site',
          status: stage === actionStage.NOT_STARTED
            ? (takeoverType === 'squatted' ? 'Repossession' : 'Control Change')
            : undefined,
        }}
        overrideColor={stage === actionStage.NOT_STARTED ? theme.colors.error : undefined}
        actionCrew={crew}
        location={{ asteroid, lot }}
        onClose={props.onClose}
        stage={stage} />

      <ActionDialogBody>
        <FlexSection>
          <BuildingInputBlock
            title="Location"
            building={lot?.building}
            imageProps={takeoverType === 'expired' && {
              iconOverlay: <WarningIcon />,
              iconOverlayColor: theme.colors.error
            }}
          />

          <FlexSectionSpacer />

          <FlexSectionInputBlock title="Details">
            <DescTitle>
              <PermissionIcon />
              <span>Take Control of {buildingOrSite === 'Construction Site' ? 'Site' : buildingOrSite}</span>
            </DescTitle>
            <Desc>
              {takeoverType === 'squatted'
                ? <>Your current lot rights allow you to assume control of this asset.</>
                : <>The <b>Staging Time</b> has expired and no other active tenant protects this site. An eligible crew may claim it.</>
              }
            </Desc>
          </FlexSectionInputBlock>
        </FlexSection>

        <FlexSection style={{ marginBottom: 10 }}>
          <FlexSectionBlock>
            <CrewIndicator crew={delinquentController} label="Claim from" />
          </FlexSectionBlock>
        </FlexSection>

        {takeoverType === 'expired' && (
          <ProgressBarSection
            overrides={{
              barColor: theme.colors.main,
              color: '#ffffff',
              left: `Reset Site Timer`,
              right: formatTimer(Building.GRACE_PERIOD)
            }}
            stage={stage}
            title="Staging Time"
            tooltip={(
              <MouseoverWarning>
                <em>Building Sites</em> are used to stage materials before construction. If you are the <em>Lot Contoller</em>,
                any assets moved to the building site are protected for the duration of the <em>Site Timer</em>.
                <br/><br/>
                A site is designated as <b>Abandoned</b> if it has not started construction before the
                timer expires. Materials left on an <b>Abandoned Site</b> are public, and are thus subject to
                be claimed by other players!
                <br/><br/>
                If you are not the <em>Lot Contoller</em>, the <em>Lot Contoller</em> may takeover your Building Site and its
                materials at any time (even before the <em>Site Timer</em> elapses).
              </MouseoverWarning>
            )}
          />
        )}

        <ActionDialogStats
          stage={stage}
          stats={stats}
        />

        {stats?.length > 0 ? null : <div style={{ height: 20 }} />}
      </ActionDialogBody>

      {stage === actionStage.NOT_STARTED && <AuthorizationNotice authorization={authorization} deniedMessage="Repossession requires current lot rights, or an expired construction site with no other active tenant." />}
      <ActionDialogFooter
        goLabel={takeoverType === 'squatted' ? 'Repossess' : 'Claim'}
        disabled={authorization.status !== 'allowed'}
        onGo={repoBuilding}
        stage={stage}
        waitForCrewReady
        {...props} />
    </>
  );
};

const Wrapper = (props) => {
  const { asteroid, lot, isLoading } = useAsteroidAndLot(props);
  const repoManager = useRepoManager(lot?.id);
  const { actionStage } = repoManager;

  useEffect(() => {
    if (!asteroid || !lot) {
      if (!isLoading) {
        if (props.onClose) props.onClose();
      }
    }

  }, [asteroid, lot, isLoading]);

  return (
    <ActionDialogInner
      actionImage="Management"
      isLoading={reactBool(isLoading)}
      stage={actionStage}>
      <RepoBuilding
        asteroid={asteroid}
        lot={lot}
        actionManager={repoManager}
        stage={actionStage}
        {...props} />
    </ActionDialogInner>
  )
};

export default Wrapper;
