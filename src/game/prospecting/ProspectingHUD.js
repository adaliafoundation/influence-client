import { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { Asteroid, Entity, Lot, Product, Prospecting } from '@influenceth/sdk';
import Button from '~/components/ButtonAlt';
import ResourceThumbnail from '~/components/ResourceThumbnail';
import SliderInput from '~/components/SliderInput';
import Dropdown from '~/components/Dropdown';
import useStore from '~/hooks/useStore';
import useAsteroid from '~/hooks/useAsteroid';
import useCrewContext from '~/hooks/useCrewContext';
import { hasStarterCoreSampleEntitlement } from '~/lib/starterPacks';
import { formatTimer } from '~/lib/utils';
import { InventorySelectionDialog } from '../interface/hud/actionDialogs/components';
import {
  Scrollable,
  SectionTitle,
  Rule
} from '../interface/hud/hudMenus/components/components';
import { useProspecting, prospectingEnabled } from './store';
import useCampaignStorage from './useCampaignStorage';
import useCampaignProof from './useCampaignProof';
import useSamplingEligibility from './useSamplingEligibility';
import useChainCampaign from './useChainCampaign';
import { samplingPreview } from './samplingPreview';
import PendingLegacySamples from './PendingLegacySamples';
import { DEPTHS, SURFACE_INSET } from './geometry';

const Panel = styled(Scrollable)`
  color: ${(p) => p.theme.colors.mainText};
  font-size: 14px;
`;
const Field = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  margin: 16px 0;
  & > label { color: #999; }
`;
const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 16px 0;
`;
const Summary = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 12px 0;
  & > span { color: #999; }
`;
const Metrics = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin: 16px 0;
  & label { display: block; color: #999; font-size: 12px; margin-bottom: 6px; }
  & strong { color: ${(p) => p.theme.colors.main}; font-size: 20px; font-weight: normal; }
`;
const Choice = styled.div`
  border-top: 1px solid rgba(255,255,255,0.15);
  padding: 12px 0;
`;
const ChoiceHeading = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
  & > span { color: ${(p) => p.theme.colors.main}; }
`;
const Note = styled.div`
  color: #999;
  font-size: 12px;
  line-height: 1.5;
  margin: 6px 0;
`;
const Outcome = styled.div`
  color: ${(p) => p.theme.colors.mainText};
  line-height: 1.5;
  margin: 12px 0;
`;

const ResourceHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 12px 0 16px;
  & > div:last-child { flex: 1; min-width: 0; }
`;
const DepthSteps = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  margin-top: -6px;
  & span { color: #777; }
  & span[data-reachable="true"] { color: ${p => p.theme.colors.main}; }
`;
function SampleBudget({ used }) {
  return (
    <svg viewBox="0 0 240 8" width="100%" height="8" role="img" aria-label={`${10 - used} samples remaining`}>
      {Array.from({ length: 10 }, (_, i) => (
        <rect key={i} x={i * 24} y="0" width="19" height="4"
          fill={i < used ? '#637681' : '#36a7cd'} opacity={i < used ? 0.35 : 0.85} />
      ))}
    </svg>
  );
}

function SegmentQuality({ cell }) {
  if (!cell?.[3]) return null;
  const color = ['#637681', '#36a7cd', '#88e675', '#faaf42'][cell[3]];
  const rows = [
    { label: 'Grade', value: cell[3] / 3, text: `${cell[3]} / 3`, known: true },
    { label: 'Width', value: cell[9] / 350, text: `${cell[9] / 100}×`, known: !!cell[7] },
    { label: 'Rate', value: (90 + cell[10]) / 200, text: `${90 + cell[10]}%`, known: !!cell[8] }
  ];
  return (
    <svg viewBox="0 0 320 82" width="100%" role="img" aria-label="Selected segment grade, measured width, and extraction rate">
      <title>Segment quality. Unmeasured width and rate are shown as untested.</title>
      {rows.map((row, i) => (
        <g key={row.label} transform={`translate(0,${i * 26})`}>
          <text x="0" y="16" fill="#999" fontSize="12">{row.label}</text>
          <rect x="60" y="7" width="160" height="10" fill="#252c31" />
          {row.known
            ? <rect x="60" y="7" width={160 * Math.min(1, row.value)} height="10" fill={color} opacity="0.8" />
            : <path d="M60 12H220" stroke="#637681" strokeDasharray="3 4" />}
          <text x="232" y="16" fill={row.known ? color : '#777'} fontSize="12">{row.known ? row.text : 'Untested'}</text>
        </g>
      ))}
    </svg>
  );
}

export default function ProspectingHUD() {
  const asteroidId = useStore((s) => s.asteroids.origin);
  const dispatchResourceMapSelect = useStore((s) => s.dispatchResourceMapSelect);
  const dispatchResourceMapToggle = useStore((s) => s.dispatchResourceMapToggle);
  const dispatchHudMenuOpened = useStore((s) => s.dispatchHudMenuOpened);
  const lotId = useStore((s) => s.asteroids.lot);
  const zoom = useStore((s) => s.asteroids.zoomStatus);
  const launcher = useStore((s) => s.launcherPage);
  const { data: asteroid } = useAsteroid(asteroidId);
  const p = useProspecting();
  const eligibility = useSamplingEligibility(p);
  const chain = useChainCampaign(eligibility.recheck);
  const storage = useCampaignStorage(chain.enabled ? { mode: 'chain', campaignId: chain.campaign?.id,
    initialRecord: chain.initialRecord, validateNewRecord: chain.validateNewRecord } : undefined);
  const proving = useCampaignProof();
  const { crew } = useCrewContext();
  const [supply, setSupply] = useState(null);
  const [selectSupply, setSelectSupply] = useState(false);
  const starterSample = hasStarterCoreSampleEntitlement(crew);
  const supplySelection = starterSample ? { entity: { label: 0, id: 0 }, slot: 0 }
    : supply ? { entity: { label: supply.label, id: supply.id }, slot: supply.slot } : null;
  const enabled = prospectingEnabled();
  const { active, asteroidId: campaignAsteroid, close } = p;
  useEffect(() => {
    if (
      active &&
      (Number(asteroidId) !== Number(campaignAsteroid) || zoom !== 'in')
    )
      close();
  }, [asteroidId, zoom, active, campaignAsteroid, close]);
  useEffect(() => () => close(), [close]);
  useEffect(() => {
    if (!active) return undefined;
    dispatchResourceMapSelect(p.resource);
    dispatchResourceMapToggle(true);
    return () => {
      if (useStore.getState().openHudMenu !== 'RESOURCES') dispatchResourceMapToggle(false);
    };
  }, [active, p.resource, dispatchResourceMapSelect, dispatchResourceMapToggle]);

  const selectedLot = p.selected?.lot;
  const section = p.layers[p.depth].find((entry) => entry.lot === selectedLot);
  const selectedCell = section?.cell;
  const maxDepth = Math.max(0, p.layers.findLastIndex((layer) => layer.length));
  const campaignResource = p.resource;
  const abundance = useMemo(
    () =>
      active && selectedLot && asteroid?.Celestial?.abundances
        ? Asteroid.Entity.getAbundanceAtLot(
            asteroid,
            selectedLot,
            campaignResource
          )
        : 0,
    [active, selectedLot, asteroid, campaignResource]
  );
  const surveyedMeta = selectedCell && p.history[p.cells.indexOf(selectedCell)]?.meta;
  const claimAbundance = surveyedMeta ? Prospecting.unpackMeta(surveyedMeta).abundance : Math.round(abundance * 1e6);
  const estimate = selectedCell?.[3] && claimAbundance > 0
    ? Prospecting.getClaim(selectedCell, claimAbundance)
    : null;
  const choices = samplingPreview({
    cell: selectedCell,
    source: p.source === null ? null : p.cells[p.source],
    site: p.patch?.sites.find((site) => site.index === selectedLot),
    depth: p.depth,
    abundance
  });
  const finished = !!eligibility.disabledReason || p.busy || p.storageStatus !== 'ready' || p.history.length >= 10 || !!p.finalized
    || (chain.enabled && (chain.starting || !chain.campaign || chain.campaign.closed || !!p.pending || !supplySelection || !!p.chainOperation));
  const disabled = [
    !section?.sources.length || finished,
    !selectedCell?.[3] || !!selectedCell?.[7] || finished,
    !selectedCell?.[3] || !!selectedCell?.[8] || finished
  ];
  if (!enabled || !p.active || !lotId || zoom !== 'in' || launcher) return null;
  return (
    <Panel aria-label={chain.enabled ? 'Prospecting campaign' : 'Prospecting playtest'}>
          <ResourceHeader>
            <ResourceThumbnail resource={Product.TYPES[p.resource]} size="56px" />
            <div>
              <SectionTitle><span>{Product.TYPES[p.resource]?.name}</span></SectionTitle>
              <Note>{p.history.length} / 10 samples · Prospecting</Note>
            </div>
          </ResourceHeader>
          {chain.enabled && <PendingLegacySamples lotId={lotId} />}
          <SampleBudget used={p.history.length} />
          <Note role="status">{p.busy ? 'Saving private campaign…'
            : p.storageStatus === 'ready' ? storage.backupLabel
              : 'Private campaign locked'}</Note>
          {storage.backupError && <Note role="status">Backup pending: {storage.backupError}</Note>}
          {chain.enabled && <>
            {chain.error && <Outcome role="alert">{chain.error}</Outcome>}
            {chain.history.length > 0 && <Field><label>Saved campaign history</label>
              <Dropdown options={chain.history.map(c => ({ value: c.campaignId,
                label: `Campaign #${c.campaignId} · ${['', 'Active', 'Abandoned', 'Replaced', 'Finalized'][c.status]}` }))}
                initialSelection={chain.campaign?.id} disabled={p.busy || chain.starting}
                onChange={option => chain.viewCampaign(option.value)} />
              {chain.moreHistory && <Button size="small" disabled={p.busy} onClick={chain.loadHistory}>Older campaigns</Button>}
            </Field>}
            {chain.historyError && <Note>Campaign history is unavailable: {chain.historyError}</Note>}
            {!chain.campaign && <Note>{chain.occupying
              ? `This lot has campaign #${chain.occupying.id} for ${Product.TYPES[chain.occupying.resource]?.name}. Its replacement deadline is ${new Date(chain.occupying.replaceableAt * 1000).toLocaleString()}.`
              : 'Start a campaign to commit samples on chain.'}</Note>}
          </>}
          {p.storageStatus !== 'ready' && !p.busy && !(chain.enabled && storage.unlocked && !chain.campaign) && (
            <>
              <Outcome>{storage.error || p.message || 'Unlock private data with your account to recover or save this campaign.'}</Outcome>
              <Actions>
                {storage.canRecover
                  ? <Button size="small" disabled={storage.unlocking} onClick={storage.connect}>
                      {storage.unlocking ? 'Unlocking…' : 'Unlock private data'}
                    </Button>
                  : <Button size="small" onClick={() => useStore.getState().dispatchLauncherPage('inbox')}>Set up private data</Button>}
              </Actions>
            </>
          )}
          {chain.enabled && storage.unlocked && (!chain.campaign || chain.campaign.closed || Date.now() / 1000 >= chain.campaign.replaceableAt) && <Actions>
            <Button size="small" onClick={chain.start} disabled={!crew?.id || chain.starting || chain.loading || p.busy ||
              (chain.occupying && Date.now() / 1000 < chain.occupying.replaceableAt)}>
              {chain.occupying ? 'Replace expired campaign' : 'Start campaign'}
            </Button>
          </Actions>}
          {chain.enabled && chain.campaign && <>
            <Note>Campaign #{chain.campaign.id} · {chain.campaign.closed ? chain.campaign.status : 'Active'}
              {chain.campaign.claim?.id !== '0' && chain.campaign.closed && chain.campaign.claim?.id ? ` · Claim #${chain.campaign.claim.id}` : ''}</Note>
            {p.pending && !chain.campaign.closed && <Outcome role="status">{p.pending.stage === 'accepted'
              ? `Sample committed. ${p.pending.readyAt > Date.now() / 1000 ? `${formatTimer(Math.ceil(p.pending.readyAt - Date.now() / 1000))} of work remaining.` : 'Waiting for future-block randomness.'}`
              : p.pending.stage === 'submitted' ? 'Sample submitted. Waiting for chain confirmation.' : 'A saved sample is ready to submit with its original commitment.'}</Outcome>}
            {p.pending?.stage === 'prepared' && <Actions><Button size="small" disabled={p.busy || chain.campaign.closed} onClick={chain.retry}>Submit saved sample</Button></Actions>}
            {!chain.campaign.closed && <Actions>
              <Button size="small" disabled={p.busy || !!p.pending} onClick={() => setSelectSupply(true)}>
                {starterSample ? 'Starter sample allowance' : supply ? `Drills · inventory #${supply.id}` : 'Choose drill inventory'}
              </Button>
            </Actions>}
          </>}
          <Field>
            <label>Depth · {p.depth * 100}–{DEPTHS[p.depth]} m</label>
            <div style={{ width: '100%', boxSizing: 'border-box', padding: '0 12px' }}>
              <SliderInput min={0} max={4} availableMax={maxDepth} disabled={!maxDepth || p.busy}
                ariaLabel="Prospecting depth" increment={1} value={p.depth} onChange={p.setDepth} />
              <DepthSteps>
                {DEPTHS.map((metres, index) => (
                  <span key={metres} data-reachable={index <= maxDepth} title={index <= maxDepth ? 'Reachable' : 'Drill deeper to unlock'}>{metres} m</span>
                ))}
              </DepthSteps>
            </div>
          </Field>
          <Summary>
            <strong>{p.selected ? `Lot #${selectedLot}` : 'Select a section'}</strong>
            <span>{selectedCell ? selectedCell[3] ? `Grade ${selectedCell[3]}` : 'Barren' : 'Unsurveyed'}</span>
          </Summary>
          <Note>Local abundance {(abundance * 100).toFixed(1)}% · {SURFACE_INSET} m overburden</Note>
          {estimate && (
            <Metrics>
              <div><label>Mineable ore</label><strong>{Math.floor(estimate.quantity / 1000).toLocaleString()} t</strong></div>
              <div><label>Rate vs. reference</label><strong>{estimate.rate}%</strong>
                {estimate.rate !== 100 && <Note>{estimate.rate > 100 ? '↑' : '↓'} {Math.abs(estimate.rate - 100)}% vs. reference</Note>}
              </div>
            </Metrics>
          )}
          <SegmentQuality cell={selectedCell} />
          {choices.map((choice, method) => (
            <Choice key={choice.label}>
              <ChoiceHeading>
                <Button size="small" disabled={disabled[method]} onClick={() => chain.enabled
                  ? chain.sample(method, supplySelection) : p.sample(method, abundance, eligibility.recheck)}>
                  {choice.label}
                </Button>
                <span>{choice.value}</span>
              </ChoiceHeading>
              <Note>{choice.detail}</Note>
              <Note>{choice.risk}</Note>
            </Choice>
          ))}
          <Note role="status">{eligibility.disabledReason}</Note>
          <Note>Each action uses 1 sample. Results can leave quantity or rate unchanged.</Note>
          <Rule />
          <Outcome role="status">
            {p.message || 'Select a blue outline to choose your next section.'}
          </Outcome>
          <Actions>
            <Button size="small" disabled={!estimate || !!p.finalized || !!p.pending || p.busy || p.storageStatus !== 'ready' ||
              (chain.enabled && (!chain.campaign || chain.campaign.closed))} onClick={() => p.finalize(abundance)}>
              Select claim
            </Button>
            <Button size="small" onClick={() => { p.close(); dispatchHudMenuOpened('RESOURCES'); }}>Resources</Button>
          </Actions>
          {p.finalized && (
            <>
              <Actions>
                <Button size="small" disabled={proving.busy || proving.phase === 'verified'} onClick={proving.prove}>
                  {proving.phase === 'verified' ? 'Proof verified' : proving.busy ? 'Preparing proof…' : 'Generate proof'}
                </Button>
                {proving.busy && <Button size="small" onClick={proving.cancel}>Cancel</Button>}
                {chain.enabled && proving.phase === 'verified' && !chain.campaign?.closed &&
                  <Button size="small" disabled={p.busy || p.chainOperation?.stage === 'submitted'} onClick={() => chain.finalize(proving.result)}>
                    {p.chainOperation?.stage === 'submitted' ? 'Claim submitted…' : 'Create claim on chain'}
                  </Button>}
              </Actions>
              <Note role="status">{proving.error || ({
                downloading: 'Downloading and checking proving assets…',
                proving: 'Generating Groth16 proof in your browser…',
                verifying: 'Verifying the proof against your saved claim…',
                verified: 'Proof verified locally · no transaction submitted'
              })[proving.phase]}</Note>
            </>
          )}
          <Actions>{chain.enabled
            ? chain.campaign && !chain.campaign.closed && <Button size="small" disabled={p.busy || proving.busy || p.chainOperation?.stage === 'submitted' || p.storageStatus !== 'ready'} onClick={chain.abandon}>Abandon campaign</Button>
            : <Button size="small" disabled={p.busy || proving.busy || p.storageStatus !== 'ready'} onClick={p.reset}>New playtest</Button>}</Actions>
          <Note>{chain.enabled ? 'Chain campaign · encrypted private observations' : 'Local simulation · encrypted on this device'}</Note>
          {selectSupply && <InventorySelectionDialog asteroidId={p.asteroidId} isSourcing
            otherEntity={{ label: Entity.IDS.LOT, id: Lot.toId(p.asteroidId, p.originIndex) }}
            itemIds={[Product.IDS.CORE_DRILL]} requirePresenceOfItemIds
            open={selectSupply} onClose={() => setSelectSupply(false)} onSelected={setSupply} />}
    </Panel>
  );
}
