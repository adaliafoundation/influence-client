import { appConfig } from '~/appConfig';

export const sessionPolicyMethods = [
  { contractAddress: appConfig.get('Starknet.Address.dispatcher'), selector: 'run_system' },
  { contractAddress: appConfig.get('Starknet.Address.swayToken'), selector: 'transfer_with_confirmation' },
  { contractAddress: appConfig.get('Starknet.Address.escrow'), selector: 'withdraw' },
  { contractAddress: appConfig.get('Starknet.Address.escrow'), selector: 'deposit' }
];

export const allowedMethods = sessionPolicyMethods.map(({ contractAddress, selector }) => ({
  'Contract Address': contractAddress,
  selector
}));

const contractNames = {
  [appConfig.get('Starknet.Address.dispatcher')]: 'Influence Game Dispatcher',
  [appConfig.get('Starknet.Address.swayToken')]: 'SWAY',
  [appConfig.get('Starknet.Address.escrow')]: 'Influence Escrow'
};

const methodNames = {
  deposit: 'Deposit',
  run_system: 'Run Game Action',
  transfer_with_confirmation: 'Marketplace Transfer',
  withdraw: 'Withdraw'
};

export const buildGameplaySessionPolicies = (methods = sessionPolicyMethods) => {
  return methods.reduce((policies, { contractAddress, selector }) => {
    if (!policies.contracts[contractAddress]) {
      policies.contracts[contractAddress] = {
        name: contractNames[contractAddress],
        methods: []
      };
    }

    policies.contracts[contractAddress].methods.push({
      name: methodNames[selector] || selector,
      entrypoint: selector
    });

    return policies;
  }, { contracts: {} });
};
