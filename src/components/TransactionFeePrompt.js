import styled from 'styled-components';

import Button from '~/components/Button';
import Dialog from '~/components/Dialog';

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 300px;
  padding: 10px 30px;
  width: 650px;

  & > h4 {
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
    margin: 0;
    padding: 20px 0;
  }

  & > article {
    color: #ccc;
    flex: 1;
    font-size: 15px;
    line-height: 1.5;
    padding: 20px 0;
  }

  & > footer {
    display: flex;
    justify-content: space-between;
    padding: 8px 0 16px;
  }

  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    width: 90vw;
  }
`;

const copy = {
  TRANSITION: {
    confirmText: 'Continue Operations',
    title: 'Starter Provisions Complete',
    body: (
      <>
        <p>The Prime Council underwrote the network clearance for your crew's first operations. Those provisions are now complete.</p>
        <p>
          Your crew now operates independently. There is no subscription—you only pay a small network fee when your crew acts.
          Influence uses the AVNU fee tokens you authorize, with STRK as a fallback.
        </p>
      </>
    )
  },
  USDC: {
    confirmText: 'Allow USDC Fees',
    title: 'Authorize Operational Fees',
    body: (
      <>
        <p>Your crew's starter provisions covered the network clearance for its first operations.</p>
        <p>
          From here, each order carries a small network fee. There is no subscription—you only pay when your crew acts.
          Allow Influence to pay those fees from your USDC balance through AVNU?
        </p>
      </>
    )
  },
  SWAY: {
    confirmText: 'Allow SWAY Fees',
    title: 'Authorize Operational Fees',
    body: (
      <>
        <p>Your crew needs network clearance to continue this operation.</p>
        <p>
          Allow Influence to pay the small per-action fee from your SWAY balance through AVNU when USDC is unavailable?
        </p>
      </>
    )
  },
  PAYMASTER_UNAVAILABLE: {
    confirmText: 'Continue with STRK',
    title: 'Sponsored Fees Unavailable',
    body: <p>The paymaster is temporarily unavailable. You can continue by paying network fees from your STRK balance.</p>
  },
  TOP_UP_STRK: {
    confirmText: 'OK',
    title: 'STRK Required for Network Fees',
    body: (
      <>
        <p>We could not complete this transaction with native STRK fees. Gasless fee payment is currently unavailable.</p>
        <p>Check your balance and transfer STRK to your account on Starknet to pay network fees, then try again.</p>
      </>
    )
  },
  TOP_UP: {
    confirmText: 'Top Up Wallet',
    title: 'Operational Reserve Required',
    body: (
      <>
        <p>We could not complete this transaction using the available network fee payment methods.</p>
        <p>Check your balance and top up your account with USDC or STRK to pay network fees. There is no subscription—you only pay when your crew acts.</p>
      </>
    )
  }
};

const TransactionFeePrompt = ({ accountAddress, onConfirm, onReject, type }) => {
  const prompt = copy[type];
  if (!prompt) return null;

  return (
    <Dialog>
      <Wrapper>
        <h4>{prompt.title}</h4>
        <article>
          {prompt.body}
          {type === 'TOP_UP_STRK' && accountAddress && (
            <p>Account address: <code style={{ overflowWrap: 'anywhere' }}>{accountAddress}</code></p>
          )}
        </article>
        <footer>
          <Button onClick={onReject}>Not Now</Button>
          <Button onClick={onConfirm}>{prompt.confirmText}</Button>
        </footer>
      </Wrapper>
    </Dialog>
  );
};

export default TransactionFeePrompt;
