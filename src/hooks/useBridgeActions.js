import { reportFailure } from '../lib/errorReporting';
import { errorMessages } from '../lib/errorMessages';
import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { num } from 'starknet';
import { readContract, writeContract } from 'wagmi/actions';
import { formatUnits, parseUnits } from 'viem';
import { useAccount, useChainId, useConfig, usePublicClient, useSwitchChain } from 'wagmi';
import { ethereumContracts } from '@influenceth/sdk';

import { configuredChain } from '~/contexts/WagmiContext';
import { bridgeNetwork, getBridgeAssetConfig, getConfig, isBridgeAssetConfigured } from '~/bridge/assets';
import { getBridgeBatchError } from '~/bridge/limits';
import useSession from '~/hooks/useSession';
import useStore from '~/hooks/useStore';

const toBridgeAmount = (amount) => parseUnits(`${amount || 0}`, 6);
const fromBridgeAmount = (amount) => formatUnits(BigInt(amount || 0), 6);

const cleanseTxHash = (tx) => tx?.transaction_hash || tx?.hash || tx;

const formatError = (error, fallback) => {
  if (typeof error === 'string') return error;
  return error?.shortMessage || error?.message || fallback;
};

const notifyBridge = (createAlert, content) => createAlert({
  type: 'GenericAlert',
  data: { content },
  duration: 5000
});

const toU256Parts = (value) => {
  const amount = BigInt(value || 0);
  const mask = (1n << 128n) - 1n;
  return [amount & mask, amount >> 128n];
};

const getOverallFee = (estimate) => BigInt(estimate?.overall_fee || estimate?.overallFee || 0);

const startTransferTracking = (promise) => {
  promise.catch(() => {});
};

const executeStarknetCall = (walletAccount, contractAddress, entrypoint, calldata) => (
  walletAccount.execute([{
    contractAddress,
    entrypoint,
    calldata: calldata.map((value) => num.toHex(value))
  }])
);

const serializeBridgeFromL1Payload = ({ accountAddress, config, ethereumAddress, tokenIds }) => {
  const handler = config.starknetAssetContract.find((item) => item.name === 'bridge_from_l1');
  return handler.inputs.slice(1).flatMap((input) => {
    if (input.name === 'to_address') return [accountAddress];
    if (input.name === 'sender') return [ethereumAddress];
    if (input.name === 'token_ids') return [tokenIds.length, ...tokenIds];
    return [];
  });
};

const useBridgeActions = () => {
  const queryClient = useQueryClient();
  const wagmiConfig = useConfig();
  const publicClient = usePublicClient();
  const { address: ethereumAddress, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { accountAddress, login, provider: starknetProvider, walletAccount } = useSession();

  const createAlert = useStore(s => s.dispatchAlertLogged);
  const logBridgeTransfer = useStore(s => s.dispatchBridgeTransferLogged);
  const updateBridgeTransfer = useStore(s => s.dispatchBridgeTransferUpdated);

  const [busyKey, setBusyKey] = useState();
  const [swayDepositStatus, setSwayDepositStatus] = useState();
  const [claimedAsteroidIds, setClaimedAsteroidIds] = useState([]);

  const ensureEthereumReady = useCallback(async () => {
    if (!isConnected || !ethereumAddress) {
      notifyBridge(createAlert, errorMessages.connection);
      return false;
    }
    if (chainId !== configuredChain.id) {
      await switchChainAsync({ chainId: configuredChain.id });
    }
    return true;
  }, [chainId, createAlert, ethereumAddress, isConnected, switchChainAsync]);

  const ensureStarknetReady = useCallback(() => {
    if (!accountAddress) {
      login();
      return false;
    }
    if (!walletAccount) {
      notifyBridge(createAlert, errorMessages.connection);
      return false;
    }
    return true;
  }, [accountAddress, createAlert, login, walletAccount]);

  const trackEthereumTx = useCallback(async ({ hash, transfer }) => {
    const waitingStatus = transfer.waitingStatus;
    logBridgeTransfer({ id: hash, txHash: hash, layer: 'l1', network: bridgeNetwork, ...transfer });
    try {
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === 'reverted') throw new Error('Ethereum transaction reverted.');
      updateBridgeTransfer(hash, { status: waitingStatus || 'confirmed' });
      return hash;
    } catch (e) {
      updateBridgeTransfer(hash, { status: 'failed', error: formatError(e, 'Ethereum transaction failed.') });
      throw e;
    }
  }, [logBridgeTransfer, publicClient, updateBridgeTransfer]);

  const trackStarknetTx = useCallback(async ({ txHash, transfer, waitForL1 = false }) => {
    logBridgeTransfer({ id: txHash, txHash, layer: 'l2', network: bridgeNetwork, ...transfer });
    try {
      await starknetProvider.waitForTransaction(txHash, { retryInterval: 5e3 });
      updateBridgeTransfer(txHash, { status: waitForL1 ? 'waiting_l1' : 'confirmed' });
      return txHash;
    } catch (e) {
      updateBridgeTransfer(txHash, { status: 'failed', error: formatError(e, 'Starknet transaction failed.') });
      throw e;
    }
  }, [logBridgeTransfer, starknetProvider, updateBridgeTransfer]);

  const bridgeAssetsToStarknet = useCallback(async ({ assetType, assets }) => {
    const batchError = getBridgeBatchError(assets.length);
    if (batchError) {
      notifyBridge(createAlert, batchError);
      return null;
    }
    if (!accountAddress) {
      login();
      return null;
    }
    if (!isBridgeAssetConfigured(assetType)) {
      notifyBridge(createAlert, errorMessages.serviceUnavailable);
      return null;
    }
    if (!(await ensureEthereumReady())) return null;

    const config = getBridgeAssetConfig(assetType);
    const assetIds = assets.map((asset) => Number(asset.id));

    setBusyKey(`l1-${assetType}`);
    try {
      let messageAssetIds = assetIds;
      if (assetType === 'crewmates' && getConfig('Ethereum.Address.crewmateFeatures')) {
        const features = await Promise.all(assets.map((asset) => {
          const collection = asset.Crewmate?.coll ?? asset.coll;
          return collection < 4
            ? readContract(wagmiConfig, {
              address: getConfig('Ethereum.Address.crewmateFeatures'),
              abi: ethereumContracts.CrewFeatures,
              functionName: 'getFeatures',
              args: [BigInt(asset.id)]
            })
            : 0n;
        }));
        messageAssetIds = assets.reduce((acc, asset, index) => [
          ...acc,
          Number(asset.id),
          features[index].toString()
        ], []);
      }

      const messageFee = await starknetProvider.estimateMessageFee({
        from_address: config.ethereumBridgeAddress,
        to_address: config.starknetAssetAddress,
        entry_point_selector: 'bridge_from_l1',
        payload: serializeBridgeFromL1Payload({
          accountAddress,
          config,
          ethereumAddress,
          tokenIds: messageAssetIds
        })
      }, 'latest');

      const hash = await writeContract(wagmiConfig, {
        address: config.ethereumBridgeAddress,
        abi: config.ethereumBridgeContract,
        functionName: 'bridgeToStarknet',
        args: [assetIds.map(BigInt), BigInt(accountAddress)],
        value: getOverallFee(messageFee)
      });
      notifyBridge(createAlert, 'Bridge transaction submitted.');
      startTransferTracking(trackEthereumTx({
        hash,
        transfer: {
          assetType,
          assetIds,
          direction: 'l1_to_l2',
          fromAddress: ethereumAddress,
          originChain: 'ethereum',
          toAddress: accountAddress,
          status: 'submitted',
          waitingStatus: 'waiting_l2'
        }
      }));
      return hash;
    } catch (e) {
      console.warn(errorMessages.bridgeFailed, e);
      reportFailure(createAlert, e, { message: 'bridgeFailed' });
      return null;
    } finally {
      setBusyKey();
    }
  }, [
    accountAddress,
    createAlert,
    ensureEthereumReady,
    ethereumAddress,
    login,
    starknetProvider,
    trackEthereumTx,
    wagmiConfig
  ]);

  const bridgeAssetsToEthereum = useCallback(async ({ assetType, assets }) => {
    const batchError = getBridgeBatchError(assets.length);
    if (batchError) {
      notifyBridge(createAlert, batchError);
      return null;
    }
    if (!ensureStarknetReady()) return null;
    if (!isBridgeAssetConfigured(assetType)) {
      notifyBridge(createAlert, errorMessages.serviceUnavailable);
      return null;
    }
    if (!(await ensureEthereumReady())) return null;

    const config = getBridgeAssetConfig(assetType);
    const assetIds = assets.map((asset) => Number(asset.id));

    setBusyKey(`l2-${assetType}`);
    try {
      const tx = await executeStarknetCall(
        walletAccount,
        config.starknetAssetAddress,
        'bridge_to_l1',
        [ethereumAddress, assetIds.length.toString(), ...assetIds.map(String)]
      );
      const txHash = cleanseTxHash(tx);
      notifyBridge(createAlert, 'Bridge transaction submitted.');
      startTransferTracking(trackStarknetTx({
        txHash,
        waitForL1: true,
        transfer: {
          assetType,
          assetIds,
          direction: 'l2_to_l1',
          fromAddress: accountAddress,
          originChain: 'starknet',
          toAddress: ethereumAddress,
          status: 'submitted'
        }
      }));
      return txHash;
    } catch (e) {
      console.warn(errorMessages.bridgeFailed, e);
      reportFailure(createAlert, e, { message: 'bridgeFailed' });
      return null;
    } finally {
      setBusyKey();
    }
  }, [
    accountAddress,
    createAlert,
    ensureEthereumReady,
    ensureStarknetReady,
    ethereumAddress,
    trackStarknetTx,
    walletAccount
  ]);

  const receiveAssetsOnEthereum = useCallback(async ({ assetType, assetIds, fromAddress }) => {
    if (!(await ensureEthereumReady())) return null;

    const config = getBridgeAssetConfig(assetType);
    if (!config?.ethereumBridgeAddress) return null;

    setBusyKey(`receive-${assetType}`);
    try {
      const hash = await writeContract(wagmiConfig, {
        address: config.ethereumBridgeAddress,
        abi: config.ethereumBridgeContract,
        functionName: 'bridgeFromStarknet',
        args: [assetIds.map(BigInt), BigInt(fromAddress || accountAddress)]
      });
      notifyBridge(createAlert, 'Receive transaction submitted.');
      await trackEthereumTx({
        hash,
        transfer: {
          assetType,
          assetIds,
          direction: 'receive_l1',
          displayChain: 'ethereum',
          fromAddress: fromAddress || accountAddress,
          originChain: 'starknet',
          toAddress: ethereumAddress,
          status: 'submitted',
          waitingStatus: 'complete'
        }
      });
      notifyBridge(createAlert, 'Assets received on Ethereum.');
      queryClient.invalidateQueries({ queryKey: ['bridgeAssets'] });
      queryClient.invalidateQueries({ queryKey: ['bridgeCrossings'] });
      return hash;
    } catch (e) {
      console.warn(errorMessages.bridgeFailed, e);
      reportFailure(createAlert, e, { message: 'bridgeFailed' });
      return null;
    } finally {
      setBusyKey();
    }
  }, [accountAddress, createAlert, ensureEthereumReady, ethereumAddress, queryClient, trackEthereumTx, wagmiConfig]);

  const mintCrewFromAsteroid = useCallback(async (asteroidId) => {
    if (!(await ensureEthereumReady())) return null;
    if (!getConfig('Ethereum.Address.arvadCrewmateSale')) {
      notifyBridge(createAlert, errorMessages.serviceUnavailable);
      return null;
    }

    setBusyKey(`mint-${asteroidId}`);
    try {
      const request = {
        account: ethereumAddress,
        address: getConfig('Ethereum.Address.arvadCrewmateSale'),
        abi: ethereumContracts.ArvadCrewSale,
        functionName: 'mintCrewWithAsteroid',
        args: [BigInt(asteroidId)]
      };
      // A failed estimate must stop here, before MetaMask substitutes a block-sized fallback.
      const estimatedGas = await publicClient.estimateContractGas(request);
      const gas = (estimatedGas * 120n + 99n) / 100n;
      const hash = await writeContract(wagmiConfig, { ...request, gas });
      notifyBridge(createAlert, 'Crewmate mint transaction submitted.');
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === 'reverted') throw new Error('Ethereum transaction reverted.');
      setClaimedAsteroidIds((ids) => [...new Set([...ids, Number(asteroidId)])]);
      queryClient.invalidateQueries({ queryKey: ['bridgeAssets'] });
      notifyBridge(createAlert, 'Crewmate minted.');
      return hash;
    } catch (e) {
      const revert = e.walk?.((cause) => cause?.name === 'ContractFunctionRevertedError');
      const reason = revert?.name === 'ContractFunctionRevertedError' ? revert.reason : undefined;
      if (reason === 'ArvadCrewSale: asteroid has already been used to mint crew') {
        setClaimedAsteroidIds((ids) => [...new Set([...ids, Number(asteroidId)])]);
      }
      reportFailure((alert) => createAlert({
        ...alert,
        data: { ...alert.data, content: reason || alert.data.content }
      }), e, { message: 'actionFailed', context: { action: 'MintCrewmate', asteroidId } });
      return null;
    } finally {
      setBusyKey();
    }
  }, [createAlert, ensureEthereumReady, ethereumAddress, publicClient, queryClient, wagmiConfig]);

  const bridgeSwayToStarknet = useCallback(async (amount) => {
    if (!accountAddress) {
      login();
      return null;
    }
    if (!(await ensureEthereumReady())) return null;

    const tokenAddress = getConfig('Ethereum.Address.swayToken');
    const bridgeAddress = getConfig('Ethereum.Address.swayBridge');
    if (!(tokenAddress && bridgeAddress && getConfig('Starknet.Address.swayToken'))) {
      notifyBridge(createAlert, errorMessages.serviceUnavailable);
      return null;
    }

    setBusyKey('sway-l1');
    setSwayDepositStatus('Checking SWAY approval…');
    try {
      const bridgeAmount = toBridgeAmount(amount);
      const allowance = await readContract(wagmiConfig, {
        address: tokenAddress,
        abi: ethereumContracts.SwayToken,
        functionName: 'allowance',
        args: [ethereumAddress, bridgeAddress]
      });
      if (allowance < bridgeAmount) {
        setSwayDepositStatus('Approve SWAY spending in your Ethereum wallet.');
        const approveHash = await writeContract(wagmiConfig, {
          address: tokenAddress,
          abi: ethereumContracts.SwayToken,
          functionName: 'approve',
          args: [bridgeAddress, bridgeAmount]
        });
        setSwayDepositStatus('Waiting for approval confirmation…');
        const receipt = await publicClient.waitForTransactionReceipt({ hash: approveHash });
        if (receipt.status === 'reverted') throw new Error('SWAY approval transaction reverted.');
      }

      setSwayDepositStatus(allowance < bridgeAmount
        ? 'Approval confirmed. Preparing the bridge transaction…'
        : 'SWAY is approved. Preparing the bridge transaction…');
      const [amountLow, amountHigh] = toU256Parts(bridgeAmount);
      const messageFee = await starknetProvider.estimateMessageFee({
        from_address: bridgeAddress,
        to_address: getConfig('Starknet.Address.swayToken'),
        entry_point_selector: 'handle_deposit',
        payload: [accountAddress, amountLow.toString(), amountHigh.toString(), ethereumAddress]
      }, 'latest');

      setSwayDepositStatus('Confirm the bridge transaction in your Ethereum wallet.');
      const hash = await writeContract(wagmiConfig, {
        address: bridgeAddress,
        abi: ethereumContracts.SwayBridge,
        functionName: 'deposit',
        args: [bridgeAmount, BigInt(accountAddress)],
        value: getOverallFee(messageFee)
      });
      notifyBridge(createAlert, 'SWAY bridge transaction submitted.');
      startTransferTracking(trackEthereumTx({
        hash,
        transfer: {
          assetType: 'sway',
          amount: fromBridgeAmount(bridgeAmount),
          direction: 'l1_to_l2',
          fromAddress: ethereumAddress,
          originChain: 'ethereum',
          toAddress: accountAddress,
          status: 'submitted',
          waitingStatus: 'waiting_l2'
        }
      }));
      return hash;
    } catch (e) {
      console.warn(errorMessages.bridgeFailed, e);
      reportFailure(createAlert, e, { message: 'bridgeFailed' });
      return null;
    } finally {
      setSwayDepositStatus();
      setBusyKey();
    }
  }, [
    accountAddress,
    createAlert,
    ensureEthereumReady,
    ethereumAddress,
    login,
    publicClient,
    starknetProvider,
    trackEthereumTx,
    wagmiConfig
  ]);

  const bridgeSwayToEthereum = useCallback(async (amount) => {
    if (!ensureStarknetReady()) return null;
    if (!(await ensureEthereumReady())) return null;
    if (!getConfig('Starknet.Address.swayToken')) {
      notifyBridge(createAlert, errorMessages.serviceUnavailable);
      return null;
    }

    setBusyKey('sway-l2');
    try {
      const bridgeAmount = toBridgeAmount(amount);
      const [amountLow, amountHigh] = toU256Parts(bridgeAmount);
      const tx = await executeStarknetCall(
        walletAccount,
        getConfig('Starknet.Address.swayToken'),
        'initiate_withdrawal',
        [ethereumAddress, amountLow.toString(), amountHigh.toString()]
      );
      const txHash = cleanseTxHash(tx);
      notifyBridge(createAlert, 'SWAY withdrawal submitted.');
      startTransferTracking(trackStarknetTx({
        txHash,
        waitForL1: true,
        transfer: {
          assetType: 'sway',
          amount: fromBridgeAmount(bridgeAmount),
          direction: 'l2_to_l1',
          fromAddress: accountAddress,
          originChain: 'starknet',
          toAddress: ethereumAddress,
          status: 'submitted'
        }
      }));
      return txHash;
    } catch (e) {
      console.warn(errorMessages.bridgeFailed, e);
      reportFailure(createAlert, e, { message: 'bridgeFailed' });
      return null;
    } finally {
      setBusyKey();
    }
  }, [
    accountAddress,
    createAlert,
    ensureEthereumReady,
    ensureStarknetReady,
    ethereumAddress,
    trackStarknetTx,
    walletAccount
  ]);

  const receiveSwayOnEthereum = useCallback(async ({ amount }) => {
    if (!(await ensureEthereumReady())) return null;

    setBusyKey('sway-receive');
    try {
      const hash = await writeContract(wagmiConfig, {
        address: getConfig('Ethereum.Address.swayBridge'),
        abi: ethereumContracts.SwayBridge,
        functionName: 'withdraw',
        args: [BigInt(amount), ethereumAddress]
      });
      notifyBridge(createAlert, 'SWAY receive transaction submitted.');
      await trackEthereumTx({
        hash,
        transfer: {
          assetType: 'sway',
          amount: fromBridgeAmount(amount),
          direction: 'receive_l1',
          fromAddress: accountAddress,
          originChain: 'starknet',
          toAddress: ethereumAddress,
          status: 'submitted',
          waitingStatus: 'complete'
        }
      });
      notifyBridge(createAlert, 'SWAY received on Ethereum.');
      queryClient.invalidateQueries({ queryKey: ['balance'] });
      queryClient.invalidateQueries({ queryKey: ['bridgeSwayCrossings'] });
      return hash;
    } catch (e) {
      console.warn(errorMessages.bridgeFailed, e);
      reportFailure(createAlert, e, { message: 'bridgeFailed' });
      return null;
    } finally {
      setBusyKey();
    }
  }, [accountAddress, createAlert, ensureEthereumReady, ethereumAddress, queryClient, trackEthereumTx, wagmiConfig]);

  return useMemo(() => ({
    bridgeAssetsToEthereum,
    bridgeAssetsToStarknet,
    bridgeSwayToEthereum,
    bridgeSwayToStarknet,
    busyKey,
    claimedAsteroidIds,
    swayDepositStatus,
    mintCrewFromAsteroid,
    receiveAssetsOnEthereum,
    receiveSwayOnEthereum,
  }), [
    bridgeAssetsToEthereum,
    bridgeAssetsToStarknet,
    bridgeSwayToEthereum,
    bridgeSwayToStarknet,
    busyKey,
    claimedAsteroidIds,
    swayDepositStatus,
    mintCrewFromAsteroid,
    receiveAssetsOnEthereum,
    receiveSwayOnEthereum,
  ]);
};

export default useBridgeActions;
