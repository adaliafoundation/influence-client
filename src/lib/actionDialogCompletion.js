// Most actions are finished with this dialog once their transaction is indexed.
// These workflows deliberately retain a next step or a results screen.
export const actionDialogCompletion = (type, transactionKey) => {
  if (type === 'PLAN_BUILDING') return 'construct';
  if (['TRANSFER_TO_SITE', 'DECONSTRUCT'].includes(type)) return 'stay';
  if (['NEW_CORE_SAMPLE', 'IMPROVE_CORE_SAMPLE'].includes(type) && transactionKey === 'SampleDepositFinish') return 'stay';
  return 'close';
};
