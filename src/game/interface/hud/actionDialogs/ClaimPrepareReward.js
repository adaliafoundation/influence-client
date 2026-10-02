import { useCallback, useContext } from 'react';
import styled from 'styled-components';

import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import ConfirmationDialog from '~/components/ConfirmationDialog';
import { ClaimRewardIcon } from '~/components/Icons';
import { ActionDialogInner } from '../ActionDialog';

const Wrapper = styled.div`
  display: flex;
  height: 300px;
  width: 650px;
`;

const InnerWrapper = styled.div`
  color: ${p => p.theme.colors.main};
  display: flex;
  flex-direction: row;
  height: 100%;
  align-items: center;
`;

const StyledIcon = styled.div`
  height: 100px;
  margin-right: 20px;
  width: 100px;

  & svg {
    height: 100px;
    width: 100px;
  }
`;

const Content = styled.div`
  & em {
    color: white;
    font-style: normal;
  }
`;

const ClaimPrepareReward = ({ asteroid, onClose }) => {
  const { execute } = useContext(ChainTransactionContext);

  const handleClaim = useCallback(async () => {
    if (asteroid?.AsteroidProof?.used) {
      await execute('ClaimPrepareForLaunchReward', { asteroid });
    } else {
      await execute('InitializeAndClaimPrepareForLaunchReward', { asteroid });
    }

  }, [asteroid, execute]);

  return (
    <ActionDialogInner showClose>
      <Wrapper>
        <ConfirmationDialog
          title="Claim Crewmate Credit"
          body={(
            <InnerWrapper>
              <StyledIcon>
                <ClaimRewardIcon />
              </StyledIcon>
              <Content>
                <p>
                  This asteroid includes a <em>Crewmate Credit</em> to recruit a First Generation Adalian crewmate.
                </p>
                <p>
                  After claiming the credit, you may spend the credit to recruit a crewmate from any
                  accessible <em>habitat</em>.
                </p>
              </Content>
            </InnerWrapper>
          )}
          isTransaction
          onConfirm={handleClaim}
          confirmText="Claim"
          onReject={onClose}
          rejectText="Cancel"
        />
      </Wrapper>
    </ActionDialogInner>
  );
};

export default ClaimPrepareReward;
