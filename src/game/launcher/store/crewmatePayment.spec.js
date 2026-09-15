import { getCrewmatePaymentMode } from './crewmatePayment';

test.each([false, true])('uses available crypto regardless of Stripe configuration (%s)', (stripeEnabled) => {
  expect(getCrewmatePaymentMode({ priceUsdc: 5000000, balanceUsdc: 5000000, stripeEnabled })).toBe('crypto');
});

test('requests funding when the player is short of USDC and Stripe is unavailable', () => {
  expect(getCrewmatePaymentMode({ priceUsdc: 5000000, balanceUsdc: 4999999, stripeEnabled: false })).toBe('fund');
});

test('offers checkout to an underfunded player when Stripe is configured', () => {
  expect(getCrewmatePaymentMode({ priceUsdc: 5000000, balanceUsdc: 0, stripeEnabled: true })).toBe('stripe');
});
