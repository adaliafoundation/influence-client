import { useCallback, useContext, useMemo } from 'react';
import styled from 'styled-components';
import { Entity } from '@influenceth/sdk';

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

const ClaimArrivalReward = ({ asteroid, crew, onClose }) => {
  const { execute } = useContext(ChainTransactionContext);

  const payload = useMemo(() => {
    return {
      asteroid: { id: asteroid?.id, label: Entity.IDS.ASTEROID },
      caller_crew: { id: crew?.id, label: Entity.IDS.CREW }
    };
  }, [asteroid?.id, crew?.id]);

  const handleClaim = useCallback(async () => {
    await execute('ClaimArrivalReward', payload);
  }, [execute, payload]);

  return (
    <ActionDialogInner showClose>
      <Wrapper>
        <ConfirmationDialog
          title="Claim Arrival Reward"
          body={(
            <InnerWrapper>
              <StyledIcon>
                <ClaimRewardIcon />
              </StyledIcon>
              <Content>
                <p>
                  This asteroid includes a <em>Starter Pack</em> for early arrivals, built from the dissassembled
                  remains of the Arvad generational ship. Use it wisely to help settle and exploit the Adalian belt...
                </p>
                <p>
                  Your starter pack will be available in orbit around <em>Adalia Prime</em>, and may also be found in
                  the My Assets list.
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

export default ClaimArrivalReward;
