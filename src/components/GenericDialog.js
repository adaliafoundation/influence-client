import React from 'react';
import styled from 'styled-components';

import Button from '~/components/ButtonAlt';
import Dialog from '~/components/Dialog';
import Loader from '~/components/Loader';
import NavIcon from '~/components/NavIcon';
import { nativeBool } from '~/lib/utils';

const Title = styled.div`
  align-items: center;
  display: flex;
  flex-direction: row;
  height: 60px;
  & > h4 { flex: 1; margin: 0 }
`;

const Body = styled.div`
  flex: 1;
  font-size: 15px;
  padding: 0 0 8px;
  & > article {
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
    border-top: 1px solid rgba(255, 255, 255, 0.2);
    padding: 2em 2em;
  }

  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    padding: 15px 20px 30px;
    & > article {
      padding: 0;
    }
  }
`;

const Buttons = styled.div`
  display: flex;
  flex-direction: row;
  height: 60px;
  justify-content: space-between;
  align-items: center;
  padding: 8px 8px 16px;
  & > button {
    margin-top: 0;
    margin-left: 1em;
    &:first-child {
      margin-left: 0;
    }
  }
`;

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 300px;
  padding: 10px 30px;
  width: 650px;

  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    width: 90vw;
  }
`;

const GenericDialog = ({
  children,
  disabled,
  loading,
  onConfirm,
  confirmButtonProps = {},
  onReject,
  rejectButtonProps = {},
  isTransaction,
  title,
  ...props
}) => (
  <Dialog>
    <Wrapper {...props}>
      {title && (
        <Title>
          <NavIcon
            selected
            selectedColor="white"
            size={22}
            style={{ marginRight: 12 }} />
          <h4>{title}</h4>
        </Title>
      )}
      <Body>
        {loading && !isTransaction ? <Loader /> : children}
      </Body>
      <Buttons>
        {onReject
          ? (
            <Button
              disabled={nativeBool(loading)}
              onClick={onReject}
              {...rejectButtonProps}>
              {props.rejectText || 'Cancel'}
            </Button>
          )
          : <div />
        }
        <Button
          disabled={nativeBool(disabled || loading)}
          isTransaction={isTransaction}
          loading={loading}
          onClick={onConfirm}
          {...confirmButtonProps}>
          {props.confirmText || 'Ok'}
        </Button>
      </Buttons>
    </Wrapper>
  </Dialog>
);

export default GenericDialog;
