import { useContext } from 'react';
import styled from 'styled-components';

import ButtonLoadingBar from '~/components/ButtonLoadingBar';
import { FinishAllIcon } from '~/components/Icons';
import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import useTransactionSubmission from '~/hooks/useTransactionSubmission';

const Button = styled.button`
  align-items: center;
  background: transparent;
  border: 0;
  color: ${p => p.theme.colors.success};
  cursor: ${p => p.theme.cursors.active};
  display: flex;
  filter: drop-shadow(0px 0px 2px rgba(0, 0, 0, 0.3));
  flex: 0 0 34px;
  font: inherit;
  font-size: 14px;
  margin-top: 4px;
  padding: 0;
  pointer-events: all;
  position: relative;
  text-align: left;
  width: 100%;

  & > svg {
    margin-left: 4px;
    margin-right: 9px;
    font-size: 150%;
  }

  &:hover:not(:disabled) {
    color: white;
    text-decoration: underline;
  }

  &:disabled {
    cursor: ${p => p.theme.cursors.default};
    opacity: 0.5;
  }
`;

const FinishAllReadyButton = ({ loading, onClick }) => {
  const { promptingTransaction } = useContext(ChainTransactionContext);
  const { busy, run } = useTransactionSubmission();
  const finishing = loading || busy;

  return (
    <Button
      type="button"
      disabled={!!(finishing || promptingTransaction)}
      aria-busy={!!finishing}
      onClick={() => run(onClick)}>
      {finishing && <ButtonLoadingBar color="currentColor" top={0} />}
      <FinishAllIcon /> Finish All Ready Items
    </Button>
  );
};

export default FinishAllReadyButton;
