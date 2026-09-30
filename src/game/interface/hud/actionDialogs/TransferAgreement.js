import { useCallback, useEffect, useMemo, useState } from 'react';
import { Entity, Permission, Time } from '@influenceth/sdk';

import { WarningIcon, TransferAgreementIcon } from '~/components/Icons';
import useAgreementManager from '~/hooks/actionManagers/useAgreementManager';
import useBlockTime from '~/hooks/useBlockTime';
import useCrewContext from '~/hooks/useCrewContext';
import useEntity from '~/hooks/useEntity';
import useHydratedLocation from '~/hooks/useHydratedLocation';
import useLot from '~/hooks/useLot';

import actionStages from '~/lib/actionStages';
import { reactBool, locationsArrToObj, formatFixed, secondsToMonths } from '~/lib/utils';
import theme from '~/theme';
import {
  ActionDialogFooter,
  ActionDialogHeader,
  ActionDialogStats,
  FlexSectionSpacer,
  ActionDialogBody,
  FlexSection,
  FlexSectionBlock,
  LotInputBlock,
  BuildingInputBlock,
  ShipInputBlock,
  CrewTypeaheadInputBlock,
} from './components';
import { ActionDialogInner } from '../ActionDialog';

const TransferAgreement = ({
  agreementManager,
  entity,
  permission,
  stage,
  ...props
}) => {
  const { currentAgreement, transferAgreement, pendingChange } = agreementManager;
  const blockTime = useBlockTime();
  const { crew } = useCrewContext();
  const location = useHydratedLocation(locationsArrToObj(entity?.Location?.locations || []));

  const [targetCrewId, setTargetCrewId] = useState(pendingChange?.vars?.new_permitted?.id);

  const remainingPeriod = useMemo(() => currentAgreement?.endTime - blockTime, [blockTime, currentAgreement?.endTime]);

  const stats = useMemo(() => {
    return [
      {
        label: 'Remaining Lease',
        value: `${formatFixed(secondsToMonths(remainingPeriod), 2)} mo`,
        direction: 0
      },
      {
        label: 'Remaining Lease (Adalian Days)',
        value: Math.round(Time.toGameDuration(remainingPeriod / 86400, crew?._timeAcceleration)).toLocaleString(),
        direction: 0
      }
    ];
  }, [crew, remainingPeriod]);
  
  const onTransferAgreement = useCallback(() => {
    if (!targetCrewId) return;
    return transferAgreement({ id: targetCrewId, label: Entity.IDS.CREW });
  }, [targetCrewId]);

  return (
    <>
      <ActionDialogHeader
        action={{
          icon: <TransferAgreementIcon />,
          label: `Transfer ${entity.label === Entity.IDS.LOT ? 'Lot' : 'Asset'} Agreement`,
          status: stage === actionStages.NOT_STARTED ? `Permission: ${Permission.TYPES[permission]?.name}` : undefined,
        }}
        actionCrew={crew}
        location={location}
        onClose={props.onClose}
        overrideColor={stage === actionStages.NOT_STARTED ? theme.colors.main : undefined}
        stage={stage} />

      <ActionDialogBody>
        <FlexSection style={{ alignItems: 'flex-start' }}>
          <FlexSectionBlock title="Permission Target" bodyStyle={{ padding: 0 }}>
            {entity.label === Entity.IDS.BUILDING && (
              <BuildingInputBlock building={entity} style={{ width: '100%' }} />
            )}
            {entity.label === Entity.IDS.LOT && (
              <LotInputBlock lot={entity} style={{ width: '100%' }} />
            )}
            {entity.label === Entity.IDS.SHIP && (
              <ShipInputBlock ship={entity} style={{ width: '100%' }} />
            )}
          </FlexSectionBlock>

          <FlexSectionSpacer />

          <CrewTypeaheadInputBlock
            title="New Lessee"
            stage={stage}
            setSelectedCrewId={setTargetCrewId}
            selectedCrewId={targetCrewId}
            subtle
          />
        </FlexSection>

        <FlexSection style={{ alignItems: 'center', color: theme.colors.warning, height: 72, justifyContent: 'center' }}>
          <span style={{ fontSize: '28px', textAlign: 'center', width: 60 }}><WarningIcon /></span>
          <span style={{ fontSize: '90%' }}>
            As the current lessee, you will cede any rights delegated by the original agreement,<br/>
            including the abilities to extend or transfer the lease any further.
          </span>
        </FlexSection>

        <ActionDialogStats
          stage={stage}
          stats={stats}
        />

      </ActionDialogBody>

      <ActionDialogFooter
        disabled={!targetCrewId}
        goLabel="Transfer Agreement"
        onGo={onTransferAgreement}
        stage={stage}
        {...props} />
    </>
  );
};

const Wrapper = ({ entity: entityId, permission, ...props }) => {
  const { crewIsLoading } = useCrewContext();
  const { data: asset, isLoading: assetIsLoading } = useEntity(entityId?.label === Entity.IDS.LOT ? undefined : entityId);
  const { data: lot, isLoading: lotIsLoading } = useLot(entityId?.label === Entity.IDS.LOT ? entityId?.id : undefined);
  const entity = asset || lot;
  const entityIsLoading = assetIsLoading || lotIsLoading;

  const agreementManager = useAgreementManager(entity, permission);
  const stage = agreementManager.pendingChange ? actionStages.STARTING : actionStages.NOT_STARTED;

  useEffect(() => {
    if (!entityIsLoading && !entity) {
      props.onClose();
    }
  }, [entity, entityIsLoading, props]);
  
  // TODO: close if no prepaid lease

  return (
    <ActionDialogInner
      actionImage="Agreements"
      isLoading={reactBool(entityIsLoading || crewIsLoading)}
      stage={stage}>
      <TransferAgreement
        entity={entity}
        agreementManager={agreementManager}
        permission={permission}
        stage={stage}
        {...props} />
    </ActionDialogInner>
  )
};

export default Wrapper;
