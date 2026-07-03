import React from 'react';
import styled from 'styled-components';

import Button from '~/components/ButtonAlt';
import Dialog from '~/components/Dialog';
import { UpdateIcon } from '~/components/Icons';

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 260px;
  padding: 24px 32px 28px;
  width: 520px;

  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    padding: 20px;
    width: 86vw;
  }
`;

const Title = styled.div`
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  display: flex;
  padding-bottom: 18px;

  & > svg {
    color: ${p => p.theme.colors.main};
    height: 28px;
    margin-right: 14px;
    width: 28px;
  }

  & > h4 {
    flex: 1;
    font-size: 22px;
    margin: 0;
  }
`;

const Body = styled.div`
  color: ${p => p.theme.colors.mainText};
  flex: 1;
  font-size: 16px;
  line-height: 1.5;
  padding: 28px 0;
`;

const Buttons = styled.div`
  align-items: center;
  display: flex;
  justify-content: flex-end;
`;

const VersionUpdateDialog = ({ onReload }) => (
  <Dialog backdrop="rgba(0, 0, 0, 0.72)">
    <Wrapper>
      <Title>
        <UpdateIcon />
        <h4>Client Update Required</h4>
      </Title>
      <Body>
        A new version of the Influence client is ready. Reload now to continue
        with the latest game client.
      </Body>
      <Buttons>
        <Button onClick={onReload} size="medium">
          Reload Client
        </Button>
      </Buttons>
    </Wrapper>
  </Dialog>
);

export default VersionUpdateDialog;
