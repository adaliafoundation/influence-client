import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import styled, { css, keyframes } from 'styled-components';
import { ArgentXIcon, BraavosIcon } from './Icons';
import useStore from '~/hooks/useStore';

const width = 380;

const Backdrop = styled.div`
  align-items: center;
  background: rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(4px);
  bottom: 0;
  display: flex;
  justify-content: center;
  left: 0;
  position: fixed;
  right: 0;
  top: 0;
  z-index: 99999;
`;

const Dialog = styled.div`
  background: #171717;
  border-radius: 24px;
  display: flex;
  flex-direction: column;
  padding: 24px;
  position: relative;
  width: ${width}px;

  & > h2 {
    color: white;
    font-size: 20px;
    line-height: 28px;
    margin: 0;
    text-align: center;
  }
  & > h6 {
    color: #9ca3af;
    font-size: 14px;
    margin: 0;
    text-align: center;
  }
`;

const CloseButton = styled.div`
  align-items: center;
  background: #262626;
  border-radius: 14px;
  cursor: pointer;
  display: flex;
  height: 28px;
  justify-content: center;
  position: absolute;
  right: 24px;
  top: 24px;
  transition: background 100ms ease;
  width: 28px;
  &:hover {
    background: #444;
  }
`;

const Main = styled.div`
  align-items: center;
  display: flex;
  flex-direction: column;
  flex: 1;
  justify-content: flex-end;
  padding-top: 12px;
`;

const ButtonIcon = styled.span``;
const Button = styled.div`
  align-items: center;
  background: #072935;
  border: 1px solid #57d5ff;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  height: 62px;
  justify-content: center;
  outline: 0px solid green;
  padding: 12px;
  position: relative;
  transition: background 100ms ease;
  width: 100%;
  &:hover {
    background: #0f4153;
  }

  & > ${ButtonIcon} {
    align-items: center;
    color: white;
    display: flex;
    font-size: 28px;
    position: absolute;
    left: 12px;
    top: 12px;
    height: 38px;
  }

  & > div {
    text-align: center;
    & > label {
      color: white;
      display: block;
      font-size: 15px;
      font-weight: bold;
    }
    & > span {
      color: #8c8c8c;
      font-size: 12px;
    }
  }
`;

const Alts = styled.div`
  color: #777;
  cursor: pointer;
  margin-top: 16px;
  transition: color 100ms ease;

  &:hover {
    color: white;
  }
`;

// TODO: update argent icons (to "Ready" icons)
const configs = {
  argentMobile: {
    id: 'argentMobile',
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="8" fill="#FF875B"></rect>
        <path d="M18.316 8H13.684C13.5292 8 13.4052 8.1272 13.4018 8.28531C13.3082 12.7296 11.0323 16.9477 7.11513 19.9355C6.99077 20.0303 6.96243 20.2085 7.05335 20.3369L9.76349 24.1654C9.85569 24.2957 10.0353 24.3251 10.1618 24.2294C12.6111 22.3734 14.5812 20.1345 16 17.6529C17.4187 20.1345 19.389 22.3734 21.8383 24.2294C21.9646 24.3251 22.1443 24.2957 22.2366 24.1654L24.9467 20.3369C25.0375 20.2085 25.0092 20.0303 24.885 19.9355C20.9676 16.9477 18.6918 12.7296 18.5983 8.28531C18.5949 8.1272 18.4708 8 18.316 8Z" fill="white"></path>
      </svg>
    ),
    label: 'Ready (mobile)'
  },
  argentX: {
    id: 'argentX',
    icon: <ArgentXIcon />,
    label: 'Ready Wallet (formerly Argent)'
  },
  braavos: {
    id: 'braavos',
    icon: <BraavosIcon />,
    label: 'Braavos'
  },
  webWallet: {
    id: 'webWallet',
    icon: (
      <svg width="32" height="28" viewBox="0 0 18 14" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path fillRule="evenodd" clipRule="evenodd" d="M1.5 0.4375C0.982233 0.4375 0.5625 0.857233 0.5625 1.375V12C0.5625 12.4144 0.72712 12.8118 1.02015 13.1049C1.31317 13.3979 1.7106 13.5625 2.125 13.5625H15.875C16.2894 13.5625 16.6868 13.3979 16.9799 13.1049C17.2729 12.8118 17.4375 12.4144 17.4375 12V1.375C17.4375 0.857233 17.0178 0.4375 16.5 0.4375H1.5ZM2.4375 3.50616V11.6875H15.5625V3.50616L9.63349 8.94108C9.27507 9.26964 8.72493 9.26964 8.36651 8.94108L2.4375 3.50616ZM14.0899 2.3125H3.91013L9 6.97822L14.0899 2.3125Z" fill="currentColor"></path>
      </svg>
    ),
    label: 'Email',
    sublabel: 'Powered by Ready'
  },

}

const LoginPrompt = ({ onClick, target }) => {
  const lastConnectedWalletId = useStore(s => s.lastConnectedWalletId);

  const conf = useMemo(() => configs[lastConnectedWalletId] || configs.webWallet, [lastConnectedWalletId]);

  return createPortal(
    (
      <Backdrop>
        <Dialog>
          <CloseButton onClick={() => onClick()}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9.77275 3.02275C9.99242 2.80308 9.99242 2.44692 9.77275 2.22725C9.55308 2.00758 9.19692 2.00758 8.97725 2.22725L6 5.20451L3.02275 2.22725C2.80308 2.00758 2.44692 2.00758 2.22725 2.22725C2.00758 2.44692 2.00758 2.80308 2.22725 3.02275L5.20451 6L2.22725 8.97725C2.00758 9.19692 2.00758 9.55308 2.22725 9.77275C2.44692 9.99242 2.80308 9.99242 3.02275 9.77275L6 6.79549L8.97725 9.77275C9.19692 9.99242 9.55308 9.99242 9.77275 9.77275C9.99242 9.55308 9.99242 9.19692 9.77275 8.97725L6.79549 6L9.77275 3.02275Z" fill="currentColor"></path>
            </svg>
          </CloseButton>
          <h6>Connect to</h6>
          <h2>Influence</h2>
          <Main>
            <Button onClick={() => onClick(conf.id)}>
              <ButtonIcon>
                {conf.icon}
              </ButtonIcon>
              <div>
                <label>{conf.label}</label>
                {conf.sublabel && <span>{conf.sublabel}</span>}
              </div>
            </Button>
            <Alts onClick={() => onClick(false)}>Other Login Options...</Alts>
          </Main>
        </Dialog>
      </Backdrop>
    ),
    document.body
  );
};

export default LoginPrompt;