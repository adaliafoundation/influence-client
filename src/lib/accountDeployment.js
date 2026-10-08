import { cleanseTxHash } from '~/lib/utils';

const isContractNotFound = error => Number(error?.code) === 20 || /Contract not found/i.test(error?.message || '');
const isReverted = receipt => receipt?.execution_status === 'REVERTED';

// Keep submitted hashes across retries, including when receipt polling times out.
export const createAccountDeployment = () => {
  const deployments = new Map();

  return ({ chainId, address, account, provider, deploymentData, refreshSession, assertCurrent }) => {
    const key = `${chainId}:${BigInt(address).toString(16)}`;
    let deployment = deployments.get(key);
    if (!deployment) {
      deployment = {};
      deployments.set(key, deployment);
    }
    if (deployment.inFlight) return deployment.inFlight;

    deployment.inFlight = (async () => {
      assertCurrent();
      let deployed = false;
      try {
        await provider.getClassAt(address);
        deployed = true;
      } catch (error) {
        if (!isContractNotFound(error)) throw error;
      }
      assertCurrent();

      if (!deployed) {
        if (deployment.unknownSubmission) throw deployment.unknownSubmission;
        if (!deployment.transaction) {
          if (!deploymentData) throw new Error('Missing account deployment data.');
          try {
            deployment.transaction = await account.executePaymasterTransaction([], {
              feeMode: { mode: 'sponsored' },
              deploymentData
            });
          } catch (error) {
            // A lost execution response can hide a successful submission. Only recheck chain state.
            if (error?.paymasterMethod === 'paymaster_executeTransaction'
              && (!error.status || error.status >= 500)) deployment.unknownSubmission = error;
            throw error;
          }
          if (!deployment.transaction?.transaction_hash && !deployment.transaction?.transactionHash) {
            deployment.unknownSubmission = new Error('Account deployment returned no transaction hash.');
            throw deployment.unknownSubmission;
          }
        }

        assertCurrent();
        let receipt;
        try {
          receipt = await provider.waitForTransaction(cleanseTxHash(deployment.transaction), { retryInterval: 5000 });
        } catch (error) {
          if (isReverted(error) || isReverted(error.receipt)) deployment.transaction = null;
          throw error;
        }
        if (isReverted(receipt)) {
          deployment.transaction = null;
          throw new Error('Account deployment reverted.');
        }
        if (receipt?.execution_status !== 'SUCCEEDED') throw new Error('Account deployment is not confirmed yet.');
      }

      assertCurrent();
      await refreshSession();
      assertCurrent();
      return { deployed: true, transaction: deployment.transaction || null };
    })().finally(() => { deployment.inFlight = null; });

    return deployment.inFlight;
  };
};
