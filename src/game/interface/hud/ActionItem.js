import { useCallback, useMemo } from 'react';
import { useHistory } from 'react-router-dom';
import styled, { css, keyframes } from 'styled-components';
import BarLoader from 'react-spinners/BarLoader';

import { appConfig } from '~/appConfig';
import { CloseIcon as DismissIcon, EyeIcon } from '~/components/Icons';
import { FailedIcon, RandomEventIcon, ReadyIcon } from '~/components/AnimatedIcons';
import LiveTimer from '~/components/LiveTimer';
import { useLotLink } from '~/components/LotLink';
import useAsteroid from '~/hooks/useAsteroid';
import useLot from '~/hooks/useLot';
import useStore from '~/hooks/useStore';
import { formatActionItem, itemColors, backgroundColors, statuses } from '~/lib/actionItem';
import formatters from '~/lib/formatters';
import IconButton from '~/components/IconButton';

export const ICON_WIDTH = 34;
export const ITEM_WIDTH = 425;
export const TRANSITION_TIME = 400;

const opacityKeyframes = keyframes`
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
  100% {
    opacity: 1;
  }
`;
const Icon = styled.div`
  & svg {
    ${p => p.animate && css`
      animation: ${opacityKeyframes} 1000ms ease infinite;
    `}
  }
`;

const Status = styled.div``;
const Label = styled.div`
  white-space: nowrap;
`;
const Delay = styled.div`
  white-space: nowrap;
`;
const Details = styled.div``;
const Timing = styled.div`
  color: white;
  b {
    font-weight: normal;
  }
`;
const Location = styled.div`
  color: rgba(255, 255, 255, 0.6);
  b {
    color: white;
    font-weight: normal;
    &:after {
      content: '>';
      color: rgba(255, 255, 255, 0.6);
      display: inline-block;
      padding: 0 5px;
    }
  }
  b, span {
    white-space: nowrap;
  }
`;
const Dismissal = styled.div`
  align-items: center;
  color: white;
  display: flex;
  width: 80px;
  & > div {
    align-items: center;
    border: 1px solid orangered;
    color: ${p => p.theme.colors.error};
    display: flex;
    font-size: 20px;
    justify-content: center;
    margin-left: 4px;
  }
  &:hover {
    & > div {
      background: rgba(255, 255, 255, 0.15);
      color: white;
    }
  }
`;
const Progress = styled.div``;
const ActionItemRow = styled.div`
  align-items: center;
  overflow: hidden;
  pointer-events: all;
  text-shadow: 0px 0px 3px black;

  ${p => {
    if (p.transitionOut === 'right') {
      return `
        background: rgba(255, 255, 255, 0.9);
        height: 0;
        margin-bottom: 0;
        transform: translateX(${ITEM_WIDTH});
        & > * { opacity: 0; }
      `;
    } else if (p.transitionOut === 'left') {
      return `
        height: 0;
        margin-bottom: 0;
        opacity: 0;
        transform: translateX(-${ITEM_WIDTH});
      `;
    }
    return `
      background: rgba(${p.bgColor}, 0.6);
      color: rgb(${p.color});
      height: 34px;
      opacity: 1;
      transform: translateX(0);
      &:not(:last-child) {
        margin-bottom: 2px;
      }
      &:hover {
        background: rgba(${p.color}, 0.3);
        ${!p.oneRow && `
          ${Details} > * {
            transform: translateY(-34px);
          }
        `}
      }
    `;
  }}

  cursor: ${p => p.theme.cursors.active};
  display: flex;
  flex-direction: row;
  font-size: 85%;
  position: relative;
  transition:
    opacity ${TRANSITION_TIME * 0.75}ms ease,
    transform ${TRANSITION_TIME * 0.75}ms ease,
    height ${TRANSITION_TIME * 0.25}ms ease ${TRANSITION_TIME * 0.75}ms,
    margin-bottom 1ms ease ${TRANSITION_TIME * 0.75}ms;
  ${Icon} {
    align-items: center;
    background: rgba(${p => p.color}, 0.2);
    display: flex;
    font-size: ${ICON_WIDTH}px;
    height: ${ICON_WIDTH}px;
    justify-content: center;
    margin-right: 8px;
    width: ${ICON_WIDTH}px;
    & span {
      font-size: 24px;
      line-height: 0;
    }
  }
  ${Status} {
    margin-right: 5px;
    text-transform: uppercase;
  }
  ${Label} {
    color: white;
    white-space: nowrap;
  }
  ${Delay} {
    margin-left: 5px;
    margin-right: 5px;
  }
  ${Details} {
    flex: 1;
    height: 100%;
    margin-right: 8px;
    overflow: hidden;
    & > * {
      align-items: center;
      display: flex;
      flex-direction: row;
      flex-wrap: wrap;
      height: 100%;
      justify-content: flex-end;
      transition: transform 150ms ease;
      white-space: nowrap;
    }
  }
  ${Timing} > b {
    color: rgb(${p => p.color});
  }
  ${Progress} {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 4px;
    right: 0;
    & > * {
      display: block;
      width: 100%;
    }
  }
`;

const ActionItem = ({ data, getActivityConfig }) => {
  const history = useHistory();

  const createAlert = useStore(s => s.dispatchAlertLogged);
  const currentAsteroidId = useStore(s => s.asteroids.origin);
  const currentLotId = useStore(s => s.asteroids.lot);
  const zoomStatus = useStore(s => s.asteroids.zoomStatus);
  const resourceMap = useStore(s => s.asteroids.resourceMap);
  const dispatchActionDialog = useStore(s => s.dispatchActionDialog);
  const dispatchToggleHideActionItem = useStore(s => s.dispatchToggleHideActionItem);
  const dispatchLauncherPage = useStore(s => s.dispatchLauncherPage);
  const dismissFailedTx = useStore(s => s.dispatchFailedTransactionDismissed);
  const type = data?.type;

  // TODO: can probably clean up the `formatted` structure
  const item = useMemo(() => {
    return formatActionItem(
      data,
      !['randomEvent', 'plan', 'agreement', 'pending'].includes(data.type) ? getActivityConfig(data)?.actionItem : {}
    );
  }, [data, getActivityConfig]);

  const { data: asteroid } = useAsteroid(item.asteroidId);
  const { data: lot } = useLot(item.lotId);

  const goToAction = useLotLink({
    asteroidId: item.asteroidId,
    lotId: item.lotId,
    resourceId: resourceMap?.active ? item.resourceId : undefined,  // only open resourcemap if a resourcemap is open
  });

  const onClick = useCallback(() => {
    if (item.asteroidId) {
      goToAction();
    }

    if (item.onClick) {
      // delay dialog opening based on how far camera needs to fly to get there
      let dialogDelay = 0;
      if (item.asteroidId && (currentAsteroidId !== item.asteroidId || zoomStatus !== 'in')) {
        dialogDelay = 3250;
        if (item.lotId) dialogDelay += 750;
      } else if (item.lotId && currentLotId !== item.lotId) {
        dialogDelay = 400;
      // TODO: implement these?
      } else if (item.buildingId) {
      } else if (item.shipId) {
      }
      setTimeout(() => {
        item.onClick({
          openDialog: (dialog, vars) => dispatchActionDialog(dialog, { asteroidId: item.asteroidId, lotId: item.lotId, ...vars }),
          openLauncher: (launcherPage) => dispatchLauncherPage(launcherPage),
          history,
          asteroid,
          lot
        });
      }, dialogDelay)
    }

    if (type === 'failed' && item.txHash && appConfig.get('Url.starknetExplorer')) {
      try {
        navigator.clipboard.writeText(JSON.stringify(data));
        createAlert({
          type: 'ClipboardAlert',
          data: { content: 'Transaction error copied to clipboard. If you are stuck, contact the Influence team in Discord.' }
        });
      } catch (e) {}

      window.open(`${appConfig.get('Url.starknetExplorer')}/tx/${item.txHash}`, '_blank');
    }
  }, [
    goToAction,
    currentAsteroidId,
    currentLotId,
    item.asteroidId,
    item.lotId,
    item.onClick,
    zoomStatus,
  ]);

  const onDismiss = useCallback((e) => {
    e.stopPropagation();
    dismissFailedTx(item._timestamp);
    return false;
  }, [item]);

  const handleToggleHide = useCallback((key) => (e) => {
    e.stopPropagation();
    dispatchToggleHideActionItem(key);
  }, []);

  return (
    <ActionItemRow
      color={itemColors[item._expired ? '_expired' : item.type]}
      bgColor={backgroundColors[item._expired ? '_expired' : item.type]}
      onClick={onClick}
      oneRow={type !== 'failed' && !asteroid}
      transitionOut={data.transitionOut ? (type === 'failed' ? 'left' : 'right') : undefined}>
      <Icon animate={type === 'unready' || item._expired}>
        {type === 'failed' && <FailedIcon />}
        {type === 'randomEvent' && <RandomEventIcon size="0.77em" />}
        {type === 'ready' && <ReadyIcon />}
        {['pending', 'unready', 'unstarted', 'plan', 'agreement'].includes(type) && <span>{item.icon}</span>}
      </Icon>
      <Status>{statuses[item._expired ? '_expired' : item.type]}</Status>
      <Label>{item.label}</Label>
      {type === 'unstarted' && item.startTime && (
        <LiveTimer target={item.startTime} maxPrecision={1}>
          {(formattedTime, isTimer) => isTimer ? <Delay>(+{formattedTime})</Delay> : null}
        </LiveTimer>
      )}
      <Details>
        <Timing>
          {type === 'pending' && <b>Just Now</b>}
          {((type === 'ready' || type === 'failed' || type === 'randomEvent') && item.ago) && <>{item.ago} <b style={{ marginLeft: 4 }}>ago</b></>}
          {(type === 'unready' || type === 'unstarted') && item.finishTime && (
            <LiveTimer target={item.finishTime} maxPrecision={2}>
              {(formattedTime, isTimer) => isTimer ? <><b style={{ marginRight: 4 }}>Ready In</b> {formattedTime}</> : <b>{formattedTime}</b>}
            </LiveTimer>
          )}
          {/* TODO: would be nice for this to have different level warning intensity based on time-left and/or presence of inventory on the lot */}
          {type === 'plan' && (
            item.finishTime
              ? (
                <LiveTimer target={item.finishTime} maxPrecision={2}>
                  {(formattedTime, isTimer) => isTimer ? <><b style={{ marginRight: 4 }}>Expiring In</b> {formattedTime}</> : <b>{formattedTime}</b>}
                </LiveTimer>
              )
              : <b>Materials at Risk</b>
          )}
          {type === 'agreement' && (
            item.finishTime
              ? (
                <LiveTimer target={item.finishTime} maxPrecision={1}>
                  {(formattedTime, isTimer) => isTimer ? <><b style={{ marginRight: 4 }}>Remaining</b>{formattedTime}</> : <b>{formattedTime}</b>}
                </LiveTimer>
              )
              : <b>Expired</b>
          )}
        </Timing>
        {type === 'failed' && (
          <div>
            <Dismissal onClick={onDismiss}>
              Dismiss <div><DismissIcon /></div>
            </Dismissal>
          </div>
        )}
        {type !== 'failed' && asteroid && (
          <div style={{ flexWrap: 'nowrap' }}>
            <Location style={{ flex: 1, textAlign: 'right', whiteSpace: 'wrap' }}>
              {item.locationDetail && <><b>{item.locationDetail}</b></>}
              <span>{formatters.asteroidName(asteroid)}</span>
              {/* TODO: use <EntityName /> instead? */}
            </Location>
            {(type === 'plan' || type === 'agreement') && (
              <IconButton
                borderless
                dataTip={data.hidden ? 'Unhide' : 'Hide'}
                onClick={handleToggleHide(data?.uniqueKey, data.hidden)}
                themeColor="mainText"
                style={{ flex: '0 0 30px', marginLeft: 2, marginRight: 0 }}>
                <EyeIcon />
              </IconButton>
            )}
          </div>
        )}

      </Details>
      {type === 'pending' && (
        <Progress>
          <BarLoader color="currentColor" width="100%" />
        </Progress>
      )}
    </ActionItemRow>
  )
};

export default ActionItem;
