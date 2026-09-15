import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';

import { appConfig } from '~/appConfig';

const stripePublishableKey = appConfig.get('Api.ClientId.stripe');
export const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

const EmbeddedCheckoutOverlay = styled.div`
  align-items: center;
  background: rgba(0, 0, 0, 0.82);
  display: flex;
  inset: 0;
  justify-content: center;
  position: fixed;
  z-index: 10000;
`;

const EmbeddedCheckoutContainer = styled.div`
  border-radius: 8px;
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  width: min(1000px, calc(100vw - 40px));
`;

const StripeEmbeddedCheckout = ({ clientSecret, label = 'Stripe Checkout', onClose, onComplete }) => {
  const options = useMemo(() => ({ clientSecret, onComplete }), [clientSecret, onComplete]);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return createPortal(
    <EmbeddedCheckoutOverlay onClick={onClose} role="presentation">
      <EmbeddedCheckoutContainer
        aria-label={label}
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        role="dialog">
        <EmbeddedCheckoutProvider
          key={clientSecret}
          stripe={stripePromise}
          options={options}>
          <EmbeddedCheckout />
        </EmbeddedCheckoutProvider>
      </EmbeddedCheckoutContainer>
    </EmbeddedCheckoutOverlay>,
    document.body
  );
};

export default StripeEmbeddedCheckout;
