import { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { ReactNotifications, Store as notify } from 'react-notifications-component';
import '~/compat/react-notifications-component.css';
import 'animate.css';

import { LinkIcon } from '~/components/Icons';
import useStore from '~/hooks/useStore';
import getAlertContent from '~/lib/getAlertContent';

const defaults = {
  type: 'info',
  insert: 'top',
  container: 'top-center',
  dismiss: { duration: 0, pauseOnHover: true, onScreen: true, showIcon: true },
  width: 400,
  animationIn: ['animate__animated animate__fadeIn'],
  animationOut: ['animate__animated animate__fadeOut']
};

/**
 * Sends a notification and requires only a message (additional options can be provided)
 * @param message A string message to display in the notification
 * @param options An object specifcying default overrides or additional options
 */
const send = (message, options = {}) => {
  try {
    options.message = message;
    const mergedOptions = Object.assign({}, JSON.parse(JSON.stringify(defaults)), options);
    return notify.addNotification(mergedOptions);
  } catch (e) {
    console.error(e);
  }
};

const StyledReactNotification = styled(ReactNotifications)`
  & .rnc__notification-container--top-center {
    top: 0 !important;
  }

  & .rnc__notification-item {
    background-color: ${p => p.theme.colors.contentBackdrop};
    border-color: ${p => p.theme.colors.main};
    border-radius: 0;
    border-width: 5px;
    cursor: ${p => p.theme.cursors.active};
  }

  & .rnc__notification-item.rnc__notification-item--warning {
    border-color: ${p => p.theme.colors.error};
  }

  & .rnc__notification-item.rnc__notification-item--success {
    border-color: ${p => p.theme.colors.success};
  }

  & .rnc__notification-close-mark {
    background-color: transparent !important;
  }

  & .rnc__notification-close-mark:after {
    font-size: 20px !important;
  }

  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    & .rnc__notification-item {
      background-color: black;
    }
  }
}
`;

const Icon = styled.div`
  color: ${p => p.theme.colors.main};
  flex: 0 0 44px;
  font-size: 175%;
  padding-left: 5px;
  padding-right: 5px;
`;

const AlertWrapper = styled.div`
  align-items: center;
  color: ${p => p.theme.colors.mainText};
  display: flex;
  font-size: ${p => p.theme.fontSizes.mainText};
  margin: 12px 0;

  & > * {
    padding: 0 5px;
    &:first-child,
    &:last-child {
      padding: 0;
    }
  }

  ${p => p.level === 'warning' && `
    & ${Icon} {
      color: ${p.theme.colors.error};
    }
  `}
`;

const Description = styled.div`
  flex: 1;
  & a {
    color: ${p => p.theme.colors.mainText};
    display: inline-block;
    text-overflow: ellipsis;
    max-width: 150px;
    overflow: hidden;
    vertical-align: top;
    white-space: nowrap;
  }
`;

const StackNote = styled.div`
  font-size: 85%;
  margin-top: 6;
  opacity: 0.6;
  text-align: right;
`;

const TransactionLink = styled.a`
  flex: 0 0 28px;
  font-size: 116%;
  height: 20px;
  margin-left: auto;
  padding-left: 8px;
  text-align: center;

  & > svg {
    color: ${p => p.theme.colors.main};
  }

  &:hover {
    & > svg {
      color: white;
    }
  }
`;

const getOptions = ({ level, duration, hideCloseIcon, onRemoval, width }) => {
  const opts = {};
  if (level) opts.type = level;
  if (duration) opts.dismiss = { duration: duration };
  if (hideCloseIcon) {
    opts.dismiss = {
      ...(opts.dismiss || defaults.dismiss),
      showIcon: false
    };
  }
  if (onRemoval) opts.onRemoval = onRemoval;
  if (width) opts.width = width;
  return opts;
}

export const useControlledAlert = () => {
  const create = useCallback((alertData) => {
    return send(
      <AlertWrapper>
        <Icon>
          {alertData.icon}
        </Icon>
        <Description>
          {alertData.content}
        </Description>
      </AlertWrapper>,
      getOptions(alertData)
    );
  }, []);

  const destroy = useCallback((id) => {
    return notify.removeNotification(id);
  }, []);

  return { create, destroy };
}

const Alerts = () => {
  const alerts = useStore(s => s.logs.alerts);
  const notifyAlert = useStore(s => s.dispatchAlertNotified);
  const playSound = useStore(s => s.dispatchEffectStartRequested);

  const stacks = useRef({});

  const collapseStack = useCallback((stackId) => {
    if (!stacks.current[stackId]) stacks.current[stackId] = {};
    
    if (stacks.current[stackId].messageId && stacks.current[stackId].endTime > Date.now()) {
      const messageId = stacks.current[stackId].messageId;
      setTimeout(() => { try { console.log('removal', notify.removeNotification(messageId)); } catch (e) {/* no op */} }, 50);
      stacks.current[stackId].tally++;
    } else {
      stacks.current[stackId].tally = 0;
    }
  }, []);

  const updateStack = useCallback((stackId, newMessageId, duration) => {
    stacks.current[stackId] = {
      messageId: newMessageId,
      endTime: Date.now() + duration,
      tally: stacks.current[stackId]?.tally || 0
    };
  }, []);

  useEffect(() => {
    if (alerts?.length === 0) return;
    alerts.filter(a => !a.notified).forEach(a => {
      const { type, data, level, duration } = a;
      const alertContent = getAlertContent({ type, data });
      const stackId = data?.stackId;
      if (alertContent) {
        if (stackId && duration) collapseStack(stackId);

        const { icon, content, txLink } = alertContent;
        const messageId = send(
          <AlertWrapper level={level}>
            <Icon>
              {icon}
            </Icon>
            <Description>
              {content}
              {stacks.current?.[stackId]?.tally > 0 && (
                <StackNote>
                  + {stacks.current?.[stackId]?.tally} similar notifications...
                </StackNote>
              )}
            </Description>
            {txLink && (
              <TransactionLink href={txLink} rel="noreferrer" target="_blank">
                <LinkIcon />
              </TransactionLink>
            )}
          </AlertWrapper>,
          getOptions(a)
        );

        if (stackId && duration) updateStack(stackId, messageId, duration);

        // TODO: only play once per stack
        if (level === 'warning') {
          playSound('failure');
        } else {
          playSound('success');
        }
      }

      notifyAlert(a);
    });
  }, [ alerts, notifyAlert, playSound ]);

  return (
    <StyledReactNotification />
  );
}

export default Alerts;
