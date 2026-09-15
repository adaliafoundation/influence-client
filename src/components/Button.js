import styled from 'styled-components';
import LoadingAnimation from 'react-spinners/BarLoader';

import useStore from '~/hooks/useStore';
import Badge from '~/components/Badge';
import theme from '~/theme';

const StyledButton = styled.button`
  align-items: center;
  border: 1px solid ${p => p.color || p.theme.colors.main};
  background-color: ${p => {
    const inactiveColor = p.lessTransparent ? `rgba(0,0,0,0.33)` : 'transparent';
    if (p.active && p.disabled) {
      return `rgba(${p.theme.colors.mainRGB}, 0.2)`;
    } else if (p.active) {
      return p.backgroundColor || p.theme.colors.main;
    }
    return inactiveColor;
  }};
  ${p => p.theme.clipCorner(9.5)};
  color: ${p => p.active ? 'white' : (p.color || p.theme.colors.main)};
  display: flex;
  font-family: 'Jura', sans-serif;
  font-size: 15px;
  margin-top: 15px;
  min-height: 35px;
  padding: 0 15px 0 10px;
  pointer-events: auto;
  position: relative;
  min-width: 75px;
  transition: all 300ms ease;
  width: 175px;

  & > svg {
    max-height: 24px;
    max-width: 24px;
  }

  &:disabled {
    color: ${p => p.theme.colors.disabledText};
    cursor: ${p => p.theme.cursors.default};
    border-color: ${p => p.theme.colors.disabledText};

    & > svg {
      stroke: ${p => p.theme.colors.disabledText};
    }
  }

  &:hover:not(:disabled) {
    /*background-image: linear-gradient(120deg, rgba(54, 167, 205, 0.1), rgba(54, 167, 205, 0.25));*/
    background-color: ${p => p.backgroundColor || 'rgba(54, 167, 205, 0.25)'};
    color: white;
  }

  &:active:not(:disabled) {
    background-color: ${p => p.backgroundColor || p.theme.colors.main};
    color: white;
  }

  & > * {
    margin-right: 5px;
  }
`;

const Corner = styled.svg`
  bottom: -1px;
  height: 10px;
  margin-right: 0;
  position: absolute;
  right: -1px;
  stroke: ${p => p.color || p.theme.colors.main};
  stroke-width: 1px;
  width: 10px;
`;

const StyledBadge = styled(Badge)`
  font-size: 80%;
  margin-left: 12px;
  margin-right: -6px;
`;

const loadingStyle = {
  left: 0,
  position: 'absolute',
  right: 0,
  top: 0,
  width: '100%'
};

const Button = (props) => {
  const {
    onClick,
    'data-tooltip-content': dataTip,
    'data-tooltip-place': dataPlace,
    loading,
    setRef,
    ...restProps } = props;
  const playSound = useStore(s => s.dispatchEffectStartRequested);

  const _onClick = (e) => {
    playSound('click');
    if (onClick) onClick(e);
  }

  if (setRef) restProps.ref = setRef;
  return (
    <StyledButton
      onClick={_onClick}
      data-tooltip-content={dataTip}
      data-tooltip-place={dataPlace || "right"}
      key={dataTip}
      {...restProps}>
      {loading && <LoadingAnimation height={2} color={theme.colors.main} cssOverride={loadingStyle} />}
      {props.children}
      {props.badge && (
        <StyledBadge value={props.badge} />
      )}
      <Corner viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg" color={props.color}>
        <line x1="0" y1="10" x2="10" y2="0" />
      </Corner>
    </StyledButton>
  );
};

export default Button;
