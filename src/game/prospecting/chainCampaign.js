import { Address, Entity, Lot, Prospecting } from '@influenceth/sdk';

const same = (a, b) => BigInt(a) === BigInt(b);
const active = (campaign) => {
  if (campaign.chainStatus !== Prospecting.Game.CHAIN_STATUSES.ACTIVE) throw new Error('This campaign is closed or replaced.');
};

export function createChainCampaign({ game, provider, read, save, execute, crew, recheck }) {
  const campaign = async (record) => {
    const c = await game.campaign(record.campaignId);
    if (!same(c.context, record.context) || c.qualityBps !== (record.qualityBps || 10000) ||
        !Address.areEqual(c.owner, record.identity.owner) || c.origin !== record.identity.originIndex ||
        c.asteroidId !== record.identity.asteroidId || c.resource !== record.identity.resource ||
        !same(c.crew.id, crew.id)) throw new Error('Saved data does not match this crew’s campaign.');
    return c;
  };
  async function synchronize(verifyHistory = false) {
    let record = read();
    const c = await campaign(record);
    const accepted = c.count + (c.pending ? 1 : 0);
    if (record.actions.length > accepted) throw new Error('Saved samples are ahead of the chain. Recheck the network.');
    if (verifyHistory) {
      const history = Prospecting.replayCampaign(record).history;
      for (const [i, entry] of history.entries()) {
        const core = await game.core(record.campaignId, i);
        const entropy = c.pending && i === accepted - 1 ? await game.randomness(record.campaignId) : core.random;
        if (!same(core.commitment, entry.commitment) || !same(core.meta, entry.meta) ||
            !same(core.blockedApproaches, entry.mask) || !same(entropy, entry.randomness)) {
          throw new Error('A chain sample differs from the saved private transcript.');
        }
      }
    }
    if (c.closed) {
      if (record.chainOperation) await save({ ...record, chainOperation: null });
      return c;
    }
    if (record.chainOperation?.transactionHash) {
      const receipt = await provider.getTransactionReceipt(record.chainOperation.transactionHash);
      if (receipt.execution_status === 'REVERTED') {
        record = { ...record, chainOperation: null };
        await save(record);
      }
    }
    if (accepted > record.actions.length) {
      if (!record.pending || accepted !== record.actions.length + 1) {
        throw new Error('Private sample data is missing. Recover the latest encrypted backup before continuing.');
      }
      const core = await game.core(record.campaignId, record.actions.length);
      const acceptedRecord = Prospecting.acceptSample(record, core);
      if (JSON.stringify(acceptedRecord.pending) !== JSON.stringify(record.pending)) {
        await save(acceptedRecord);
        record = acceptedRecord;
      }
      const block = await provider.getBlock('latest');
      if (Prospecting.isSampleReady(record.pending, { now: Number(block.timestamp), blockNumber: block.block_number })) {
        const entropy = await game.randomness(record.campaignId);
        record = Prospecting.resolveSample(record, entropy, { now: Number(block.timestamp), blockNumber: block.block_number });
        await save(record);
      }
    } else if (record.pending?.stage === 'submitted') {
      const receipt = await provider.getTransactionReceipt(record.pending.transactionHash);
      if (receipt.execution_status === 'REVERTED') {
        await save(Prospecting.retryRejectedSample(record, { transactionHash: record.pending.transactionHash, executionStatus: 'REVERTED' }));
      }
    }
    return c;
  }
  async function submitSavedSample() {
    await synchronize(true);
    let record = read();
    if (record.pending?.stage !== 'prepared') return { status: record.pending ? 'waiting' : 'resolved' };
    const c = await campaign(record);
    active(c);
    const denied = await recheck();
    if (denied) throw new Error(denied);
    const p = record.pending;
    const submission = await execute('ProspectingSample', {
      campaign_id: record.campaignId, lot: { label: Entity.IDS.LOT, id: Lot.toId(record.identity.asteroidId, p.lot) },
      expected_index: p.index, commitment: p.commitment, origin: p.supply.entity, origin_slot: p.supply.slot,
      campaign_origin: c.originLot, caller_crew: crew
    }, { campaignId: record.campaignId });
    if (submission?.status === 'submitted') {
      record = Prospecting.markSubmitted(record, submission.txHash);
      await save(record);
    }
    return submission;
  }
  async function sample(action, lot, supply) {
    await synchronize(true);
    const record = read();
    if (record.pending || record.chainOperation) throw new Error('Resolve the saved action before taking another sample.');
    active(await campaign(record));
    const denied = await recheck();
    if (denied) throw new Error(denied);
    const preview = await game.previewSample(record.campaignId, lot);
    const block = await provider.getBlock('latest');
    const prepared = Prospecting.prepareSample(record, {
      action: { ...action, salt: Prospecting.generateSalt() }, ...preview, preparedAt: Number(block.timestamp)
    });
    prepared.pending.supply = supply;
    await save(prepared);
    return submitSavedSample();
  }
  async function finalize(proof) {
    await synchronize(true);
    let record = read();
    const c = await campaign(record);
    active(c);
    if (record.pending) throw new Error('Wait for the last sample before finalizing.');
    const proofCalldata = await Prospecting.Proof.getVerifierCalldata({ record, ...proof });
    const result = Prospecting.replayCampaign(record).finalized;
    if (!result) throw new Error('Select a productive claim first.');
    record = { ...record, chainOperation: { kind: 'finalize', stage: 'prepared' } };
    await save(record);
    const submission = await execute('ProspectingFinalize', {
      campaign_id: record.campaignId, lot: { label: Entity.IDS.LOT, id: Lot.toId(record.identity.asteroidId, result.lot) },
      quantity: result.quantity, rate_bps: result.rateBps, proof: proofCalldata, caller_crew: crew
    }, { campaignId: record.campaignId });
    if (submission?.status === 'submitted') await save({ ...record,
      chainOperation: { kind: 'finalize', stage: 'submitted', transactionHash: submission.txHash } });
    return submission;
  }
  async function abandon() {
    const record = read();
    active(await campaign(record));
    const prepared = { ...record, chainOperation: { kind: 'abandon', stage: 'prepared' } };
    await save(prepared);
    const submission = await execute('ProspectingAbandon', { campaign_id: record.campaignId, caller_crew: crew },
      { campaignId: record.campaignId });
    if (submission?.status === 'submitted') await save({ ...prepared,
      chainOperation: { kind: 'abandon', stage: 'submitted', transactionHash: submission.txHash } });
    return submission;
  }
  return { synchronize, sample, submitSavedSample, finalize, abandon };
}
