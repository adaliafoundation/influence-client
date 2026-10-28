import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import SwaySKU from './SwaySKU';
import useSession from '~/hooks/useSession';
import useSwapHelper from '~/hooks/useSwapHelper';
import { useUSDCBalance } from '~/hooks/useWalletTokenBalance';
import ChainTransactionContext from '~/contexts/ChainTransactionContext';

jest.mock('starknet', () => ({ stark: { resourceBoundsToEstimateFeeResponse: () => ({ overall_fee: 10n }) } }));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: jest.fn() }) }));
jest.mock('~/hooks/useSession', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useSwapHelper', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useWalletTokenBalance', () => ({ useUSDCBalance: jest.fn(), useStrkBalance: jest.fn() }), { virtual: true });
jest.mock('~/contexts/ChainTransactionContext', () => ({ __esModule: true, default: require('react').createContext({}) }), { virtual: true });
jest.mock('~/hooks/useFundingFlow', () => () => ({ onVerifyFunds: (_, fn) => fn() }), { virtual: true });
jest.mock('~/hooks/usePriceHelper', () => () => ({ from: () => ({ to: () => 5000000 }) }), { virtual: true });
jest.mock('~/hooks/useStore', () => () => jest.fn(), { virtual: true });
jest.mock('~/lib/priceUtils', () => ({ TOKEN: { USDC: 'usdc', SWAY: 'sway' }, TOKEN_SCALE: { usdc: 1e6, sway: 1e6 }, TOKEN_FORMAT: {} }), { virtual: true });
jest.mock('~/lib/utils', () => ({ reactBool: Boolean, cleanseTxHash: tx => tx.transaction_hash, fireTrackingEvent: jest.fn() }), { virtual: true });
jest.mock('~/lib/swaySwap', () => ({
  parseUsdcAmount: value => BigInt(Number(value) * 1e6),
  parseSlippageBps: value => Number(value) * 100,
  formatSwapAmount: value => String(Number(value) / 1e6),
  assertSwapCurrent: (swap, current) => {
    if (swap.accountAddress !== current.accountAddress || swap.chainId !== current.chainId) throw new Error('Wallet changed');
    if (Date.now() >= swap.expiresAt) throw new Error('Quote expired');
  }
}), { virtual: true });
jest.mock('~/components/Icons', () => ({ SwayIcon: () => null }), { virtual: true });
jest.mock('~/components/TextInputUncontrolled', () => ({ __esModule: true, default: props => <input {...props} />, TextInputWrapper: ({ children }) => <div>{children}</div> }), { virtual: true });
jest.mock('~/components/ButtonPill', () => ({ children, onClick, disabled }) => <button onClick={onClick} disabled={disabled}>{children}</button>, { virtual: true });
jest.mock('~/components/UserPrice', () => ({ UsdPrice: () => null }), { virtual: true });
jest.mock('~/components/WarningAlert', () => ({ children }) => <div role="alert">{children}</div>, { virtual: true });
jest.mock('./components/PurchaseForm', () => ({ PurchaseForm: ({ children }) => <div>{children}</div> }));
jest.mock('./components/SKUTitle', () => ({ children }) => <h2>{children}</h2>);
jest.mock('./components/SKUHighlight', () => ({ children }) => <div>{children}</div>);
jest.mock('./components/SKUInputRow', () => ({ children }) => <div>{children}</div>);
jest.mock('./components/SKUButton', () => ({ onClick, disabled }) => <button onClick={onClick} disabled={disabled}>Review swap</button>);
jest.mock('./components/SwaySwapReview', () => ({ review, expired, loading, onConfirm, onReject }) => <div>
  <span>Minimum {String(review.minimumReceived)}</span>
  <button onClick={onConfirm} disabled={expired || loading}>Confirm swap</button>
  <button onClick={onReject} disabled={loading}>Back</button>
</div>);

let session, prepare, execute, swap, prepareFee;
const tree = () => <ThemeProvider theme={{ colors: { main: '#fff' } }}>
  <ChainTransactionContext.Provider value={{ executeCalls: execute, deployAccount: jest.fn(), prepareTransactionFee: prepareFee }}><SwaySKU /></ChainTransactionContext.Provider>
</ThemeProvider>;
beforeEach(() => {
  session = { accountAddress: 'account', chainId: 'chain', isDeployed: true,
    walletAccount: { estimateInvokeFee: jest.fn().mockResolvedValue({ resourceBounds: {} }) },
    provider: { waitForTransaction: jest.fn().mockResolvedValue({ execution_status: 'SUCCEEDED' }) } };
  swap = { accountAddress: 'account', chainId: 'chain', amount: 5000000n, minimumReceived: 900n,
    calls: [{ entrypoint: 'swap', calldata: ['reviewed'] }], expiresAt: Date.now() + 60000 };
  prepare = jest.fn().mockResolvedValue(swap);
  execute = jest.fn().mockResolvedValue({ transaction_hash: 'tx' });
  prepareFee = jest.fn().mockResolvedValue({ mode: 'default', name: 'USDC', maxFee: 100n });
  useSession.mockImplementation(() => session);
  useSwapHelper.mockReturnValue(prepare);
  useUSDCBalance.mockReturnValue({ data: 10000000n, refetch: jest.fn().mockResolvedValue({ data: 10000000n }) });
});

test('requires review and executes the same calls without requoting', async () => {
  render(tree());
  fireEvent.click(screen.getByText('Review swap'));
  await screen.findByText('Minimum 900');
  expect(execute).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Confirm swap'));
  await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(prepareFee).toHaveBeenCalledWith(swap.calls, expect.objectContaining({ allowSponsorship: false, requireExplicitSignature: true }));
  expect(execute).toHaveBeenCalledWith(swap.calls, expect.objectContaining({ requireExplicitSignature: true, allowSponsorship: false, reviewedFee: { mode: 'default', name: 'USDC', maxFee: 100n }, reservedAmounts: { usdc: 5000000n } }));
});

test('cancelling review never submits', async () => {
  render(tree());
  fireEvent.click(screen.getByText('Review swap'));
  await screen.findByText('Back');
  fireEvent.click(screen.getByText('Back'));
  expect(screen.queryByText('Confirm swap')).not.toBeInTheDocument();
  expect(execute).not.toHaveBeenCalled();
});

test('discards a quote returned after an account change', async () => {
  let resolve;
  prepare.mockReturnValue(new Promise(r => { resolve = r; }));
  const { rerender } = render(tree());
  fireEvent.click(screen.getByText('Review swap'));
  session = { ...session, accountAddress: 'other' };
  rerender(tree());
  await act(async () => resolve(swap));
  expect(screen.queryByText('Confirm swap')).not.toBeInTheDocument();
  expect(execute).not.toHaveBeenCalled();
});

test('insufficient funds for fees prevents confirmation', async () => {
  prepareFee.mockRejectedValue(new Error('Insufficient balance for network fees.'));
  render(tree());
  fireEvent.click(screen.getByText('Review swap'));
  await screen.findByText('Insufficient balance for network fees.');
  expect(screen.queryByText('Confirm swap')).not.toBeInTheDocument();
  expect(execute).not.toHaveBeenCalled();
});
