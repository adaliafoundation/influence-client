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
          Influence uses STRK first, followed by the AVNU fee tokens you authorize.
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
          Allow Influence to pay those fees from your USDC balance through AVNU when STRK is unavailable?
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
          Allow Influence to pay the small per-action fee from your SWAY balance through AVNU when STRK and USDC
          are unavailable?
        </p>
      </>
    )
  },
  TOP_UP: {
    confirmText: 'Top Up Wallet',
    title: 'Operational Reserve Required',
    body: (
      <>
        <p>Your crew has moved beyond its starter provisions and now funds its own network clearance.</p>
        <p>Top up your USDC wallet balance to continue playing. There is no subscription—you only pay when your crew acts.</p>
      </>
    )
  }
};

const TransactionFeePrompt = ({ onConfirm, onReject, type }) => {
  const prompt = copy[type];
  if (!prompt) return null;

  return (
    <Dialog>
      <Wrapper>
        <h4>{prompt.title}</h4>
        <article>{prompt.body}</article>
        <footer>
          <Button onClick={onReject}>Not Now</Button>
          <Button onClick={onConfirm}>{prompt.confirmText}</Button>
        </footer>
      </Wrapper>
    </Dialog>
  );
};

export default TransactionFeePrompt;
