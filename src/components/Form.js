import { useState } from 'react';
import styled from 'styled-components';
import { Tooltip } from 'react-tooltip';
import LoadingAnimation from 'react-spinners/BarLoader';

import IconButton from '~/components/IconButton';
import { CloseIcon } from '~/components/Icons';
import theme from '~/theme';

const StyledForm = styled.div`
  align-items: flex-start;
  border: 1px solid ${p => p.theme.colors.main};
  background-color: ${p => p.active ? p.theme.colors.main : 'transparent'};
  ${p => p.theme.clipCorner(9.5)};
  color: ${p => p.open ? 'white' : p.theme.colors.main};
  cursor: ${p => p.open ? p.theme.cursors.default : p.theme.cursors.active};
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  font-size: 15px;
  margin-top: 15px;
  max-height: ${p => p.open ? '200px' : '35px'};
  max-width: ${p => p.open ? '100%' : '175px'};
  transition: all 300ms ease;
  padding: 0 15px 10px 10px;
  position: relative;

  &:hover {
    ${({ open }) => !open && `
      background-image: linear-gradient(120deg, rgba(54, 167, 205, 0.1), rgba(54, 167, 205, 0.25));
      color: white;
    `}
  }
`;

const Title = styled.div`
  align-items: center;
  display: flex;
  min-height: 35px;

  & svg {
    margin-right: 5px;
  }
`;

const Corner = styled.svg`
  bottom: -1px;
  height: 10px;
  margin-right: 0;
  position: absolute;
  right: -1px;
  stroke: ${p => p.theme.colors.main};
  stroke-width: 1px;
  width: 10px;
`;

const CloseButton = styled(IconButton)`
  position: absolute !important;
  top: 3px;
  right: -7px;
`;

const loadingStyle = {
  left: 0,
  position: 'absolute',
  right: 0,
  top: 0,
  width: '100%'
};

const Form = (props) => {
  const { title, children, loading, ...restProps } = props;
  const [ open, setOpen ] = useState();

  return (
    <StyledForm {...restProps}
      data-tooltip-hidden={open}
      data-tooltip-place="right"
      open={open}
      onClick={() => {
        if (!open) {
          setOpen(true);
          Tooltip.hide();
        }
      }}>
      {loading && <LoadingAnimation height={2} color={theme.colors.main} cssOverride={loadingStyle} />}
      <Title>{title}</Title>
      {children}
      {open && (
        <CloseButton
          onClick={() => setOpen(false)}
          borderless>
          <CloseIcon />
        </CloseButton>
      )}
      <Corner viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
        <line x1="0" y1="10" x2="10" y2="0" />
      </Corner>
    </StyledForm>
  );
};

export default Form;
