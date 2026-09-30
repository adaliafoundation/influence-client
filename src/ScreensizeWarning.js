import styled from 'styled-components';

import { appConfig } from '~/appConfig';
import { WarningIcon } from '~/components/Icons';
import useScreenSize from '~/hooks/useScreenSize';
import { errorMessages } from './lib/errorMessages';
import theme from '~/theme';

const Warning = styled.div`
  align-items: center;
  bottom: 12px;
  color: orangered;
  display: flex;
  font-size: 13px;
  gap: 5px;
  line-height: 16px;
  max-width: calc(100vw - 70px);
  pointer-events: none;
  position: fixed;
  right: 54px;
  z-index: 9000;

  & > svg {
    flex-shrink: 0;
  }
`;

const ScreensizeWarning = () => {
  const { height, width } = useScreenSize();
  if ((height > 796 && width > theme.breakpoints.mobile) || appConfig.get('App.disableScreensizeWarning')) return null;
  return <Warning role="status"><WarningIcon aria-hidden="true" /><span>{errorMessages.deviceSize}</span></Warning>;
};

export default ScreensizeWarning;
