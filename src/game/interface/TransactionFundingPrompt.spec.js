import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import usePriceHelper from '~/hooks/usePriceHelper';
import TransactionFundingPrompt from './TransactionFundingPrompt';

jest.mock('~/contexts/ChainTransactionContext', () => ({ __esModule: true, default: require('react').createContext({}) }), { virtual: true });
jest.mock('~/hooks/usePriceHelper', () => jest.fn(), { virtual: true });
jest.mock('../launcher/store/FundingFlow', () => ({ totalPrice, onClose, onFunded }) => <div>
  <span>{totalPrice}</span><button onClick={onClose}>Close</button><button onClick={onFunded}>Continue</button>
</div>);

beforeEach(() => jest.clearAllMocks());

test('does not load price data when funding is unnecessary', () => {
  const { container } = render(<TransactionFundingPrompt />);
  expect(container.textContent).toBe('');
  expect(usePriceHelper).not.toHaveBeenCalled();
});

test.each(['Close', 'Continue'])('uses the full target and currency, then dismisses on %s without resubmitting', button => {
  const from = jest.fn(() => 'Purchase target');
  const dismissFunding = jest.fn();
  usePriceHelper.mockReturnValue({ from });
  render(<ChainTransactionContext.Provider value={{ fundingRequirement: { amount: '50', total: '150', token: 'USDC' }, dismissFunding }}>
    <TransactionFundingPrompt />
  </ChainTransactionContext.Provider>);
  expect(from).toHaveBeenCalledWith('150', 'USDC');
  expect(screen.getByText('Purchase target')).toBeTruthy();
  fireEvent.click(screen.getByText(button));
  expect(dismissFunding).toHaveBeenCalledTimes(1);
});
