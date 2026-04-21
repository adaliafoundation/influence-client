import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { useQuery } from '@tanstack/react-query';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';

import { appConfig } from '~/appConfig';
import BrightButton from '~/components/BrightButton';
import Details from '~/components/DetailsV2';
import PageLoader from '~/components/PageLoader';
import useStore from '~/hooks/useStore';
import api from '~/lib/api';
import { nativeBool } from '~/lib/utils';
import { useEffect, useState } from 'react';
import { WarningIcon } from '~/components/Icons';

const stripePromise = loadStripe(appConfig.get('Api.ClientId.stripe'));

const CheckoutForm = styled.form``;
const PaymentButton = styled(BrightButton).attrs({ success: true })`
  margin: 20px auto 20px;
  width: calc(100% - 8px);
`;

const ErrorMessage = styled.div`
  align-items: center;
  background: rgba(${p => p.theme.colors.errorRGB}, 0.25);
  color: white;
  display: flex;
  margin: 20px 0;
  min-height: 21px;
  padding: 15px 25px;
  justify-content: center;
  width: 100%;
  & > svg {
    font-size: 125%;
    margin-right: 8px;
  }
`;

const StripeInner = ({ onClose, price, productId, productName, metadata = {} }) => {
  const createAlert = useStore(s => s.dispatchAlertLogged);
  const elements = useElements();
  const stripe = useStripe();

  const [errMsg, setErrMsg] = useState();

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!stripe || !elements) return;

    let errMsg;
    try {
      const result = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
        confirmParams: {
          return_url: `${window.location.origin}${window.location.pathname || '/launcher/store'}`,
        }
      });
      if (result.error) {
        errMsg = result.error.message;
      } else if (result.paymentIntent.status === 'succeeded') {
        createAlert({
          type: 'GenericAlert',
          data: { content: 'Payment submitted successfully. Processing...' },
          level: 'success',
          duration: 5000
        });
        onClose();
        return;
      } else {
        console.log('unexpected stripe result!', result);
      }
    } catch (e) {
      errMsg = e.message;
    }

    setErrMsg(errMsg || 'Something went wrong. Please try again.');
  };

  useEffect(() => {
    if (errMsg) {
      const to = setTimeout(() => {
        setErrMsg();
      }, 5000);
      return () => clearTimeout(to);
    }
  }, [errMsg]);

  return (
    <CheckoutForm onSubmit={handleSubmit}>
      <PaymentElement />
      {errMsg
        ? <ErrorMessage><WarningIcon /> <span>{errMsg}</span></ErrorMessage>
        : (
          <PaymentButton disabled={nativeBool(!stripe)} type="submit">
            Submit Payment{price ? ` ($${price / 100})` : ''}
          </PaymentButton>
        )
      }
    </CheckoutForm>
  );
};

const StripeCheckout = (props) => {
  const { data: intent, isLoading } = useQuery({
    queryKey: ['stripeIntent', props.productId],
    queryFn: () => api.createStripePaymentIntent(props.productId),
    enabled: !!props.productId
  });

  return createPortal(
    (
      <Details
        title={props.productName || "Checkout"}
        onClose={props.onClose}
        modalMode
        style={{ zIndex: 9000 }}>
        <div style={{ ...(isLoading ? { height: 300 } : { minHeight: 300 }), minWidth: 440 }}>
          {isLoading && <PageLoader message="Connecting to Stripe..." />}
          {!isLoading && !intent && <div>Failed to connect to Stripe. Please refresh and try again.</div>}
          {intent?.client_secret && (
            <Elements
              stripe={stripePromise}
              options={{
                appearance: {
                  theme: 'night'
                },
                clientSecret: intent?.client_secret
              }}>
              <StripeInner {...props} />
            </Elements>
          )}
        </div>
      </Details>
    ),
    document.body
  );
};

export default StripeCheckout;
