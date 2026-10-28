import ConfirmationDialog from '~/components/ConfirmationDialog';
import WarningAlert from '~/components/WarningAlert';
import { formatSwapAmount } from '~/lib/swaySwap';

const SwaySwapReview = ({ review, expired, loading, onConfirm, onReject }) => {
  return (
    <ConfirmationDialog
      title="Review USDC → SWAY swap"
      confirmText="Confirm swap"
      isTransaction
      loading={loading}
      disabled={expired}
      onConfirm={onConfirm}
      onReject={onReject}
      body={<>
        <p>Spend: <b>{formatSwapAmount(review.amount)} USDC</b></p>
        <p>Expected output: <b>{formatSwapAmount(BigInt(review.quote.buyAmount))} SWAY</b></p>
        <p>Minimum received: <b>{formatSwapAmount(review.minimumReceived)} SWAY</b></p>
        <p>Slippage: {review.slippageBps / 100}%</p>
        <p>Maximum network fee: {review.fee.mode === 'sponsored' ? 'Sponsored (no charge)' : `${formatSwapAmount(review.fee.maxFee, review.fee.decimals)} ${review.fee.name}`}</p>
        <p>Total USDC required: {formatSwapAmount(review.amount + (review.fee.name === 'USDC' ? review.fee.maxFee : 0n))} USDC</p>
        <p>Route: {review.quote.routes.map(route => route.name).join(', ') || 'AVNU'}</p>
        {review.quote.fee && <p>Included fees: AVNU {Number(review.quote.fee.avnuFeesBps) / 100}%; integrator {Number(review.quote.fee.integratorFeesBps) / 100}%.</p>}
        <p>Confirm to exchange USDC for SWAY through AVNU. Your wallet will approve USDC spending for this swap.</p>
        {expired && <WarningAlert severity="warning" role="alert"><div>Quote expired. Go back and review a new quote.</div></WarningAlert>}
      </>}
    />
  );
};

export default SwaySwapReview;
