export const getCrewmatePaymentMode = ({ priceUsdc, balanceUsdc, stripeEnabled }) => {
  if (balanceUsdc >= priceUsdc) return 'crypto';
  return stripeEnabled ? 'stripe' : 'fund';
};
