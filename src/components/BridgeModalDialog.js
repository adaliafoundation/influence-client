import useStore from '~/hooks/useStore';
import React from 'react';
import styled from 'styled-components';

import { appConfig } from '~/appConfig';
import Button from '~/components/ButtonAlt';
import IconButton from '~/components/IconButton';
import { CloseIcon } from '~/components/Icons';
import Dialog from '~/components/Dialog';
import starknetLogo from '~/assets/images/starknet-logo.png';

const Container = styled.div`
  background: linear-gradient(45deg, rgba(2,0,36,1) 0%, rgba(31,31,90,1) 100%);
  display: flex;
  flex-direction: column;
  min-height: 300px;
  position: relative;
  width: 685px;

  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    width: 90vw;
  }
`;
const ContentBody = styled.div`
  flex: 1;
  font-size: 15px;
  padding: 40px 80px;
  & > img {
    display: block;
    margin: 0 auto;
  }
  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    padding: 40px 20px;
  }
`;

const InnerContainer = styled.div`
  border: 1px solid rgba(255,255,255,0.3);
  border-width: 1px 0;
  margin: 25px 0 35px;
  padding: 20px 0;
  & > div {
    text-align: center;
    &:not(:last-child) {
      margin-bottom: 20px;
    }

    a {
      white-space: nowrap;
    }
  }
`;

const Title = styled.div`
  color: ${p => p.theme.colors.main};
  font-weight: bold;
`;

const ButtonContainer = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
`;

const CloseButton = styled(IconButton)`
  opacity: 0.6;
  position: absolute !important;
  top: 12px;
  right: 5px;
  z-index: 1;

  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    right: 0;
  }
`;

// TODO: since the updated HUD login screen, this is no longer linked anywhere... find a place for it

const BridgeModalDialog = ({ onClose }) => {
  const dispatchLauncherPage = useStore(s => s.dispatchLauncherPage);
  const openBridge = () => {
    onClose();
    dispatchLauncherPage('bridge');
  };

  return (
    <Dialog>
      <Container>
        <CloseButton onClick={onClose} borderless>
          <CloseIcon />
        </CloseButton>
        <ContentBody>
          <img src={starknetLogo} alt="Starknet" />
          <InnerContainer>
            <Title>Influence is now on Starknet, the L2 Ethereum Network!</Title>
            <div>
              All of your assets are still accounted for and can still be traded on either
              L1 Ethereum (i.e. via <a href={`${appConfig.get('Url.ethereumNftMarket')}/Influence?tab=created`} target="_blank" rel="noreferrer">OpenSea</a>)
              or Starknet (i.e. via <a href={appConfig.get('Url.starknetNftMarket')} target="_blank" rel="noreferrer">Unframed</a>)
            </div>
            <div>
              In the interest of lower transaction fees, however, Influence itself will only be
              playable with assets that have been bridged to Layer 2.
            </div>
          </InnerContainer>
          <ButtonContainer>
            <Button onClick={openBridge}>Open the L1/L2 Bridge</Button>
          </ButtonContainer>
        </ContentBody>
      </Container>
    </Dialog>
  );
};

export default BridgeModalDialog;
