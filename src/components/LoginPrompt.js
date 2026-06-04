import styled from 'styled-components';

import { ArgentXIcon, BraavosIcon } from '~/components/Icons';
import { hexToRGB } from '~/theme';

const Panel = styled.div`
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  max-height: ${p => p.expanded ? '560px' : 0};
  min-height: 0;
  overflow: hidden;
  opacity: ${p => p.expanded ? 1 : 0};
  position: relative;
  transition: max-height 360ms cubic-bezier(0.2, 0.8, 0.2, 1),
    border-width 360ms cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 220ms ease,
    transform 360ms cubic-bezier(0.2, 0.8, 0.2, 1);
  width: 300px;
`;

const Prompt = styled.div`
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  opacity: ${p => p.busy ? 0.62 : 1};
  pointer-events: ${p => p.busy ? 'none' : 'auto'};
  transition: opacity 180ms ease;
  width: 100%;

  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    padding: 24px 20px 24px;

    & > h2 {
      font-size: 24px;
      line-height: 30px;
    }
  }
`;

const Options = styled.div`
  align-items: center;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const OptionButton = styled.button`
  background: transparent;
  border: 1px solid ${p => p.theme.colors.main};
  border-radius: 35px;
  color: ${p => p.theme.colors.main};
  cursor: ${p => p.theme.cursors[p.disabled ? 'default' : 'active']};
  display: flex;
  font-family: 'Jura', sans-serif;
  font-size: 20px;
  height: 70px;
  padding: 3px;
  pointer-events: auto;
  position: relative;
  text-transform: none;
  transition: all 100ms ease;
  width: 100%;

  &:active:not(:disabled) {
    & > div {
      background-color: ${p => p.theme.colors.darkMain};
    }
  }

  &:hover:not(:disabled) {
    border-color: ${p => p.theme.colors.brightMain};
    color: white;

    & > div {
      background-color: rgba(${p => hexToRGB(p.theme.colors.main)}, 0.5);
    }

    & > svg {
      stroke: ${p => p.theme.colors.brightMain};
    }
  }

  & > div {
    background-color: rgba(${p => hexToRGB(p.theme.colors.main)}, 0.25);
    border-radius: 31px;
    justify-content: flex-start;
    height: 62px;
    padding-left: 10px;
    transition: background-color 100ms ease;
  }
`;

const OptionContent = styled.div`
  align-items: center;
  display: flex;
  gap: 14px;
  min-width: 0;
  text-align: left;
  width: 100%;
`;

const ButtonIcon = styled.span`
  align-items: center;
  color: white;
  display: flex;
  flex: 0 0 38px;
  justify-content: center;

  & > svg {
    max-height: 32px;
    max-width: 32px;
  }
`;

const ButtonText = styled.span`
  display: flex;
  filter: drop-shadow(0px 0px 2px rgba(1, 1, 1, 1));
  flex: 1;
  flex-direction: column;
  min-width: 0;

  & > label {
    color: white;
    cursor: inherit;
    display: block;
    font-size: 16px;
    font-weight: bold;
    line-height: 20px;
    overflow-wrap: anywhere;
    text-transform: none;
  }

  & > span {
    color: ${p => p.theme.colors.secondaryText};
    display: block;
    font-size: 12px;
    line-height: 16px;
    margin-top: 2px;
    text-transform: none;
  }
`;

const configs = {
  argentMobile: {
    id: 'argentMobile',
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="8" fill="#FF875B"></rect>
        <path d="M18.316 8H13.684C13.5292 8 13.4052 8.1272 13.4018 8.28531C13.3082 12.7296 11.0323 16.9477 7.11513 19.9355C6.99077 20.0303 6.96243 20.2085 7.05335 20.3369L9.76349 24.1654C9.85569 24.2957 10.0353 24.3251 10.1618 24.2294C12.6111 22.3734 14.5812 20.1345 16 17.6529C17.4187 20.1345 19.389 22.3734 21.8383 24.2294C21.9646 24.3251 22.1443 24.2957 22.2366 24.1654L24.9467 20.3369C25.0375 20.2085 25.0092 20.0303 24.885 19.9355C20.9676 16.9477 18.6918 12.7296 18.5983 8.28531C18.5949 8.1272 18.4708 8 18.316 8Z" fill="white"></path>
      </svg>
    ),
    label: 'Ready Mobile',
    sublabel: 'Mobile app, formerly Argent'
  },
  argentX: {
    id: 'argentX',
    icon: <ArgentXIcon />,
    label: 'Ready Wallet',
    sublabel: 'Formerly Argent X'
  },
  braavos: {
    id: 'braavos',
    icon: <BraavosIcon />,
    label: 'Braavos'
  },
  controller: {
    id: 'controller',
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="8" fill="#191a1a"></rect>
        <path d="M11.6 10.2H20.4V14.8H11.6V10.2Z" fill="#FBCB4A"></path>
        <path d="M8 18.1H24V22.7H8V18.1Z" fill="#FBCB4A"></path>
      </svg>
    ),
    label: 'Cartridge Controller',
    sublabel: 'Embedded account'
  },
  webWallet: {
    id: 'webWallet',
    icon: (
      <svg width="32" height="28" viewBox="0 0 18 14" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path fillRule="evenodd" clipRule="evenodd" d="M1.5 0.4375C0.982233 0.4375 0.5625 0.857233 0.5625 1.375V12C0.5625 12.4144 0.72712 12.8118 1.02015 13.1049C1.31317 13.3979 1.7106 13.5625 2.125 13.5625H15.875C16.2894 13.5625 16.6868 13.3979 16.9799 13.1049C17.2729 12.8118 17.4375 12.4144 17.4375 12V1.375C17.4375 0.857233 17.0178 0.4375 16.5 0.4375H1.5ZM2.4375 3.50616V11.6875H15.5625V3.50616L9.63349 8.94108C9.27507 9.26964 8.72493 9.26964 8.36651 8.94108L2.4375 3.50616ZM14.0899 2.3125H3.91013L9 6.97822L14.0899 2.3125Z" fill="currentColor"></path>
      </svg>
    ),
    label: 'Email',
    sublabel: 'Provided by Ready'
  },

}

configs.argentWebWallet = configs.webWallet;
configs.cartridge = configs.controller;

const LoginPrompt = ({
  busy,
  expanded = true,
  onClick,
  options = ['webWallet', 'controller', 'argentX', 'braavos', 'argentMobile']
}) => {
  const optionConfigs = options.map((option) => configs[option]).filter(Boolean);

  return (
    <Panel busy={busy} expanded={expanded}>
      <Prompt busy={busy}>
        <Options>
          {optionConfigs.map((conf) => (
            <OptionButton
              disabled={busy}
              key={conf.id}
              onClick={() => onClick(conf.id)}>
              <OptionContent>
                <ButtonIcon>
                  {conf.icon}
                </ButtonIcon>
                <ButtonText>
                  <label>{conf.label}</label>
                  {conf.sublabel && <span>{conf.sublabel}</span>}
                </ButtonText>
              </OptionContent>
            </OptionButton>
          ))}
        </Options>
      </Prompt>
    </Panel>
  );
};

export default LoginPrompt;
