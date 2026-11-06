import { useCallback, useContext, useMemo, useState } from 'react';
import styled from 'styled-components';
import { Deposit, Entity, Product } from '@influenceth/sdk';

import Dropdown from '~/components/Dropdown';
import LiveReadyStatus from '~/components/LiveReadyStatus';
import ResourceThumbnail from '~/components/ResourceThumbnail';
import WarningAlert from '~/components/WarningAlert';
import { CloseIcon, ImproveCoreSampleIcon, NewCoreSampleIcon, ResourceIcon, WarningIcon } from '~/components/Icons';
import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import { useActionSubmission } from '~/contexts/ActionSubmissionContext';
import useAccessibleAsteroidInventories from '~/hooks/useAccessibleAsteroidInventories';
import useAsteroid from '~/hooks/useAsteroid';
import useAsteroidBuildings from '~/hooks/useAsteroidBuildings';
import useBlockTime from '~/hooks/useBlockTime';
import useConstants from '~/hooks/useConstants';
import useCrewContext from '~/hooks/useCrewContext';
import useLot from '~/hooks/useLot';
import useStore from '~/hooks/useStore';
import actionStage from '~/lib/actionStages';
import {
  getCoreSamplingCrewBonuses,
  getExtractorLots,
  getLotResourceAbundances,
  planCoreSamplingBatch
} from '~/lib/coreSamplingBatch';
import formatters from '~/lib/formatters';
import { hasStarterCoreSampleEntitlement } from '~/lib/starterPacks';
import { formatFixed, formatTimer, locationsArrToObj, reactBool } from '~/lib/utils';
import { ActionDialogFooter, ActionDialogHeader } from './components';
import { ActionDialogInner } from '../ActionDialog';

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  padding: 20px 25px 0;
  width: min(1080px, calc(90vw - 12px));
`;

const Columns = styled.div`
  display: flex;
  gap: 25px;
  max-height: calc(95vh - 460px);
  min-height: 240px;
`;

const ListColumn = styled.div`
  flex: 1.5;
  overflow-y: auto;
  padding-right: 8px;
`;

const SummaryColumn = styled.div`
  border-left: 1px solid rgba(255, 255, 255, 0.2);
  display: flex;
  flex: 1;
  flex-direction: column;
  padding-left: 25px;
`;

const SectionLabel = styled.div`
  color: #888;
  font-size: 15px;
  margin: 12px 0 4px;
  text-transform: uppercase;
  &:first-child {
    margin-top: 0;
  }
  & > span {
    color: #555;
    margin-left: 8px;
    text-transform: none;
  }
`;

const ExtractorBlock = styled.div`
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding: 6px 0;
  &:last-child {
    border-bottom: 0;
  }
`;

const ExtractorHeader = styled.div`
  align-items: center;
  display: flex;
  flex-direction: row;
  & > svg {
    color: ${p => p.theme.colors.main};
    flex: 0 0 24px;
    font-size: 20px;
    margin-right: 8px;
  }
  & > div:first-of-type {
    flex: 1;
    min-width: 0;
    & > label {
      color: white;
      display: block;
      font-size: 14px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    & > span {
      color: #777;
    }
  }
  // dropdown wrappers stay square and hug the right edge
  & > div + div {
    flex: 0 0 auto;
    margin-left: 6px;
  }
`;

const JobRow = styled.div`
  align-items: center;
  display: flex;
  flex-direction: row;
  padding: 4px 0 4px 32px;
`;

const JobLabel = styled.label`
  color: white;
  flex: 1;
  margin-left: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  & > i {
    color: #777;
    font-style: normal;
  }
`;

const JobTime = styled.span`
  color: #999;
  margin-left: 10px;
  white-space: nowrap;
`;

const RemoveButton = styled.button`
  background: transparent;
  border: 0;
  color: #999;
  cursor: ${p => p.theme.cursors.active};
  font-size: 16px;
  margin-left: 6px;
  padding: 4px;
  &:hover:not(:disabled) {
    color: white;
  }
  &:disabled {
    cursor: ${p => p.theme.cursors.default};
    opacity: 0.5;
  }
`;

const SummaryBlock = styled.div`
  font-size: 14px;
  line-height: 1.6;
  margin-top: 8px;
  & > label {
    color: white;
    display: block;
    font-size: 16px;
    margin-right: 10px;
  }
  & > div {
    color: #999;
    & > b {
      color: white;
      font-weight: normal;
    }
    & > i {
      color: ${p => p.theme.colors.orange};
      font-style: normal;
    }
  }
`;

const getJobError = (job) => {
  if (!job.hasDrillSource) return 'No core drills available';
  if (!job.isWithinBudget) return 'Exceeds 24h crew availability';
  return null;
};

// Deposits on the extractor's lot controlled by any of the player's crews, as
// shown in the "My Deposits" section of the resources panel.
const getMyDeposits = (lot, accountCrewIds) => (
  (lot?.deposits || []).filter((sample) => accountCrewIds?.includes(sample.Control?.controller?.id))
);

const Extractor = ({
  accountCrewIds,
  addJob,
  blockTime,
  crewOnLot,
  distance,
  extractor,
  jobPlan,
  jobs,
  lotAbundances,
  lotId,
  removeSampling,
  submitting
}) => {
  const { data: lot } = useLot(lotId);
  const myDeposits = useMemo(() => getMyDeposits(lot, accountCrewIds), [accountCrewIds, lot]);

  // samplings already running or scheduled on this lot (incl. unanalyzed
  // deposits and active improvements); jobs queued in this batch add on top
  const queuedTally = useMemo(() => (
    myDeposits.filter(({ Deposit: d }) => (
      d.status < Deposit.STATUSES.SAMPLED || d.finishTime > blockTime
    )).length + jobs.length
  ), [blockTime, jobs.length, myDeposits]);

  // analyzed, unused samples on this lot, available for improvement
  const unusedSamples = useMemo(() => (
    myDeposits.filter(({ Deposit: d }) => (
      d.status === Deposit.STATUSES.SAMPLED
      && d.initialYield > 0
      && d.initialYield === d.remainingYield
      && !(d.finishTime > blockTime)
    ))
  ), [blockTime, myDeposits]);

  // pseudo-option carries the button icon; selecting a resource queues it
  const addOptions = [
    { value: null, label: '', icon: <ResourceIcon /> },
    ...lotAbundances.map(({ i }) => ({
      value: i,
      label: Product.TYPES[i].name
    }))
  ];
  const queuedDepositIds = new Set(jobs.filter((job) => job.depositId != null).map((job) => job.depositId));
  const availableUnusedSamples = unusedSamples.filter((sample) => !queuedDepositIds.has(sample.id));
  const improveOptions = [
    { value: null, label: '', icon: <ImproveCoreSampleIcon /> },
    ...availableUnusedSamples.map((sample) => ({
      value: sample.id,
      label: `${Product.TYPES[sample.Deposit.resource].name} (${formatFixed(sample.Deposit.remainingYield / 1e3, 0)}t)`,
      resourceId: sample.Deposit.resource
    }))
  ];

  return (
    <ExtractorBlock>
      <ExtractorHeader>
        <NewCoreSampleIcon />
        <div>
          <label>{formatters.entityName(extractor)}</label>
          <span>
            {Math.round(distance)}km away
            {queuedTally > 0 && ` · ${queuedTally} sample${queuedTally === 1 ? '' : 's'} queued`}
            {availableUnusedSamples.length > 0 && ` · ${availableUnusedSamples.length} sample${availableUnusedSamples.length === 1 ? '' : 's'} available`}
          </span>
        </div>
        {improveOptions.length > 1 && (
          <Dropdown
            key={`improve-${lotId}-${jobs.length}`}
            disabled={reactBool(!crewOnLot || submitting)}
            hideSelected
            initialSelection={null}
            onChange={(option) => option.value != null && addJob(lotId, {
              depositId: option.value,
              resourceId: option.resourceId
            })}
            options={improveOptions}
            size="bigicon" />
        )}
        <Dropdown
          key={`sample-${lotId}-${jobs.length}`}
          disabled={reactBool(!crewOnLot || submitting)}
          hideSelected
          initialSelection={null}
          onChange={(option) => option.value != null && addJob(lotId, { resourceId: option.value })}
          options={addOptions}
          size="bigicon" />
      </ExtractorHeader>
      {jobs.map((job, index) => {
        const plannedJob = jobPlan[index];
        const jobError = plannedJob && getJobError(plannedJob);
        const isImprovement = job.depositId != null;
        const abundance = !isImprovement
          && lotAbundances.find((a) => a.i === job.resourceId)?.abundance;
        return (
          <JobRow key={index}>
            <ResourceThumbnail resource={Product.TYPES[job.resourceId]} size="40px" tooltipContainer={null} />
            <JobLabel>
              {Product.TYPES[job.resourceId].name}
              {isImprovement
                ? <i> (improvement)</i>
                : (abundance != null && <i> ({formatFixed(100 * abundance, 1)}%)</i>)}
            </JobLabel>
            <JobTime>{jobError || (plannedJob && `~${formatTimer(plannedJob.duration)}`)}</JobTime>
            <RemoveButton onClick={() => removeSampling(lotId, index)}>
              <CloseIcon />
            </RemoveButton>
          </JobRow>
        );
      })}
    </ExtractorBlock>
  );
};

const CoreSamplingDialog = ({ asteroid, onClose }) => {
  const { accountCrewIds, crew } = useCrewContext();
  const blockTime = useBlockTime();
  const { data: CREW_SCHEDULE_BUFFER } = useConstants('CREW_SCHEDULE_BUFFER');
  const { data: extractors } = useAsteroidBuildings(asteroid?.id, 'Extractors');
  const { data: drillInventories } = useAccessibleAsteroidInventories(asteroid?.id, {
    isSourcing: true,
    itemIds: [Product.IDS.CORE_DRILL],
    productIds: [Product.IDS.CORE_DRILL]
  });
  const { execute } = useContext(ChainTransactionContext);
  const submission = useActionSubmission();

  // queued jobs per extractor, in scheduling order: lotId -> [resourceId, ...]
  const [jobsByLot, setJobsByLot] = useState({});

  const crewOnLot = !!crew?._location?.lotId && crew?._location?.asteroidId === Number(asteroid?.id);
  const crewBonuses = useMemo(() => getCoreSamplingCrewBonuses(crew), [crew]);

  const extractorLots = useMemo(() => (
    crewOnLot ? getExtractorLots(asteroid?.id, extractors, crew._location.lotIndex) : []
  ), [asteroid?.id, crew, crewOnLot, extractors]);

  const ownExtractorLots = useMemo(() => {
    const byName = (a, b) => formatters.entityName(a.extractor).localeCompare(formatters.entityName(b.extractor));
    return extractorLots
      .filter((lot) => accountCrewIds?.includes(lot.extractor.Control?.controller?.id))
      .sort(byName);
  }, [accountCrewIds, extractorLots]);

  const lotAbundances = useMemo(() => {
    const abundances = {};
    ownExtractorLots.forEach(({ lotId, lotIndex }) => {
      abundances[lotId] = getLotResourceAbundances(asteroid, lotIndex);
    });
    return abundances;
  }, [asteroid, ownExtractorLots]);

  const drillSources = useMemo(() => {
    const sources = [];
    (drillInventories || []).forEach((entity) => {
      const { lotIndex } = locationsArrToObj(entity.Location?.locations || []);
      entity.Inventories.forEach((inventory) => {
        const amount = (inventory.contents || [])
          .find((c) => Number(c.product) === Product.IDS.CORE_DRILL)?.amount || 0;
        if (amount > 0) {
          sources.push({ id: entity.id, label: entity.label, slot: inventory.slot, lotIndex, remaining: amount });
        }
      });
    });
    if (hasStarterCoreSampleEntitlement(crew)) {
      sources.push({
        id: 0,
        label: 0,
        slot: 0,
        lotIndex: null, // starter-pack drills arrive with the crew
        remaining: Number(crew.StarterPack.coreSampleAllowance)
      });
    }
    return sources;
  }, [crew, drillInventories]);

  const plannedJobs = useMemo(() => (
    ownExtractorLots.flatMap(({ lotId, lotIndex }) => (
      (jobsByLot[lotId] || []).map((job) => ({ lotId, lotIndex, ...job }))
    ))
  ), [jobsByLot, ownExtractorLots]);

  const plan = useMemo(() => {
    if (!crewOnLot || !blockTime || !CREW_SCHEDULE_BUFFER || plannedJobs.length === 0) return null;
    return planCoreSamplingBatch({
      asteroidId: Number(asteroid?.id),
      blockTime,
      crew,
      crewBonuses,
      crewScheduleBuffer: CREW_SCHEDULE_BUFFER,
      drillSources,
      jobs: plannedJobs
    });
  }, [asteroid?.id, blockTime, crew, crewBonuses, CREW_SCHEDULE_BUFFER, crewOnLot, drillSources, plannedJobs]);

  const addJob = useCallback((lotId, job) => {
    setJobsByLot((prev) => ({ ...prev, [lotId]: [...(prev[lotId] || []), job] }));
  }, []);

  const removeSampling = useCallback((lotId, index) => {
    setJobsByLot((prev) => ({
      ...prev,
      [lotId]: (prev[lotId] || []).filter((_, i) => i !== index)
    }));
  }, []);

  // planned jobs grouped back per lot + position, aligned with plan.jobs order
  const jobsWithMeta = useMemo(() => {
    const grouped = {};
    let cursor = 0;
    ownExtractorLots.forEach(({ lotId }) => {
      grouped[lotId] = (jobsByLot[lotId] || []).map(() => plan?.jobs?.[cursor++] || null);
    });
    return grouped;
  }, [jobsByLot, ownExtractorLots, plan]);

  const jobErrors = useMemo(() => (
    [...new Set((plan?.jobs || []).map(getJobError).filter((error) => !!error))]
  ), [plan]);

  const busyTotal = plan ? Math.max(0, plan.finishTime - blockTime) : 0;
  const canSubmit = !!plan && jobErrors.length === 0 && plannedJobs.length > 0;

  const submitting = submission?.busy;

  const onStart = useCallback(async () => {
    const samplingCalls = (plan?.jobs || []).map((job) => {
      const common = {
        origin: { id: job.drillSource.id, label: job.drillSource.label },
        origin_slot: job.drillSource.slot,
        lot: { id: job.lotId, label: Entity.IDS.LOT },
        caller_crew: { id: crew.id, label: Entity.IDS.CREW }
      };
      return job.depositId != null
        ? {
          key: 'SampleDepositImprove',
          vars: { ...common, deposit: { id: job.depositId, label: Entity.IDS.DEPOSIT } }
        }
        : {
          key: 'SampleDepositStart',
          vars: { ...common, resource: job.resourceId }
        };
    });
    const result = await execute('BulkSampleDepositStart', {
      caller_crew: { id: crew.id, label: Entity.IDS.CREW },
      samplingCalls
    });
    if (result?.status === 'indexed') setJobsByLot({});
  }, [crew, execute, plan]);

  const crewTimeRequirement = { total: busyTotal, details: [] };

  return (
    <>
      <ActionDialogHeader
        action={{ icon: <NewCoreSampleIcon />, label: 'Core Sampling' }}
        actionCrew={crew}
        crewAvailableTime={crewTimeRequirement}
        location={{ asteroid }}
        onClose={onClose}
        stage={actionStage.NOT_STARTED} />

      <Wrapper>
        <Columns>
          <ListColumn>
            {!crewOnLot && (
              <WarningAlert severity="warning">
                <div><WarningIcon /></div>
                <div>Crew must be located on this asteroid to start core samplings.</div>
              </WarningAlert>
            )}
            {crewOnLot && jobErrors.length > 0 && (
              <WarningAlert severity="warning">
                <div><WarningIcon /></div>
                <div>
                  {jobErrors.map((error, i) => (<div key={i}>{error}</div>))}
                </div>
              </WarningAlert>
            )}
            {ownExtractorLots.length > 0 && (
              <>
                <SectionLabel>Your Extractors <span>({ownExtractorLots.length})</span></SectionLabel>
                {ownExtractorLots.map((lot) => (
                  <Extractor
                    key={lot.lotId}
                    accountCrewIds={accountCrewIds}
                    addJob={addJob}
                    blockTime={blockTime}
                    crewOnLot={crewOnLot}
                    distance={lot.distance}
                    extractor={lot.extractor}
                    jobPlan={jobsWithMeta[lot.lotId] || []}
                    jobs={jobsByLot[lot.lotId] || []}
                    lotAbundances={lotAbundances[lot.lotId] || []}
                    lotId={lot.lotId}
                    removeSampling={removeSampling}
                    submitting={submitting} />
                ))}
              </>
            )}
            {crewOnLot && ownExtractorLots.length === 0 && (
              <SectionLabel>No extractors found on this asteroid.</SectionLabel>
            )}
          </ListColumn>

          <SummaryColumn>
            <SummaryBlock>
              <label>{formatters.crewName(crew)}</label>
              <LiveReadyStatus crew={crew} style={{ fontSize: '14px' }} />
            </SummaryBlock>
            <SummaryBlock>
              <div>Samplings planned: <b>{plannedJobs.length}</b></div>
              <div>Core drills available: <b>{
                drillSources.reduce((acc, source) => acc + source.remaining, 0)
              }</b></div>
              {plan && (
                <>
                  <div>Crew busy (incl. current): <b>{formatTimer(busyTotal)}</b></div>
                  {!plan.isWithinBudget && (
                    <div><i>Exceeds 24h crew availability</i></div>
                  )}
                </>
              )}
            </SummaryBlock>
          </SummaryColumn>
        </Columns>
      </Wrapper>

      <ActionDialogFooter
        crewAvailableTime={crewTimeRequirement}
        disabled={reactBool(!canSubmit)}
        goLabel={`Start ${plannedJobs.length} Core Sample${plannedJobs.length === 1 ? '' : 's'}`}
        isSequenceable
        onGo={onStart}
        stage={actionStage.NOT_STARTED}
        waitForCrewReady
        onClose={onClose} />
    </>
  );
};

const CoreSampling = (props) => {
  const asteroidId = useStore(s => s.asteroids.origin);
  const { data: asteroid, isLoading } = useAsteroid(asteroidId);
  return (
    <ActionDialogInner
      actionImage="CoreSample"
      isLoading={reactBool(isLoading)}
      stage={actionStage.NOT_STARTED}>
      <CoreSamplingDialog asteroid={asteroid} {...props} />
    </ActionDialogInner>
  );
};

export default CoreSampling;
