import { actionDialogCompletion } from './actionDialogCompletion';

test('single-step actions close, workflows advance or retain their results', () => {
  expect(actionDialogCompletion('PLAN_BUILDING', 'ConstructionPlan')).toBe('construct');
  expect(actionDialogCompletion('TRANSFER_TO_SITE', 'SendDelivery')).toBe('stay');
  expect(actionDialogCompletion('DECONSTRUCT', 'ConstructionDeconstruct')).toBe('stay');
  for (const type of ['NEW_CORE_SAMPLE', 'IMPROVE_CORE_SAMPLE']) {
    expect(actionDialogCompletion(type, 'SampleDepositStart')).toBe('close');
    expect(actionDialogCompletion(type, 'SampleDepositFinish')).toBe('stay');
  }
  for (const type of ['SURFACE_TRANSFER', 'MANAGE_CREW', 'DELEGATE_CREW', 'REPO_BUILDING', 'START_LOT_LEASE_AUCTION', 'SHOPPING_LIST', 'CLAIM_ARRIVAL_REWARD']) {
    expect(actionDialogCompletion(type, 'Submit')).toBe('close');
  }
});
