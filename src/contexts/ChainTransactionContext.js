import { FALLBACK_FEE_TOKENS, getFallbackFeeTokens } from '../lib/feePreferences';
import { createAccountDeployment } from '../lib/accountDeployment';
import { errorMessages } from '../lib/errorMessages';
import { createFundingError, isUserCancellation, reportFailure } from '../lib/errorReporting';
import { deliveryPaymentTransfers } from '~/lib/deliveryAuthorization';
import { recheckTransactionAuthorization } from '~/lib/transactionAuthorization';
import { observeNativeMissionCall } from '~/lib/missionObservation';
import { assertColonizationMissionOperation, colonizationMissionsQueryKey } from '~/lib/colonizationMissions';
import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Address, Asteroid, Entity, Order, Permission, System } from '@influenceth/sdk';
import { isEqual, get } from 'lodash';
import { useQueryClient } from '@tanstack/react-query';
import { hash, num, shortString, uint256 } from 'starknet';

import { appConfig } from '~/appConfig';
import TransactionFeePrompt from '~/components/TransactionFeePrompt';
import useActivitiesContext from '~/hooks/useActivitiesContext';
import useCrewContext from '~/hooks/useCrewContext';
import useSession from '~/hooks/useSession';
import useSimulationEnabled from '~/hooks/useSimulationEnabled';
import useStore from '~/hooks/useStore';
import useWalletCrews from '~/hooks/useWalletCrews';
import useWalletPurchasableBalances from '~/hooks/useWalletPurchasableBalances';
import { useSwayBalance, useUSDCBalance } from '~/hooks/useWalletTokenBalance';
import api from '~/lib/api';
import { executePaidTransaction, preparePaidTransactionFee, executeReviewedTransaction } from '~/lib/transactionFees';
import { getCancellationRefund } from '~/lib/escrow';
import { createUserPaidAccount, isPaymasterUnavailable, isSponsorshipUnavailable } from '~/lib/paymaster';
import {
  MISSION_SYSTEMS,
  assertStarterMissionOperation, getMissionCompletionCalls,
  findPendingMissionTransaction, getMissionAssignmentKey, starterMissionsQueryKey
} from '~/lib/starterMissions';
import { cleanseTxHash, safeBigInt } from '~/lib/utils';
import { TOKEN } from '~/lib/priceUtils';
import { isWalletAccountLocked } from '~/lib/walletLock';
import { isWalletRequestTimeout } from '../lib/walletErrors';
import { getWalletLabel } from '~/lib/wallets';

const RETRY_INTERVAL = 5e3; // 5 seconds
const ChainTransactionContext = createContext();
const EXPLICIT_AUTHORIZATION_PRIMARY_TYPE = 'InfluenceTransactionAuthorization';

// TODO: equalityTest default of 'i' doesn't make sense anymore

// TODO: move systems into their own util file (like activities)

// supported configs:
//  confirms, equalityTest

// TODO: when equalityTest is ['callerCrew.id'], can't it just be `true`?
const missionEquality = ['assignment.campaign', 'assignment.subject.label', 'assignment.subject.id', 'assignment.mission'];
const customConfigs = {
  AcceptMission: { equalityTest: missionEquality, isUnblockable: true },
  ClaimMissionReward: { equalityTest: missionEquality, isUnblockable: true },
  MissionValidate: { equalityTest: missionEquality, isUnblockable: true },
  CompleteMission: {
    equalityTest: missionEquality,
    isUnblockable: true,
    isVirtual: true,
    multisystemCalls: getMissionCompletionCalls
  },
  // customization of Systems configs from sdk
  AcceptDelivery: {
    equalityTest: ['delivery.id'],
    getTransferConfig: deliveryPaymentTransfers
  },
  AcceptPrepaidAgreement: {
    equalityTest: ['target.id', 'target.label', 'permission'],
    getTransferConfig: ({ auctionPayment, isStarterLotLease, recipient, permission, permitted, target, termPrice }) => {
      const transfers = [];

      if (auctionPayment?.toController > 0n && auctionPayment?.controllerRecipient && auctionPayment?.previousTenant) {
        transfers.push({
          amount: safeBigInt(auctionPayment.toController),
          recipient: auctionPayment.controllerRecipient,
          memo: Permission.getAuctionControllerMemo(target, permission, auctionPayment.previousTenant)
        });
      }

      if (auctionPayment?.toBuildingController > 0n && auctionPayment?.buildingControllerRecipient && auctionPayment?.previousTenant) {
        transfers.push({
          amount: safeBigInt(auctionPayment.toBuildingController),
          recipient: auctionPayment.buildingControllerRecipient,
          memo: Permission.getAuctionBuildingMemo(target, permission, auctionPayment.previousTenant)
        });
      }

      if (!isStarterLotLease) {
        transfers.push({
          amount: safeBigInt(termPrice),
          recipient,
          memo: Permission.getPrepaidAgreementMemo(target, permission, permitted)
        });
      }

      return transfers;
    }
  },
  AnnotateEvent: {
    equalityTest: ['transaction_hash', 'log_index'],
  },
  DirectMessage: {
    equalityTest: ['recipient'],
  },
  DelegateCrew: {
    equalityTest: ['caller_crew.id'],
  },
  CancelPrepaidAgreement: {
    equalityTest: ['target.id', 'target.label', 'permission'],
    getTransferConfig: ({ agreementPath, refundAmount, recipient }) => ({
      amount: safeBigInt(refundAmount),
      recipient,
      memo: (agreementPath || '').split('.')
    })
  },
  ExtendPrepaidAgreement: {
    equalityTest: ['target.id', 'target.label', 'permission'],
    getTransferConfig: ({ recipient, permission, permitted, target, termPrice }) => ({
      amount: safeBigInt(termPrice),
      recipient,
      memo: Permission.getPrepaidAgreementMemo(target, permission, permitted)
    })
  },
  TransferPrepaidAgreement: {
    equalityTest: ['target.id', 'target.label', 'permission'],
  },
  ArrangeCrew: { equalityTest: ['caller_crew.id'] },

  AssembleShipStart: { equalityTest: ['dry_dock.id', 'dry_dock_slot'] },
  AssembleShipFinish: { equalityTest: ['dry_dock.id', 'dry_dock_slot'] },

  ChangeName: { equalityTest: ['entity.id', 'entity.label'] },
  ConfigureExchange: { equalityTest: ['exchange.id'] },
  ConfigurePrepaidAuction: { equalityTest: ['asteroid.id'] },

  ConstructionAbandon: { equalityTest: ['building.id'] },
  ConstructionDeconstruct: { equalityTest: ['building.id'] },
  ConstructionFinish: { equalityTest: ['building.id'] },
  ConstructionPlan: { equalityTest: ['lot.id'] },
  ConstructionStart: { equalityTest: ['building.id'] },

  ExtractResourceStart: { equalityTest: ['extractor.id', 'extractor_slot'] },
  ExtractResourceFinish: { equalityTest: ['extractor.id', 'extractor_slot'] },

  ProcessProductsStart: { equalityTest: ['processor.id', 'processor_slot'] },
  ProcessProductsFinish: { equalityTest: ['processor.id', 'processor_slot'] },

  ListDepositForSale: { equalityTest: ['deposit.id'] },
  UnlistDepositForSale: { equalityTest: ['deposit.id'] },

  SampleDepositFinish: { equalityTest: ['deposit.id'] },
  SampleDepositImprove: { equalityTest: ['deposit.id'] },
  SampleDepositStart: { equalityTest: ['lot.id', 'caller_crew.id'] },

  ExchangeCrew: { equalityTest: true },
  DumpDelivery: { equalityTest: ['origin.id', 'origin.label'] },
  InitializeAsteroid: {
    preprocess: ({ asteroid }) => ({
      asteroid,
      celestial_type: safeBigInt(asteroid.Celestial.celestialType),
      mass: safeBigInt(Asteroid.Entity.getMass(asteroid)) * 2n ** 64n,
      radius: safeBigInt(asteroid.Celestial.radius * 1000) * 2n ** 32n / 1000n,
      a: safeBigInt(asteroid.Orbit.a * 10000) * 2n ** 64n / 10000n,
      ecc: safeBigInt(asteroid.Orbit.ecc * 1000) * 2n ** 64n / 1000n,
      inc: safeBigInt(asteroid.Orbit.inc * 2 ** 64),
      raan: safeBigInt(asteroid.Orbit.raan * 2 ** 64),
      argp: safeBigInt(asteroid.Orbit.argp * 2 ** 64),
      m: safeBigInt(asteroid.Orbit.m * 2 ** 64),
      purchase_order: asteroid.Celestial.purchaseOrder,
      scan_status: asteroid.Celestial.scanStatus,
      bonuses: asteroid.Celestial.bonuses,
      merkle_proof: asteroid.AsteroidProof?.proof || []
    }),
    equalityTest: ['asteroid.id']
  },
  ManageAsteroid: { equalityTest: ['asteroid.id'] },
  PurchaseAdalian: {
    getPrice: async () => {
      const { ADALIAN_PURCHASE_PRICE, ADALIAN_PURCHASE_TOKEN } = await api.getConstants(['ADALIAN_PURCHASE_PRICE', 'ADALIAN_PURCHASE_TOKEN']);
      return [safeBigInt(ADALIAN_PURCHASE_PRICE), Address.toStandard(ADALIAN_PURCHASE_TOKEN)];
    },
    equalityTest: true
  },
  PurchaseAsteroid: {
    getPrice: async ({ asteroid }) => {
      const { ASTEROID_PURCHASE_BASE_PRICE, ASTEROID_PURCHASE_LOT_PRICE, ASTEROID_PURCHASE_TOKEN } = await api.getConstants([
        'ASTEROID_PURCHASE_BASE_PRICE',
        'ASTEROID_PURCHASE_LOT_PRICE',
        'ASTEROID_PURCHASE_TOKEN'
      ]);
      const base = safeBigInt(ASTEROID_PURCHASE_BASE_PRICE);
      const lot = safeBigInt(ASTEROID_PURCHASE_LOT_PRICE);
      return [base + lot * safeBigInt(Asteroid.Entity.getSurfaceArea(asteroid)), Address.toStandard(ASTEROID_PURCHASE_TOKEN)];
    },
    equalityTest: ['asteroid.id']
  },
  PurchaseDeposit: {
    getTransferConfig: ({ recipient, deposit, price }) => ({
      amount: safeBigInt(price),
      recipient,
      memo: Entity.packEntity(deposit)
    }),
    equalityTest: ['deposit.id']
  },
  InitializeArvadian: { equalityTest: true },
  RecruitAdalian: {
    getPrice: async ({ crewmate }) => {
      if (crewmate?.id > 0) return [0n, TOKEN.USDC]; // if recruiting existing crewmate, no cost
      const { ADALIAN_PURCHASE_PRICE, ADALIAN_PURCHASE_TOKEN } = await api.getConstants(['ADALIAN_PURCHASE_PRICE', 'ADALIAN_PURCHASE_TOKEN']);
      return [safeBigInt(ADALIAN_PURCHASE_PRICE), Address.toStandard(ADALIAN_PURCHASE_TOKEN)];
    },
    equalityTest: true
  },
  RekeyInbox: {
    equalityTest: true,
  },
  ResolveRandomEvent: {
    equalityTest: true
  },
  ResupplyFood: {
    equalityTest: ['caller_crew.id']
  },
  StationCrew: {
    equalityTest: ['caller_crew.id']
  },
  StartPrepaidAgreementAuction: { equalityTest: ['lot.id'] },
  CancelPrepaidAgreementAuction: { equalityTest: ['lot.id'] },
  DockShip: {
    equalityTest: ['caller_crew.id']
  },
  UndockShip: {
    equalityTest: ['caller_crew.id']
  },
  TransitBetweenStart: { equalityTest: ['caller_crew.id'] },
  TransitBetweenFinish: { equalityTest: ['caller_crew.id'] },

  // virtual multi-system wrappers
  // TODO: could do fancier conditional multisystems if that would help
  // i.e. `multisystemCalls: [{ name: 'InitializeAsteroid', cond: (a) => !a.AsteroidProof.used }, 'ScanAsteroid'],`

  BulkPurchaseAdalians: {
    repeatableSystemCall: 'PurchaseAdalian',
    getRepeatTally: (vars) => Math.max(1, Math.floor(vars.tally)),
    equalityTest: true,
    isVirtual: true
  },
  BulkFillSellOrder: {
    batchableSystemCall: 'FillSellOrder',
    isBatchable: true,
    isVirtual: true
  },
  FinishAllReady: {
    multisystemCalls: ({ finishCalls }) => finishCalls.map(({ key, vars }) => ({ system: key, vars })),
    equalityTest: true,
    isVirtual: true,
  },
  InitializeAndManageAsteroid: {
    multisystemCalls: ['InitializeAsteroid', 'ManageAsteroid'],
    equalityTest: ['asteroid.id'],
    isVirtual: true
  },
  InitializeAndPurchaseAsteroid: {
    multisystemCalls: ['InitializeAsteroid', 'PurchaseAsteroid'],
    equalityTest: ['asteroid.id'],
    isVirtual: true
  },
  InitializeAndStartSurfaceScan: {
    multisystemCalls: ['InitializeAsteroid', 'ScanSurfaceStart'],
    equalityTest: ['asteroid.id'],
    isVirtual: true
  },
  InitializeAndStartTransit: {
    multisystemCalls: ['InitializeAsteroid', 'TransitBetweenStart'],
    equalityTest: ['caller_crew.id'],
    isVirtual: true
  },
  InitializeAndClaimPrepareForLaunchReward: {
    multisystemCalls: ['InitializeAsteroid', 'ClaimPrepareForLaunchReward'],
    equalityTest: ['asteroid.id'],
    isVirtual: true
  },
  RepossessBuildingAndCancelAuction: {
    multisystemCalls: ({ lot, ...vars }) => [
      { system: 'CancelPrepaidAgreementAuction', vars: { lot, caller_crew: vars.caller_crew } },
      { system: 'RepossessBuilding', vars }
    ],
    equalityTest: ['building.id'],
    isVirtual: true
  },
  LeaseAndProcessProductsStart: {
    multisystemCalls: ({ lease, ...vars }) => {
      return [
        lease && {
          system: 'AcceptPrepaidAgreement',
          vars: {
            caller_crew: vars.caller_crew,
            target: vars.processor,
            permission: Permission.IDS.RUN_PROCESS,
            permitted: vars.caller_crew,
            termPrice: lease.termPrice,
            recipient: lease.recipient,
            term: lease.term,
          }
        },
        {
          system: 'ProcessProductsStart',
          vars
        }
      ].filter((c) => !!c);
    },
    equalityTest: ['processor.id', 'processor_slot'],
    isVirtual: true
  },
  LeaseAndAssembleShipStart: {
    multisystemCalls: ({ lease, ...vars }) => {
      return [
        lease && {
          system: 'AcceptPrepaidAgreement',
          vars: { 
            caller_crew: vars.caller_crew,
            target: vars.dry_dock,
            permission: Permission.IDS.ASSEMBLE_SHIP,
            permitted: vars.caller_crew,
            termPrice: lease.termPrice,
            recipient: lease.recipient,
            term: lease.term,
          }
        },
        {
          system: 'AssembleShipStart',
          vars
        }
      ].filter((c) => !!c);
    },
    equalityTest: ['dry_dock.id', 'dry_dock_slot'],
    isVirtual: true
  },
  FlexibleExtractResourceStart: {
    multisystemCalls: ({ lease, purchase, ...vars }) => {
      return [
        lease && {
          system: 'AcceptPrepaidAgreement',
          vars: {
            caller_crew: vars.caller_crew,
            target: vars.extractor,
            permission: Permission.IDS.EXTRACT_RESOURCES,
            permitted: vars.caller_crew,
            termPrice: lease.termPrice,
            recipient: lease.recipient,
            term: lease.term,
          }
        },
        purchase && {
          system: 'PurchaseDeposit',
          vars: {
            caller_crew: vars.caller_crew,
            deposit: vars.deposit,
            price: purchase.price,
            recipient: purchase.recipient,
          }
        },
        {
          system: 'ExtractResourceStart',
          vars
        }
      ].filter((c) => !!c);
    },
    equalityTest: ['extractor.id'],
    isVirtual: true
  },
  PurchaseDepositAndImprove: {
    multisystemCalls: ['PurchaseDeposit', 'SampleDepositImprove'],
    equalityTest: ['lot.id', 'caller_crew.id'],
    isVirtual: true
  },
  EscrowDepositAndCreateBuyOrder: {
    getEscrowAmount: ({ price, amount, feeTotal }) => {
      return safeBigInt((price * amount + feeTotal) || 0);
    },
    escrowConfig: {
      entrypoint: 'deposit',
      depositHook: 'CreateBuyOrder',
      depositHookCalldataLength: 15,
      withdrawHook: 'FillBuyOrder',
      withdrawHookCalldataLength: 25,
      withdrawHookKeys: ['buyer_crew', 'exchange', 'product', 'price', 'storage', 'storage_slot'],
      withdrawDataKeys: null
    },
    equalityTest: true, // TODO: ...
    isVirtual: true
  },
  EscrowWithdrawalAndFillBuyOrders: {
    getEscrowAmount: ({ price, amount, makerFee }) => {
      return safeBigInt(price * amount * (1 + makerFee));
    },
    escrowConfig: {
      entrypoint: 'withdraw',
      depositHook: null,
      withdrawHook: 'FillBuyOrder',
      withdrawHookCalldataLength: 25,
      withdrawHookKeys: ['buyer_crew', 'exchange', 'product', 'price', 'storage', 'storage_slot'],
      withdrawDataKeys: ['amount', 'origin', 'origin_slot', 'caller_crew'],
      getWithdrawals: ({ exchange_owner_account, seller_account, payments }) => {
        return [
          { recipient: seller_account, amount: safeBigInt(payments.toPlayer) },
          { recipient: exchange_owner_account, amount: safeBigInt(payments.toExchange) },
        ];
      }
    },
    isBatchable: true,
    equalityTest: true, // TODO: ...
    isVirtual: true
  },
  FillSellOrder: {
    getTransferConfig: (vars) => {
      // memo === order path
      const memo = [
        Entity.packEntity(vars.seller_crew),
        Entity.packEntity(vars.exchange),
        Order.IDS.LIMIT_SELL,
        vars.product,
        vars.price,
        Entity.packEntity(vars.storage),
        vars.storage_slot
      ];
      return [
        {
          amount: safeBigInt(vars.payments.toPlayer),
          recipient: vars.seller_account,
          memo
        },
        {
          amount: safeBigInt(vars.payments.toExchange),
          recipient: vars.exchange_owner_account,
          memo
        }
      ];
    }
  },
  ResupplyFoodFromExchange: {
    getTransferConfig: (vars) => {
      // memo === order path
      const memo = [
        Entity.packEntity(vars.seller_crew),
        Entity.packEntity(vars.exchange),
        Order.IDS.LIMIT_SELL,
        vars.product,
        vars.price,
        Entity.packEntity(vars.storage),
        vars.storage_slot
      ];
      return [
        {
          amount: safeBigInt(vars.payments.toPlayer),
          recipient: vars.seller_account,
          memo
        },
        {
          amount: safeBigInt(vars.payments.toExchange),
          recipient: vars.exchange_owner_account,
          memo
        }
      ];
    },
    equalityTest: ['caller_crew.id']
  },
  UpdatePolicy: {
    multisystemCalls: ({ add, remove }) => [remove, add].filter((c) => !!c),
    equalityTest: ['target.label', 'target.id', 'permission'],
    isVirtual: true
  },
  UpdatePolicyAndAuctionSettings: {
    multisystemCalls: ({ add, auctionSettings, remove }) => [
      remove,
      add,
      { system: 'ConfigurePrepaidAuction', vars: auctionSettings }
    ].filter((c) => !!c),
    equalityTest: ['target.label', 'target.id', 'permission'],
    isVirtual: true
  },
  UpdateAllowlists: {
    multisystemCalls: ({ additions, removals, accountAdditions, accountRemovals, ...vars }) => {
      return [
        ...removals.map((r) => ({
          system: 'RemoveFromWhitelist',
          vars: { ...vars, permitted: r }
        })),
        ...additions.map((a) => ({
          system: 'Whitelist',
          vars: { ...vars, permitted: a }
        })),
        ...accountAdditions.map((a) => ({
          system: 'WhitelistAccount',
          vars: { ...vars, permitted: a }
        })),
        ...accountRemovals.map((r) => ({
          system: 'RemoveAccountFromWhitelist',
          vars: { ...vars, permitted: r }
        })),
      ]
    },
    equalityTest: ['target.label', 'target.id', 'permission'],
    isVirtual: true
  },
  TransferNft: {
    getNonsystemCalls: ({ tokenAddress, tokenId, from, to }) => [
      System.getFormattedCall(tokenAddress, 'transfer_from', [
        { value: from, type: 'felt' },
        { value: to, type: 'felt' },
        { value: tokenId, type: 'u256' }
      ])
    ],
    equalityTest: ['tokenAddress', 'tokenId'],
    noSystemCalls: true,
    isVirtual: true,
  },
  SetNftSellOrder: {
    getNonsystemCalls: ({ tokenAddress, tokenId, price }) => [
      System.getFormattedCall(
        tokenAddress,
        'set_sell_order',
        [
          { value: tokenId, type: 'u256' },
          { value: price, type: 'BigNumber' }
        ]
      )
    ],
    equalityTest: ['tokenAddress', 'tokenId'],
    noSystemCalls: true,
    isVirtual: true,
  },
  FillNftSellOrder: {
    getNonsystemCalls: ({ tokenAddress, tokenId, crew, owner, price }) => {
      const utoken = uint256.bnToUint256(tokenId);
      const calls = [
        System.getTransferWithConfirmationCall(
          owner,
          price,
          [
            shortString.encodeShortString('Ship'),
            utoken.low,
            utoken.high
          ],
          tokenAddress,
          appConfig.get('Starknet.Address.swayToken'),
        ),
        System.getFormattedCall(
          tokenAddress,
          'fill_sell_order',
          [
            { value: tokenId, type: 'u256' }
          ]
        )
      ];
      if (crew) { // auto-commandeer if crew is passed
        const [commandeerCall] = getSystemCallAndProcessedVars(
          'CommandeerShip',
          { ship: { label: Entity.IDS.SHIP, id: tokenId }, caller_crew: crew }
        );
        calls.push(commandeerCall);
      }
      return calls;
    },
    equalityTest: ['tokenAddress', 'tokenId'],
    noSystemCalls: true,
    isVirtual: true,
  }
};

const buildExplicitAuthorizationTypedData = ({ accountAddress, action, chainId, details }) => ({
  domain: {
    name: 'Influence',
    version: '1.1.0',
    chainId: chainId || appConfig.get('Starknet.chainId'),
    revision: '1'
  },
  message: {
    action,
    account: accountAddress,
    details,
    nonce: `${Date.now()}-${Math.random().toString(36).slice(2)}`
  },
  primaryType: EXPLICIT_AUTHORIZATION_PRIMARY_TYPE,
  types: {
    [EXPLICIT_AUTHORIZATION_PRIMARY_TYPE]: [
      { name: 'action', type: 'string' },
      { name: 'account', type: 'felt' },
      { name: 'details', type: 'string' },
      { name: 'nonce', type: 'string' }
    ],
    StarknetDomain: [
      { name: 'name', type: 'shortstring' },
      { name: 'version', type: 'shortstring' },
      { name: 'chainId', type: 'shortstring' },
      { name: 'revision', type: 'shortstring' }
    ]
  }
});

const getSystemCallAndProcessedVars = (runSystem, rawVars, encodeEntrypoint = false, limitToVars = false, overrideCalldataLength = false) => {
  let vars = customConfigs[runSystem]?.preprocess ? customConfigs[runSystem].preprocess(rawVars) : rawVars;
  const systemCall = System.getRunSystemCall(runSystem, vars, appConfig.get('Starknet.Address.dispatcher'), limitToVars);
  if (encodeEntrypoint) { // used where nested (i.e. in escrow call)
    systemCall.entrypoint = hash.getSelectorFromName(systemCall.entrypoint);
  }
  if (overrideCalldataLength) { // used for escrow where hooks only include partial calldata
    systemCall.calldata[1] = `${overrideCalldataLength}`;
  }
  console.log('getSystemCallAndProcessedVars', runSystem, systemCall);
  return [systemCall, vars];
}

export function ChainTransactionProvider({ children }) {
  const {
    accountAddress,
    accountDeploymentData,
    authenticated,
    blockNumber,
    blockTime,
    chainId,
    getTransactionAccount,
    refreshWalletConnection,
    isDeployed,
    paymasterTokens,
    provider,
    sessionWallet,
    upgradeInsecureSession,
    walletAccount,
    walletCapabilities,
    walletReadyForTransactions,
    walletId
  } = useSession();
  const queryClient = useQueryClient();
  const missionSubmissions = useRef(new Set());
  const activities = useActivitiesContext();
  const { crew, recheckAuthorization } = useCrewContext();
  const { data: ownedCrews } = useWalletCrews();
  const dispatchStarterPackFeeDefaults = useStore(s => s.dispatchStarterPackFeeDefaults);
  useEffect(() => {
    if (ownedCrews?.some((ownedCrew) => ownedCrew.StarterPack?.valid)) {
      dispatchStarterPackFeeDefaults(accountAddress);
    }
  }, [accountAddress, ownedCrews, dispatchStarterPackFeeDefaults]);
  const { data: walletSource } = useWalletPurchasableBalances();
  const { data: swayBalanceSource } = useSwayBalance();
  const { data: usdcBalanceSource } = useUSDCBalance();
  const simulationEnabled = useSimulationEnabled();

  // using a ref since execute is often called from a callback from funding (and
  // it may not reliably get re-memoized with updated wallet values within callback)
  const walletRef = useRef();
  walletRef.current = walletSource;

  const swayRef = useRef();
  swayRef.current = swayBalanceSource;

  const usdcRef = useRef();
  usdcRef.current = usdcBalanceSource;

  const deploymentManager = useRef();
  if (!deploymentManager.current) deploymentManager.current = createAccountDeployment();
  const deploymentIdentity = useRef();
  deploymentIdentity.current = { accountAddress, chainId, authenticated };

  const executionRef = useRef();
  const walletAccountRef = useRef();
  // Account discovery precedes login/session approval; signing must wait for both.
  walletAccountRef.current = walletReadyForTransactions ? walletAccount : undefined;

  const createAlert = useStore(s => s.dispatchAlertLogged);
  const gameplay = useStore(s => s.gameplay);
  const pendingTransactions = useStore(s => s.pendingTransactions);
  const dispatchFailedTransaction = useStore(s => s.dispatchFailedTransaction);
  const dispatchPendingTransaction = useStore(s => s.dispatchPendingTransaction);
  const dispatchPendingTransactionComplete = useStore(s => s.dispatchPendingTransactionComplete);
  const dispatchClearTransactionHistory = useStore(s => s.dispatchClearTransactionHistory);
  const dispatchFeeTokenEnabled = useStore(s => s.dispatchFeeTokenEnabled);
  const dispatchPaidFeesAcknowledged = useStore(s => s.dispatchPaidFeesAcknowledged);
  const dispatchLauncherPage = useStore(s => s.dispatchLauncherPage);

  const [promptingTransaction, setPromptingTransaction] = useState(false);
  const [feePrompt, setFeePrompt] = useState();
  const [fundingRequirement, setFundingRequirement] = useState(null);
  const [nonce, setNonce] = useState();
  const sponsorshipUnavailableRef = useRef(false);

  useEffect(() => {
    sponsorshipUnavailableRef.current = false;
  }, [accountAddress, walletAccount]);

  const requestFeePermission = useCallback((type) => new Promise((resolve) => {
    setFeePrompt({ resolve, type });
  }), []);

  const resolveFeePrompt = useCallback((accepted) => {
    setFeePrompt((current) => {
      current?.resolve(accepted);
      return undefined;
    });
  }, []);

  const notifyWalletDisconnected = useCallback(() => {
    const formattedAddress = accountAddress?.length > 10
      ? `${accountAddress.slice(0, 6)}...${accountAddress.slice(-4)}`
      : accountAddress;
    const message = authenticated
      ? `Please try again after connecting your ${getWalletLabel(walletId)} account: ${formattedAddress}`
      : errorMessages.connection;
    createAlert({
      type: authenticated ? 'WalletConnectionRequired' : 'GenericAlert',
      data: authenticated
        ? { walletName: getWalletLabel(walletId), address: formattedAddress }
        : { content: message },
      level: 'warning',
    });
    return message;
  }, [accountAddress, authenticated, createAlert, walletId]);

  // Sets the nonce initially to allow for some local management
  useEffect(() => {
    const retrieveNonce = async () => {
      const currentNonce = await provider.getNonceForAddress(accountAddress);
      setNonce(safeBigInt(currentNonce));
    };

    if (isDeployed && !nonce && !simulationEnabled && accountAddress && Number(accountAddress) !== 0) retrieveNonce();
  }, [accountAddress, isDeployed, nonce, provider, simulationEnabled, sessionWallet]);

  // Temporary logging for nonces
  useEffect(() => console.log('NONCE', nonce || null), [nonce]);

  const requireSessionUpgrade = useCallback(async () => {
    const upgraded = await upgradeInsecureSession();
    if (upgraded === false) {
      const error = new Error('Unable to upgrade account session after deployment.');
      error.userMessage = errorMessages.signIn;
      throw error;
    }
  }, [upgradeInsecureSession]);

  const ensureAccountDeployed = useCallback(async () => {
    if (isDeployed) return { deployed: true, transaction: null };
    const account = walletAccountRef.current;
    if (!account) throw new Error('Account is disconnected');
    if (!walletCapabilities.requiresSponsoredTransactions) {
      const error = new Error('Wallet account deployment is not sponsored for this wallet.');
      error.userMessage = errorMessages.setupRequired;
      throw error;
    }
    if (!appConfig.get('Starknet.paymasterProxy')) {
      const error = new Error('Privy sponsorship requires the Influence paymaster proxy.');
      error.userMessage = errorMessages.serviceUnavailable;
      throw error;
    }
    return deploymentManager.current({
      chainId, address: accountAddress, account, provider, deploymentData: accountDeploymentData,
      refreshSession: requireSessionUpgrade,
      assertCurrent: () => {
        const current = deploymentIdentity.current;
        if (!current.authenticated || current.accountAddress !== accountAddress || current.chainId !== chainId) {
          throw new Error('Account or network changed during deployment. Please retry.');
        }
      }
    });
  }, [accountAddress, accountDeploymentData, chainId, isDeployed, provider, requireSessionUpgrade,
    walletCapabilities.requiresSponsoredTransactions]);

  const requireExplicitAuthorization = useCallback(async (account, options = {}) => {
    if (!options.requireExplicitSignature || !walletCapabilities.usesClientRawSigning) return;

    try {
      await account.signMessage(buildExplicitAuthorizationTypedData({
        accountAddress: accountAddress || account?.address,
        chainId,
        action: options.authorization?.action || 'Authorize transaction',
        details: options.authorization?.details || 'Confirm this Influence transaction.'
      }));
    } catch (e) {
      if (/Cannot encode data|missing data/i.test(e?.message || '')) throw e;

      const error = new Error('User rejected explicit transaction authorization.');
      error.cause = e;
      error.userMessage = errorMessages.actionFailed;
      throw error;
    }
  }, [accountAddress, chainId, walletCapabilities.usesClientRawSigning]);

  // autoresolve when actionType is set but actionType was not actually triggered by actionRound
  const prependEventAutoresolve = useMemo(
    // TODO: can we check with a read call that this doesn't predict failure before prepending it
    //  (i.e. in case local crew value is stale)? might be more reliable anyway
    //  ... or we could also refetch crew again first
    () => crew?.Crew?.actionType
      && crew?.Crew?.actionRound
      // && (crew?.Crew?.actionRound + RandomEvent.MIN_ROUNDS) <= blockNumber // TODO: actionRound tmp fix
      && !crew?._actionTypeTriggered,
    [blockNumber, crew?.Crew?.actionType, crew?.Crew?.actionRound, crew?._actionTypeTriggered]
  );

  const processAccountTransaction = useCallback(async (calls, options = {}) => {
    const walletAccount = walletAccountRef.current;
    if (!walletAccount) throw new Error('Account is disconnected');
    const allowSponsorship = options.allowSponsorship !== false;
    // Sponsored gameplay deployment remains separate from user-paid transactions.
    let accountIsDeployed = isDeployed;
    if (allowSponsorship && options.usePaymaster !== false && walletCapabilities.requiresSponsoredTransactions && !accountIsDeployed) {
      await ensureAccountDeployed();
      accountIsDeployed = true;
    }
    const transactionAccount = await getTransactionAccount(walletAccountRef.current, calls, options);
    const paidPrivy = !allowSponsorship && walletCapabilities.requiresSponsoredTransactions;
    const paymasterConfigured = !paidPrivy && walletCapabilities.requiresSponsoredTransactions
      ? appConfig.get('Starknet.paymasterProxy')
      : appConfig.get('Starknet.paymaster');
    const account = paidPrivy ? createUserPaidAccount({
      account: transactionAccount, provider, paymasterUrl: paymasterConfigured
    }) : transactionAccount;
    const deploymentData = paidPrivy && !accountIsDeployed ? accountDeploymentData : undefined;
    options.assertCurrent?.();
    const usePaymaster = options.usePaymaster !== false && !!paymasterConfigured;

    let paymasterAvailable = usePaymaster;

    // Format calls for proper stringification
    const formattedCalls = calls.map((call) => {
      return { ...call, calldata: call.calldata.map(a => num.toHex(a)) };
    });

    // Refresh spendable balances for review and confirmation; swap principal cannot pay gas.
    const balances = options.prepareFee || options.reviewedFee
      ? Object.fromEntries(await Promise.all(FALLBACK_FEE_TOKENS.map(async token => {
        const [low, high] = await provider.callContract({
          contractAddress: token, entrypoint: 'balanceOf', calldata: [accountAddress]
        });
        return [token, uint256.uint256ToBN({ low, high })];
      })))
      : { [TOKEN.USDC]: usdcRef.current || 0n, [TOKEN.SWAY]: swayRef.current || 0n };
    if ((options.prepareFee || options.reviewedFee) && Object.entries(options.reservedAmounts || {}).some(([token, amount]) => balances[token] < amount)) {
      throw new Error('Insufficient balance for swap. Review the swap again.');
    }
    const feeOptions = {
      account,
      assertCurrent: options.assertCurrent,
      fee: options.reviewedFee,
      resourceBounds: options.resourceBounds,
      deploymentData,
      calls: formattedCalls,
      getStrkBalance: async () => {
        if (deploymentData) return 0n;
        const [low, high] = await provider.callContract({
          contractAddress: TOKEN.STRK, entrypoint: 'balanceOf', calldata: [accountAddress]
        });
        return uint256.uint256ToBN({ low, high });
      },
      usePaymaster: usePaymaster && (accountIsDeployed || !!deploymentData),
      feeTokens: FALLBACK_FEE_TOKENS.map((gasToken) => ({
        address: gasToken,
        name: Address.areEqual(gasToken, TOKEN.USDC) ? 'USDC' : 'SWAY',
        balance: balances[gasToken] - (options.reservedAmounts?.[gasToken] || 0n),
        enabled: getFallbackFeeTokens(gameplay, accountAddress).some((token) => Address.areEqual(token, gasToken)),
        supported: !(paymasterTokens?.length > 0)
          || paymasterTokens.some((token) => Address.areEqual(token.token_address, gasToken))
      })),
      requestFeePermission,
      enableFeeToken: dispatchFeeTokenEnabled,
      openTopUp: () => dispatchLauncherPage('store', 'sway')
    };
    if (options.reviewedFee) return executeReviewedTransaction(feeOptions);

    if (
      usePaymaster
      && allowSponsorship
      && walletCapabilities.requiresSponsoredTransactions
      && !sponsorshipUnavailableRef.current
    ) {
      if (!appConfig.get('Starknet.paymasterProxy')) {
        const error = new Error('Privy sponsorship requires the Influence paymaster proxy.');
        error.userMessage = errorMessages.serviceUnavailable;
        throw error;
      }

      try {
        const details = { feeMode: { mode: 'sponsored' } };
        if (options.prepareFee) {
          await account.estimatePaymasterTransactionFee(formattedCalls, details);
          return { mode: 'sponsored', maxFee: 0n, details };
        }
        return await account.executePaymasterTransaction(formattedCalls, details);
      } catch (error) {
        if (isUserCancellation(error)) throw error;
        paymasterAvailable = !isPaymasterUnavailable(error);
        if (paymasterAvailable && !isSponsorshipUnavailable(error)) throw error;
        if (paymasterAvailable) sponsorshipUnavailableRef.current = true;
      }
    }

    if (allowSponsorship && sponsorshipUnavailableRef.current && !useStore.getState().paidFeeAcknowledgements?.[accountAddress]) {
      if (!(await requestFeePermission('TRANSITION'))) {
        const error = new Error('Paid network fees were not acknowledged.');
        error.suppressTransactionFailure = true;
        throw error;
      }
      dispatchPaidFeesAcknowledged(accountAddress);
    }

    feeOptions.usePaymaster = paymasterAvailable && (accountIsDeployed || !!deploymentData);
    return options.prepareFee ? preparePaidTransactionFee(feeOptions) : executePaidTransaction(feeOptions);
  }, [
    accountAddress,
    accountDeploymentData,
    dispatchFeeTokenEnabled,
    dispatchPaidFeesAcknowledged,
    dispatchLauncherPage,
    gameplay,
    provider,
    getTransactionAccount,
    ensureAccountDeployed,
    isDeployed,
    paymasterTokens,
    requestFeePermission,
    walletCapabilities.requiresSponsoredTransactions
  ]);

  const contracts = useMemo(() => {
    if (!!walletAccount) {

      // include all default systems + any virtuals included in customConfigs
      const systemKeys = [
        ...Object.keys(System.Systems),
        ...(Object.keys(customConfigs).filter((k) => !!customConfigs[k].isVirtual))
      ];

      return systemKeys.reduce((acc, systemName) => {
        const config = {
          equalityTest: 'ALL',
          ...(customConfigs[systemName] || {})
        };

        acc[systemName] = {
          equalityTest: config.equalityTest,

          execute: async (rawVars, options = {}) => {
            let systemCalls;
            if (config.multisystemCalls) {
              systemCalls = (
                typeof config.multisystemCalls === 'function'
                ? config.multisystemCalls(rawVars)
                : config.multisystemCalls
              ).map((runSystem) => {
                if (typeof runSystem === 'string') {
                  return { runSystem, rawVars };
                } else if (typeof runSystem === 'object') {
                  const { system, vars } = runSystem;
                  return { runSystem: system, rawVars: vars };
                }
              });
              console.log('multisystemCalls', systemCalls, rawVars);
            } else if (config.repeatableSystemCall) {
              systemCalls = Array.from(Array(config.getRepeatTally(rawVars))).map(() => ({ runSystem: config.repeatableSystemCall, rawVars }));
            } else if (config.isBatchable) {
              const rawVarSets = Array.isArray(rawVars) ? rawVars : [rawVars];
              systemCalls = rawVarSets.map((rawVarSet) => ({ runSystem: config.batchableSystemCall || systemName, rawVars: rawVarSet }));
            } else if (config.noSystemCalls) {
              systemCalls = [];
            } else {
              systemCalls = [{ runSystem: systemName, rawVars }];
            }

            // mark as escrow interactors
            if (config.escrowConfig) {
              systemCalls.forEach((r) => r.escrowConfig = config.escrowConfig);
            }

            // if actionType is set but the random event was not actually triggered,
            // prepend resolveRandomEvent with choice 0 so that the event is cleared
            if (prependEventAutoresolve && !(config.noSystemCalls || config.isUnblockable)) { // TODO: fill in these isUnblockable's
              const caller_crew = (Array.isArray(rawVars) ? rawVars.find((rv) => !!rv.caller_crew) : rawVars)?.caller_crew;

              if (caller_crew && caller_crew.id !== 0) {
                systemCalls.unshift({
                  runSystem: 'ResolveRandomEvent',
                  rawVars: { caller_crew, choice: 0 }
                });
              }
            }

            const observe = async (system, vars, call, escrow) => {
              const observed = await observeNativeMissionCall({ system, vars, call, escrow,
                dispatcher: appConfig.get('Starknet.Address.dispatcher'), account: walletAccount.address, api });
              options.missionCandidates?.push(...observed.candidates);
              return observed.calls;
            };
            let totalEscrow = 0n;
            let totalPrice = 0n;
            let totalPriceToken;
            const calls = config.getNonsystemCalls ? config.getNonsystemCalls(rawVars) : [];
            for (let { runSystem, rawVars, escrowConfig } of systemCalls) {
              console.log('systemCall', runSystem, rawVars, escrowConfig);
              let processedVars;

              // escrow-wrapped systems
              if (escrowConfig) {
                const [withdrawSystemCall] = escrowConfig.withdrawHook
                  ? getSystemCallAndProcessedVars(
                    escrowConfig.withdrawHook,
                    rawVars,
                    true,
                    escrowConfig.withdrawHookKeys,
                    escrowConfig.withdrawHookCalldataLength
                  )
                  : [];

                // approve escrow amount
                const escrowAmount = config?.getEscrowAmount ? config.getEscrowAmount(rawVars) : 0n;

                // escrow deposit
                if (escrowConfig.entrypoint === 'deposit') {
                  const [depositSystemCall, depositVars] = getSystemCallAndProcessedVars(
                    escrowConfig.depositHook,
                    rawVars,
                    true,
                    System.Systems[escrowConfig.depositHook]?.inputs.map((i) => i.name).filter((n) => !/^escrow_/.test(n)),
                    escrowConfig.depositHookCalldataLength
                  );
                  processedVars = depositVars;
                  totalEscrow += escrowAmount;

                  const escrowCall = System.getEscrowDepositCall(
                    escrowAmount,
                    depositSystemCall,
                    withdrawSystemCall,
                    appConfig.get('Starknet.Address.escrow'),
                    appConfig.get('Starknet.Address.swayToken'),
                  );

                  console.log('runSystem via escrow deposit', runSystem, processedVars, escrowCall);
                  calls.push(escrowCall);

                // escrow withdrawal
                } else {
                  processedVars = customConfigs[escrowConfig.withdrawHook]?.preprocess ? customConfigs[escrowConfig.withdrawHook].preprocess(rawVars) : rawVars;

                  const withdrawSystemData = escrowConfig.withdrawDataKeys && System.formatSystemCalldata(
                    escrowConfig.withdrawHook,
                    processedVars,
                    escrowConfig.withdrawDataKeys
                  );

                  const withdrawals = escrowConfig.getWithdrawals(processedVars);
                  if (rawVars.isCancellation && escrowConfig.withdrawHook === 'FillBuyOrder') {
                    withdrawals[0].amount = await getCancellationRefund({
                      provider,
                      escrowAddress: appConfig.get('Starknet.Address.escrow'),
                      tokenAddress: appConfig.get('Starknet.Address.swayToken'),
                      depositCaller: rawVars.depositCaller,
                      withdrawHook: withdrawSystemCall,
                      minimumRefund: withdrawals[0].amount
                    });
                  }

                  const escrowCall = System.getEscrowWithdrawCall(
                    withdrawals,
                    rawVars.depositCaller,
                    withdrawSystemCall,
                    withdrawSystemData,
                    appConfig.get('Starknet.Address.escrow'),
                    appConfig.get('Starknet.Address.swayToken'),
                  );

                  console.log('runSystem via escrow withdrawal', runSystem, processedVars, escrowCall);
                  calls.push(...await observe(escrowConfig.withdrawHook, processedVars, escrowCall, {
                    hook: withdrawSystemCall, data: withdrawSystemData,
                    address: appConfig.get('Starknet.Address.escrow'),
                    token: appConfig.get('Starknet.Address.swayToken'), withdrawals
                  }));
                }

              // standard systems
              } else {
                const [systemCall, vars] = getSystemCallAndProcessedVars(runSystem, rawVars);
                processedVars = vars;
                console.log('runSystem', runSystem, processedVars, systemCall);
                calls.push(...await observe(runSystem, vars, systemCall));
              }

              if (customConfigs[runSystem]?.getTransferConfig) {
                const transferCalldata = await customConfigs[runSystem].getTransferConfig(processedVars);
                const transferCalldatas = Array.isArray(transferCalldata) ? transferCalldata : [transferCalldata];
                transferCalldatas.forEach((t) => {
                  calls.unshift(System.getTransferWithConfirmationCall(
                    t.recipient,
                    t.amount,
                    t.memo,
                    t.consumer || appConfig.get('Starknet.Address.dispatcher'),
                    appConfig.get('Starknet.Address.swayToken'),
                  ));
                });
              }

              if (customConfigs[runSystem]?.getPrice) {
                const [tokenAmount, token] = (await customConfigs[runSystem].getPrice(processedVars)) || [];

                if (!Address.areEqual(token, TOKEN.USDC)) {
                  throw new Error('Store purchases require USDC.');
                }

                if (totalPriceToken && totalPriceToken !== token) {
                  throw new Error('Mixed currency transactions are not supported');
                }

                totalPrice += tokenAmount;
                totalPriceToken = token;
              }
            }

            if (totalEscrow > 0n) {
              calls.unshift(System.getApproveErc20Call(
                totalEscrow, appConfig.get('Starknet.Address.swayToken'), appConfig.get('Starknet.Address.escrow')
              ));
            }

            // approve totalPriceToken to make purchase
            if (totalPrice > 0n) {
              calls.unshift(System.getApproveErc20Call(
                totalPrice,
                totalPriceToken,
                appConfig.get('Starknet.Address.dispatcher')
              ));

              const wallet = walletRef.current;
              if (!wallet) throw new Error('Wallet balance not loaded');
              const balance = wallet.tokenBalances[TOKEN.USDC] || 0n;
              if (totalPrice > balance) {
                throw createFundingError(totalPrice - balance, TOKEN.USDC, totalPrice);
              }
            }

            console.log('execute', calls);
            return processAccountTransaction(calls, options);
          },

          onConfirmed: (event, vars) => {
            if (config.getConfirmedAlert) createAlert(config.getConfirmedAlert(vars));
            config.onConfirmed && config.onConfirmed(event, vars);
          },

          onTransactionError: (err, vars) => {
            setNonce(null);
            console.error(err, vars);
          },
        };

        return acc;
      }, {});
    }
    return null;
  }, [
    accountAddress,
    createAlert,
    processAccountTransaction,
    gameplay.feesInSway,
    isDeployed,
    prependEventAutoresolve,
    provider,
    sessionWallet,
    walletAccount
  ]);

  const contractsRef = useRef();
  contractsRef.current = contracts;

  const getTxEvent = useCallback((txHash) => {
    const txHashBInt = safeBigInt(txHash);
    return (activities || []).find((a) => a.event?.transactionHash && safeBigInt(a.event?.transactionHash) === txHashBInt)?.event;
  }, [activities]);

  const transactionWaiters = useRef([]);

  // on logout, clear pending (and failed) transactions
  useEffect(() => {
    if (!authenticated) dispatchClearTransactionHistory();
  }, [authenticated, dispatchClearTransactionHistory]);

  // handle newlyFailedTx in state + effect flow b/c doing directly in catch uses old values
  // of state (i.e. from when the callback was created)
  const [newlyFailedTx, setNewlyFailedTx] = useState();
  const reportedReceipts = useRef(new Set());
  useEffect(() => {
    if (newlyFailedTx) {
      const { err, key, vars, txHash } = newlyFailedTx;

      // this somewhat commonly times out even when tx has gone through, so before reporting an error
      // check again that we have not received a related activity
      const txEvent = getTxEvent(txHash);
      if (txEvent) {
        console.warn(`txEvent already exists for "failed" tx ${txHash}`, err);
        contracts[key]?.onConfirmed(txEvent, vars);
        if (!MISSION_SYSTEMS.has(key)) dispatchPendingTransactionComplete(txHash);
      } else if (err?.execution_status === 'REVERTED' || err?.receipt?.execution_status === 'REVERTED') {
        reportFailure(createAlert, err, { message: 'reverted', context: { action: key, transactionHash: txHash } });
        contracts[key]?.onTransactionError(err, vars);
        if (txHash) { // TODO: may want to display pre-tx failures if using session wallet
          dispatchFailedTransaction({
            key,
            vars,
            txHash,
            err: err?.message || 'Transaction was rejected.'
          });
          dispatchPendingTransactionComplete(txHash, 'failed');
        }
      }

      if (!txEvent && txHash && err?.execution_status !== 'REVERTED' && err?.receipt?.execution_status !== 'REVERTED'
        && !reportedReceipts.current.has(txHash)) {
        reportedReceipts.current.add(txHash);
        reportFailure(createAlert, err, { message: 'unknownOutcome', context: { action: key, transactionHash: txHash } });
      }

      // now that processed, clear this failure
      setNewlyFailedTx();
    }
  }, [contracts, getTxEvent, newlyFailedTx]);

  // on initial load, set provider.waitForTransaction for any pendingTransactions
  // so that we can throw any extension-related or timeout errors needed
  useEffect(() => {
    transactionWaiters.current = transactionWaiters.current.filter((hash) => pendingTransactions.some((tx) => tx.txHash === hash));
    if (provider && contracts && pendingTransactions?.length) {
      pendingTransactions.forEach(({ key, vars, meta, txHash }) => {
        // (sanity check) this should not be possible since pendingTransaction should not be created
        // without txHash... so we aren't even reporting this error to user since should not happen
        if (!txHash) return dispatchPendingTransactionComplete(txHash, 'failed');

        if (!transactionWaiters.current.includes(txHash)) {
          transactionWaiters.current.push(txHash);

          // NOTE: waitForTransaction is slow -- often slower than server to receive and process
          //  event and send back to frontend... so we are using it just to listen for errors
          //  (activities from backend will demonstrate success)
          provider.waitForTransaction(txHash, { retryInterval: RETRY_INTERVAL })
            .then((receipt) => {
              // if a tx just went through and account is not known to be deployed,
              // now is a good time to check again if it is deployed
              if (receipt && !isDeployed) upgradeInsecureSession();
              if (receipt?.execution_status === 'SUCCEEDED' && (meta?.missionCandidates?.length || MISSION_SYSTEMS.has(key))) {
                queryClient.invalidateQueries({ queryKey: ['starterMissions'] });
                queryClient.invalidateQueries({ queryKey: ['colonizationMissions'] });
                if (key === 'CompleteMission' || key === 'ClaimMissionReward') {
                  queryClient.invalidateQueries({ queryKey: ['walletBalance', 'sway'] });
                }
              }
            })
            // .then((receipt) => {
            //   if (receipt) {
            //     console.log('transaction settled');
            //     contracts[key].onTransactionSuccess(receipt, vars);
            //     dispatchPendingTransactionUpdate(txHash, { txSettled: true, receipt });
            //   } else {
            //     contracts[key].onTransactionError('No transaction receipt generated.', vars);
            //     dispatchPendingTransactionComplete(txHash);
            //   }
            // })
            .catch((err) => setNewlyFailedTx({ err, key, vars, txHash }));
          // Keep settled waiters registered until indexing clears the transaction.
          // Recreating them on renders repeats receipt-driven invalidations.
        }
      });
    }
  }, [contracts, pendingTransactions]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // console.log('trigger activities effect', activities, pendingTransactions);
    if (contracts && pendingTransactions?.length) {
      pendingTransactions.forEach((tx) => {
        const { key, vars, txHash } = tx;

        // check for event
        // TODO (enhancement): only need to check new activities diff (not all)
        const txEvent = getTxEvent(txHash);
        if (txEvent) {
          contracts[key].onConfirmed(txEvent, vars);
          if (!MISSION_SYSTEMS.has(key)) dispatchPendingTransactionComplete(txHash);
        }
      });
    }
  }, [getTxEvent, pendingTransactions, contracts]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Retry receipt checks after a waiter times out, at most once per 30 seconds.
  const receiptChecks = useRef(new Map());
  useEffect(() => {
    for (const hash of receiptChecks.current.keys()) {
      if (!pendingTransactions.some((tx) => tx.txHash === hash)) receiptChecks.current.delete(hash);
    }
    if (provider && contracts && pendingTransactions?.length) {
      pendingTransactions.filter((tx) => !tx.txEvent).forEach((tx) => {
        // if it's been X+ seconds since submitted, check if it was reverted
        if (Math.floor(Date.now() / 1000) > Math.floor(tx.timestamp / 1000) + 30) {
          const { key, vars, txHash } = tx;
          if (!txHash || getTxEvent(txHash)) return;
          const previous = receiptChecks.current.get(txHash);
          if (previous?.inFlight || Date.now() - (previous?.checkedAt || 0) < 30000) return;
          const check = { inFlight: true, checkedAt: Date.now() };
          receiptChecks.current.set(txHash, check);

          provider.getTransactionReceipt(txHash)
            .then((receipt) => {
              if (receipt && receipt.execution_status === 'REVERTED') {
                reportFailure(createAlert, receipt, { message: 'reverted', context: { action: key, transactionHash: txHash } });
                contracts[key].onTransactionError(receipt, vars);
                dispatchFailedTransaction({
                  key,
                  vars,
                  txHash,
                  err: receipt.revert_reason || 'Transaction was rejected.'
                });
                dispatchPendingTransactionComplete(txHash, 'failed');
              }
            })
            .catch((err) => {
              console.warn(err);
            })
            .finally(() => { check.inFlight = false; });
        }
      });
    }
  }, [blockNumber]);

  const handleExecutionExeption = useCallback((e, executeCalls, txDetails = {}) => {
    if (e?.fundingRequirement) {
      setFundingRequirement(e.fundingRequirement);
      e.suppressTransactionFailure = true;
      return;
    }
    reportFailure(createAlert, e, { context: { action: txDetails?.key, transactionHash: txDetails?.txHash } });
    if (!e?.suppressTransactionFailure && !isUserCancellation(e) && !isWalletRequestTimeout(e) && txDetails?.key) {
      dispatchFailedTransaction({ ...txDetails, txHash: null, err: e?.message || e });
    }
  }, [accountAddress, createAlert, dispatchFailedTransaction]);

  const deployAccount = useCallback(async () => {
    if (isDeployed) return { deployed: true, transaction: null };

    const activeWalletAccount = walletAccountRef.current;
    if (!activeWalletAccount) {
      if (await refreshWalletConnection() && walletAccountRef.current) {
        return executionRef.current.deployAccount();
      }
      throw new Error(notifyWalletDisconnected());
    }

    setPromptingTransaction(true);
    try {
      return await ensureAccountDeployed();
    } catch (e) {
      handleExecutionExeption(e, null, null);
      throw e;
    } finally {
      setPromptingTransaction(false);
    }
  }, [ensureAccountDeployed, handleExecutionExeption, isDeployed, notifyWalletDisconnected, refreshWalletConnection]);

  // Allows for multiple explicit / manual calls to be executed in a single transaction
  const executeCalls = useCallback(async (calls, options = {}) => {
    if (!(calls?.length > 0)) {
      console.error('no calls included in executeCalls input');
      return;
    }

    const activeWalletAccount = walletAccountRef.current;
    if (!activeWalletAccount) {
      if (await refreshWalletConnection() && walletAccountRef.current) {
        return executionRef.current.executeCalls(calls, options);
      }
      notifyWalletDisconnected();
      return;
    }

    // start prompting state before isAccountLocked since *might* take some time
    // and want to disable isTransaction buttons immediately
    setPromptingTransaction(true);
    try {
      if (await isWalletAccountLocked(activeWalletAccount)) {
        notifyWalletDisconnected();
        return;
      }
      options.assertCurrent?.();
      await requireExplicitAuthorization(activeWalletAccount, options);
      const tx = await processAccountTransaction(calls, options);

      // if a tx just went through and account is not known to be deployed,
      // now is a good time to check again if it is deployed
      if (!isDeployed) {
        const txHash = cleanseTxHash(tx);

        if (txHash) {
          provider.waitForTransaction(txHash, { retryInterval: RETRY_INTERVAL })
            .then((receipt) => { if (receipt) upgradeInsecureSession(); })
            .catch((error) => reportFailure(createAlert, error, { message: 'unknownOutcome', context: { transactionHash: txHash } }));
        }
      }

      return tx;
    } catch (e) {
      handleExecutionExeption(e, executeCalls);
      throw e;
    } finally {
      setPromptingTransaction(false);
    }
  }, [createAlert, processAccountTransaction, handleExecutionExeption, isDeployed, requireExplicitAuthorization, upgradeInsecureSession, notifyWalletDisconnected, refreshWalletConnection])

  // Primary execute method for system calls (requires name of system, etc.)
  const executeSystem = useCallback(async (key, vars, meta = {}, options = {}) => {
    if (key === 'TransferNft') options = { ...options, allowSponsorship: false, requireExplicitSignature: true };
    if (simulationEnabled) {
      if (MISSION_SYSTEMS.has(key)) {
        throw new Error('Missions are unavailable in simulation.');
      }
      const uuid = `0x${String(performance.now()).replace('.', '')}`;
      dispatchPendingTransaction({
        key,
        vars,
        meta,
        timestamp: blockTime ? (blockTime * 1000) : null,
        txHash: uuid,
        waitingOn: 'TRANSACTION'
      });
      return { status: 'submitted', txHash: uuid };
    }

    const authorization = await recheckTransactionAuthorization(key, vars, recheckAuthorization);
    if (authorization.status !== 'allowed') {
      reportFailure(createAlert, authorization, { message: authorization.status === 'denied' ? 'accessChanged' : 'accessUnavailable', context: { action: key } });
      return authorization;
    }

    const activeWalletAccount = walletAccountRef.current;
    const activeContracts = contractsRef.current;
    if (!activeWalletAccount) {
      if (await refreshWalletConnection() && walletAccountRef.current) {
        return executionRef.current.executeSystem(key, vars, meta, options);
      }
      notifyWalletDisconnected();
      return { status: 'failed' };
    }

    if (!activeContracts?.[key]) {
      createAlert({
        type: 'GenericAlert',
        data: { content: errorMessages.actionFailed },
        level: 'warning',
      });
      return;
    }

    // start prompting state before isAccountLocked since *might* take some time
    // and want to disable isTransaction buttons immediately
    setPromptingTransaction(true);
    let submission;
    const assignment = MISSION_SYSTEMS.has(key) ? vars.assignment : null;
    let missionKey;
    let ownsMissionSubmission = false;
    const { execute: contractExecute, onTransactionError } = activeContracts[key];
    try {
      if (await isWalletAccountLocked(activeWalletAccount)) {
        notifyWalletDisconnected();
        return { status: 'failed' };
      }
      if (assignment) {
        const colony = assignment.subject.label === Entity.IDS.ASTEROID;
        const view = await (colony ? api.getColonizationMissions : api.getStarterMissions)(assignment.subject.id);
        const queryKey = colony ? colonizationMissionsQueryKey : starterMissionsQueryKey;
        queryClient.setQueryData(queryKey(chainId, appConfig.get('Api.influence'), assignment.subject.id), view);
        (colony ? assertColonizationMissionOperation : assertStarterMissionOperation)(view, assignment, key, activeWalletAccount.address);
      }
      if (assignment) {
        missionKey = getMissionAssignmentKey(assignment);
        if (missionSubmissions.current.has(missionKey)
          || findPendingMissionTransaction(useStore.getState().pendingTransactions, assignment)) {
          throw new Error('A transaction for this mission is already pending.');
        }
        missionSubmissions.current.add(missionKey);
        ownsMissionSubmission = true;
        meta = { ...meta, missionAssignment: assignment };
      }
      options.assertCurrent?.();
      await requireExplicitAuthorization(activeWalletAccount, options);
      const missionCandidates = [];
      const tx = await contractExecute(vars, { ...options, missionCandidates });
      if (missionCandidates.length) meta = { ...meta, missionCandidates };
      const txHash = cleanseTxHash(tx);
      if (!txHash) throw new Error('Wallet returned no transaction hash.');
      dispatchPendingTransaction({
        key,
        vars,
        meta,
        timestamp: blockTime ? (blockTime * 1000) : null,
        txHash,
        waitingOn: 'TRANSACTION'
      });
      submission = { status: 'submitted', txHash };
    } catch (e) {
      handleExecutionExeption(e, executeCalls, { key, vars, meta });
      onTransactionError(e, vars);
      if (isWalletRequestTimeout(e)) submission = { status: 'unknown' };
    } finally {
      if (ownsMissionSubmission) missionSubmissions.current.delete(missionKey);
      setPromptingTransaction(false);
    }

    return submission;
  }, [recheckAuthorization, blockTime, chainId, createAlert, handleExecutionExeption, queryClient, requireExplicitAuthorization, simulationEnabled, notifyWalletDisconnected, refreshWalletConnection]); // eslint-disable-line react-hooks/exhaustive-deps

  executionRef.current = { deployAccount, executeCalls, executeSystem };

  const getPendingTx = useCallback((key, vars) => {
    // simulation will only ever have one concurrent?
    if (simulationEnabled) {
      return pendingTransactions.find((tx) => tx.key === key);
    }

    if (contracts && contracts[key]) {
      return pendingTransactions.find((tx) => {
        if (tx.key === key) {
          if (contracts[key].equalityTest === true) {
            return true;
          } else if (contracts[key].equalityTest === 'ALL') {
            return isEqual(tx.vars, vars);
          } else if (contracts[key].equalityTest) {
            return !contracts[key].equalityTest.find((k) => get(tx.vars, k) !== get(vars, k));
          }
        }
        return false;
      });
    }
    return null;
  }, [contracts, pendingTransactions]);

  const getStatus = useCallback((key, vars) => {
    return getPendingTx(key, vars) ? 'pending' : 'ready';
  }, [getPendingTx]);

  return (
    <ChainTransactionContext.Provider value={{
      deployAccount,
      execute: executeSystem,
      executeCalls,
      prepareTransactionFee: (calls, options) => processAccountTransaction(calls, { ...options, prepareFee: true }),
      getStatus,
      getPendingTx,
      promptingTransaction,
      fundingRequirement,
      dismissFunding: () => setFundingRequirement(null)
    }}>
      {children}
      {feePrompt && (
        <TransactionFeePrompt
          accountAddress={accountAddress}
          onConfirm={() => resolveFeePrompt(true)}
          onReject={() => resolveFeePrompt(false)}
          type={feePrompt.type}
        />
      )}
    </ChainTransactionContext.Provider>
  );
};

export default ChainTransactionContext;
