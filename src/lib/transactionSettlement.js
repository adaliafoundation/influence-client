// Completion is emitted by the same store action that clears the In Progress
// transaction, after indexed data has refreshed. A receipt alone is insufficient.
const listeners = new Set();
export const notifyTransactionSettlement = (txHash, status) => {
  listeners.forEach(listener => listener(txHash, status));
};

export const observeTransactionSettlement = () => {
  const outcomes = new Map();
  let target;
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  const dispose = () => {
    listeners.delete(listener);
    resolve({ status: 'dismissed' });
  };
  const listener = (hash, status) => {
    outcomes.set(hash, status);
    if (hash === target) {
      listeners.delete(listener);
      resolve({ status, txHash: hash });
    }
  };
  listeners.add(listener);
  return {
    waitFor(txHash) {
      target = txHash;
      if (outcomes.has(txHash)) listener(txHash, outcomes.get(txHash));
      return promise;
    },
    dispose
  };
};
