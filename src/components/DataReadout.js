import { useCallback } from 'react';
import styled from 'styled-components';

import useStore from '~/hooks/useStore';
import { CopyIcon } from '~/components/Icons';
import { copyTextToClipboard } from '~/lib/clipboard';

const StyledDataReadout = styled.div`
  align-items: center;
  display: flex;
  font-size: ${p => p.inheritFontSize ? 'inherit' : p.theme.fontSizes.mainText};
  padding: ${p => p.slim ? '0' : '5px 0'};
`;

const Label = styled.label`
  color: ${p => p.theme.colors.secondaryText};
  display: flex;
  flex: 0 1 auto;
  padding-right: 10px;
  white-space: nowrap;

  &:after {
    content: ':';
  }
`;

const Data = styled.span`
  color: ${p => p.theme.colors.mainText};
  display: flex;
  flex: 1 1 0;
  overflow: hidden;
  position: relative;
  text-overflow: ellipsis;
`;

const StyledClipboard = styled.button`
  background-color: transparent;
  border: 0;
  color: ${p => p.theme.colors.mainText};
  cursor: pointer;
  padding: 0;
  visibility: hidden;

  &:hover {
    color: ${p => p.theme.colors.main};
  }

  &:active {
    color: ${p => p.theme.colors.mainText};
  }

  ${Data}:hover & {
    visibility: visible;
  }
`;

const DataReadout = (props) => {
  const { copyable, ...restProps } = props;
  const playSound = useStore(s => s.dispatchEffectStartRequested);
  const handleCopyClick = useCallback(async () => {
    playSound('click');
    await copyTextToClipboard(copyable);
  }, [copyable, playSound]);

  return (
    <StyledDataReadout {...restProps}>
      {props.label && <Label>{props.label}</Label>}
      <Data>
        {props.children}
        {copyable && (
          <StyledClipboard
            onClick={handleCopyClick}
            type="button">
            <CopyIcon />
          </StyledClipboard>
        )}
      </Data>
    </StyledDataReadout>
  );
};

export default DataReadout;
