import { features } from '~/appConfig/features';
import { useMemo, useState } from 'react';
import styled from 'styled-components';

import { ArgentXIcon, BraavosIcon, ChevronRightIcon, UserIcon } from '~/components/Icons';
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

const OtherOptionsButton = styled.button`
  align-items: center;
  background: transparent;
  border: 0;
  color: ${p => p.theme.colors.main};
  cursor: ${p => p.theme.cursors[p.disabled ? 'default' : 'active']};
  display: flex;
  font-family: 'Jura', sans-serif;
  font-size: 14px;
  gap: 6px;
  justify-content: center;
  opacity: 0.8;
  padding: 2px 0 0;
  text-transform: none;
  transition: color 100ms ease, opacity 100ms ease;
  width: 100%;

  &:hover:not(:disabled) {
    color: white;
    opacity: 1;
  }

  & > svg {
    font-size: 11px;
    transform: ${p => p.$expanded ? 'rotate(90deg)' : 'none'};
    transition: transform 160ms ease;
  }
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
  privy: {
    id: 'privy',
    icon: <UserIcon />,
    label: 'Influence Account',
    sublabel: 'Continue with Google or email'
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

}

configs.cartridge = configs.controller;

const LoginPrompt = ({
  busy,
  expanded = true,
  onClick,
  options = features.privy ? ['privy', 'controller', 'argentX', 'braavos'] : ['argentX', 'controller', 'braavos']
}) => {
  const optionConfigs = options.filter((option) => features.privy || option !== 'privy').map((option) => configs[option]).filter(Boolean);
  const [primaryConfig, otherConfigs] = useMemo(
    () => [optionConfigs[0], optionConfigs.slice(1)],
    [optionConfigs]
  );
  const [showOtherOptions, setShowOtherOptions] = useState(false);
  const visibleConfigs = showOtherOptions
    ? optionConfigs
    : optionConfigs.slice(0, 1);

  return (
    <Panel busy={busy} expanded={expanded}>
      <Prompt busy={busy}>
        <Options>
          {visibleConfigs.map((conf) => (
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
          {primaryConfig && otherConfigs.length > 0 && (
            <OtherOptionsButton
              disabled={busy}
              $expanded={showOtherOptions}
              onClick={() => setShowOtherOptions((current) => !current)}>
              <ChevronRightIcon />
              <span>Other Login Options</span>
            </OtherOptionsButton>
          )}
        </Options>
      </Prompt>
    </Panel>
  );
};

export default LoginPrompt;
