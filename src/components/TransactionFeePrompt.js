import { errorMessages } from '../lib/errorMessages';
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

const copy = errorMessages.feePrompts;

const TransactionFeePrompt = ({ accountAddress, onConfirm, onReject, type }) => {
  const prompt = copy[type];
  if (!prompt) return null;

  return (
    <Dialog>
      <Wrapper>
        <h4>{prompt.title}</h4>
        <article>
          {prompt.body.map(text => <p key={text}>{text}</p>)}
          {type === 'TOP_UP_STRK' && accountAddress && (
            <p>Account address: <code style={{ overflowWrap: 'anywhere' }}>{accountAddress}</code></p>
          )}
        </article>
        <footer>
          <Button onClick={onReject}>{errorMessages.notNow}</Button>
          <Button onClick={onConfirm}>{prompt.confirmText}</Button>
        </footer>
      </Wrapper>
    </Dialog>
  );
};

export default TransactionFeePrompt;
