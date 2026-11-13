import { useMemo, useState } from 'react';
import { Asteroid, Crewmate, Extractor, Permission, Product } from '@influenceth/sdk';
import Button from '~/components/ButtonAlt';
import Dropdown from '~/components/Dropdown';
import ResourceThumbnail from '~/components/ResourceThumbnail';
import useCrewContext from '~/hooks/useCrewContext';
import { formatTimer, getCrewAbilityBonuses } from '~/lib/utils';
import actionStage from '~/lib/actionStages';
import {
  ActionDialogBody, ActionDialogFooter, ActionDialogHeader, ActionDialogStats,
  ResourceAmountSlider, Section, SectionBody, SectionTitle
} from '../interface/hud/actionDialogs/components';
import { ExtractionIcon } from '~/components/Icons';
import useLocalCampaigns from './useLocalCampaigns';
import { getMiningOptions, getMiningPreview } from './mining';

export default function MiningPreview({ asteroid, lot, onClose }) {
  const { crew, crewCan } = useCrewContext();
  const saved = useLocalCampaigns(asteroid.id);
  const [selection, setSelection] = useState(null);
  const [amount, setAmount] = useState(1000000);
  const [unlockError, setUnlockError] = useState('');
  const model = useMemo(() => {
    try {
      return { options: getMiningOptions({ asteroid, lot, campaigns: saved.campaigns,
        canUseClaim: (entity) => crewCan(Permission.IDS.USE_DEPOSIT, entity) || entity.PrivateSale?.amount > 0
      }), error: '' };
    } catch (error) { return { options: [], error: error.message }; }
  }, [asteroid, lot, saved.campaigns, crewCan]);
  const option = model.options.find((item) => item.value === selection) || model.options[0];
  const resource = Product.TYPES[option?.resource];
  const calculation = useMemo(() => {
    if (!option) return null;
    try {
      const ability = getCrewAbilityBonuses([Crewmate.ABILITY_IDS.EXTRACTION_TIME], crew);
      const bonus = (ability[Crewmate.ABILITY_IDS.EXTRACTION_TIME]?.totalBonus || 1)
        * Asteroid.Entity.getBonusByResource(asteroid, option.resource).totalBonus;
      const settings = { bonus, timeAcceleration: crew?._timeAcceleration || 24 };
      const { maxQuantity } = getMiningPreview(option, 0, settings);
      const quantity = Math.min(amount, maxQuantity);
      const { quote } = getMiningPreview(option, quantity, settings);
      const legacyTime = option.claim?.kind === 'legacy' && quantity > 0
        ? Extractor.getExtractionTimeReal(quantity * resource.massPerUnit,
          Number(option.claim.remainingYield) * resource.massPerUnit, bonus, settings.timeAcceleration)
        : null;
      return { quantity, maxQuantity, quote, legacyTime };
    } catch (error) { return { error: error.message }; }
  }, [option, amount, asteroid, crew, resource]);
  const quote = calculation?.quote;
  const stats = quote ? [
    { label: 'Extraction Quantity', value: `${(quote.quantity / 1000).toLocaleString()} t`, direction: 0 },
    { label: 'Constant Extraction Rate', value: `${(Number(quote.rateNano) / 1e9 * (crew?._timeAcceleration || 24) * 3.6).toFixed(2)} t / hour`, direction: 0 },
    { label: 'Extraction Time', value: formatTimer(quote.realSeconds), isTimeStat: true, direction: 0 },
    { label: 'On-site Crew Labor', value: formatTimer(quote.crewLaborSeconds), isTimeStat: true, direction: 0 },
    { label: 'Claim Remaining After Run', value: quote.remainingYield === null ? 'Unlimited baseline' : `${(Number(quote.remainingYield) / 1000).toLocaleString()} t`, direction: 0 },
    ...(calculation.legacyTime === null ? [] : [{
      label: 'Current Depletion Formula', value: formatTimer(calculation.legacyTime), isTimeStat: true, direction: 0
    }])
  ] : [];
  return (
    <>
      <ActionDialogHeader action={{ icon: <ExtractionIcon />, label: 'Claim Mining Preview' }}
        actionCrew={crew} location={{ asteroid, lot }} onClose={onClose} stage={actionStage.NOT_STARTED} />
      <ActionDialogBody>
        <Section>
          <SectionTitle>Mining Source</SectionTitle>
          <SectionBody>
            <div>
              <p>Preview only. Quantities are not consumed and no transaction is submitted.</p>
              {saved.locked && <Button size="small" onClick={async () => {
                setUnlockError('');
                try { await saved.unlock(); } catch (error) { setUnlockError(error.message); }
              }}>Unlock campaign claims</Button>}
              {saved.loading && <p role="status">Loading encrypted campaigns…</p>}
              {(saved.error || unlockError || model.error || calculation?.error) &&
                <p role="alert">{saved.error || unlockError || model.error || calculation.error}</p>}
              {model.options.length > 0 ? (
                <Dropdown options={model.options} initialSelection={option?.value} menuZIndex={11000}
                  onChange={(item) => { setSelection(item.value); setAmount(1000000); }} />
              ) : <p>No usable claims or baseline resources on this lot. Trace resources need a campaign claim.</p>}
              <p>Baseline requires at least 5% asteroid-wide abundance and runs at 25% reference rate.
                Legacy claims retain their balances and preview at 120% reference rate.</p>
            </div>
          </SectionBody>
        </Section>
        {resource && calculation && !calculation.error && <Section>
          <SectionTitle>{resource.name} · {option.claim?.kind === 'local' ? 'Local Campaign Claim' : 'Extraction Amount'}</SectionTitle>
          <SectionBody>
            <div>
              <ResourceThumbnail resource={resource} size="56px" />
              <ResourceAmountSlider amount={calculation.quantity} extractionTime={quote?.realSeconds || 0}
                min={0} max={calculation.maxQuantity} resource={resource} setAmount={setAmount} />
              <p>The extractor must be on the claim lot. Times include crew and asteroid extraction bonuses;
                travel and output transport are excluded from this preview.</p>
            </div>
          </SectionBody>
        </Section>}
        <ActionDialogStats stage={actionStage.NOT_STARTED} stats={stats} />
      </ActionDialogBody>
      <ActionDialogFooter stage={actionStage.NOT_STARTED} onClose={onClose}
        goLabel="Contracts pending" disabled />
    </>
  );
}
