import { forwardRef, useCallback, useMemo, useState } from 'react';
import ReactDOMServer from 'react-dom/server';
import styled, { css, keyframes } from 'styled-components';
import { Permission } from '@influenceth/sdk';

import ClipCorner from '~/components/ClipCorner';
import useSyncedTime from '~/hooks/useSyncedTime';
import { formatFixed, formatTimer, nativeBool, reactBool } from "~/lib/utils";
import theme, { hexToRGB } from '~/theme';
import useCrewContext from '~/hooks/useCrewContext';
import { AgreementIcon, ScheduleFullIcon, SwayIcon } from '~/components/Icons';
import { TOKEN, TOKEN_SCALE } from '~/lib/priceUtils';

const dimension = 60;
const padding = 4;
const cornerSize = 10;

const underneathAnimationTime = 150;
const underneathAnimationDelay = 100;

const borderAnimation = keyframes`
  0% { border-width: 1px; padding: ${padding}px; }
  50% { border-width: 3px; padding: ${padding - 2}px; }
  100% { border-width: 1px; padding: ${padding}px; }
`;

// (see ClipCorner for these values)
const cornerAnimation = keyframes`
  0% { stroke-width: 2px; bottom: -1px; right: -1px; }
  50% { stroke-width: 3px; bottom: -2px; right: -2px; }
  100% { stroke-width: 2px; bottom: -1px; right: -1px; }
`;

const rotationAnimation = keyframes`
  0% { transform: rotate(0); }
  100% { transform: rotate(360deg); }
`;

const HoverContent = styled.div``;
const Underneath = styled.div`
  align-items: center;
  background: transparent;
  border-radius: 10px;
  color: ${p => p.theme.colors.main};
  display: flex;
  height: 18px;
  justify-content: center;
  margin-top: 3px;
  position: absolute;
  transition-property: background, color;
  transition-duration: ${underneathAnimationTime}ms;
  transition-timing-function: ease;
  transition-delay: ${underneathAnimationDelay}ms;
  width: 100%;
  ${HoverContent} {
    font-size: 85%;
    overflow: hidden;
    max-width: 0;
    text-transform: uppercase;
    transition: max-width ${underneathAnimationTime}ms ease ${underneathAnimationDelay}ms;
    white-space: nowrap;
  }
`;

const BubbleBadge = styled.span`
  background-color: ${p => p.overrideColor || p.theme.colors.main};
  color: white;
  border-radius: 2em;
  font-size: 12px;
  font-weight: bold;
  line-height: 20px;
  position: absolute;
  text-align: center;
  top: -8px;
  right: -6px;
  height: 20px;
  ${p => p.isWide ? 'padding: 0 6px;' : 'width: 20px;'}
  z-index: 1;
`;

const ActionButtonWrapper = styled.div`
  color: ${p => p.overrideColor || p.theme.colors.main};
  cursor: ${p => p.theme.cursors.active};
  display: inline-block;
  margin-right: 8px;
  pointer-events: all;
  position: relative;
  &:last-child {
    margin-right: 0;
  }

  ${p => p.attention && !p.disabled && css`
    color: ${p.theme.colors.success};
    ${BubbleBadge} {
      background-color: ${p => p.theme.colors.success};
    }
  `}

  ${p => p.disabled && css`
    color: #aaa;
    ${BubbleBadge} {
      background-color: #777;
    }
  `}

  &:hover {
    ${Underneath} {
      background: ${theme.colors.sequence};
      color: white;
      ${HoverContent} {
        max-width: 100%;
      }
    }
  }
`;

const CornerBadge = styled.span`
  background: rgb(36, 178, 149);
  clip-path: polygon(0 0, 100% 0, 0 100%);
  color: white;
  font-size: 16px;
  height: 32px;
  left: 0;
  line-height: 12px;
  padding: 2px 0 0 2px;
  position: absolute;
  top: 0;
  width: 32px;
  z-index: 1;
`;

const CompletionTime = styled.label`
  align-items: center;
  bottom: 0;
  color: rgba(255, 255, 255, 0.85);
  display: flex;
  font-weight: bold;
  left: 0;
  position: absolute;
  justify-content: center;
  right: 0;
  filter: drop-shadow(0px 0px 2px rgba(0, 0, 0, 0.5));
  transition: color 100ms ease;
  top: 0;
`;

const ActionButton = styled.div`
  border: 1px solid ${p => p.overrideColor || p.theme.colors.main};
  ${p => p.theme.clipCorner(cornerSize)};
  height: ${dimension}px;
  width: ${dimension}px;
  padding: ${padding}px;
  position: relative;
  transition: color 100ms ease;
  & > svg {
    stroke: ${p => p.overrideColor || p.theme.colors.main} !important;
  }

  & > div {
    align-items: center;
    background-color: rgba(${p => p.overrideBgColor ? hexToRGB(p.overrideBgColor) : (p.overrideColor ? hexToRGB(p.overrideColor) : hexToRGB(p.theme.colors.darkMain))}, 0.5);
    ${p => p.theme.clipCorner(cornerSize - 4)};
    display: flex;
    font-size: 55px;
    height: 100%;
    justify-content: center;
    overflow: hidden;
    position: relative;
    transition: background-color 250ms ease;
    width: 100%;
    & > span {
      position: absolute;
      bottom: 0;
      left: 0;
      width: 100%;
    }
  }

  ${p => p.active && !p.disabled && `
    & > div {
      background-color: ${p.overrideColor || p.theme.colors.main};
      color: rgba(0, 0, 0, 0.8);
    }
  `}

  ${p => p.attention && !p.disabled ? css`
    animation: ${borderAnimation} 800ms ease-out infinite;
    border-color: ${p.theme.colors.success};
    & > div {
      background-color: rgba(${p.theme.colors.successRGB}, 0.2);
    }
    &:before {
      background-color: ${p => p.theme.colors.success};
    }
    &:hover {
      & > div {
        background-color: rgba(${p.theme.colors.successRGB}, 0.4) !important;
      }
    }
    & > svg {
      animation: ${cornerAnimation} 800ms ease-out infinite;
      stroke: ${p.theme.colors.success} !important;
    }
  ` : ''}

  ${p => p.loading && `
    & > div > svg {
      opacity: 0.25;
    }
  `}

  ${p => p.disabled
    ? `
      border-color: #444;
      cursor: ${p.theme.cursors.default};
      opacity: 0.75;
      & > div {
        background-color: rgba(0, 0, 0, 0.5);
      }
      &:before {
        background-color: #777;
      }
      & > svg {
        stroke: #444 !important;
      }
      & ${CornerBadge} {
        filter: saturate(0);
      }
    `
    : `
      &:hover {
        color: white;
        & > div {
          background-color: rgba(${p.overrideColor ? hexToRGB(p.overrideColor) : p.theme.colors.mainRGB}, 0.4);
        }
      }
    `
  }
`;

const LoadingAnimation = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  clip-path: polygon(
    0 0,
    100% 0,
    100% calc(100% - ${cornerSize}px),
    calc(100% - ${cornerSize}px) 100%,
    0 100%,
    0 0,
    ${padding}px ${padding}px,
    ${padding}px calc(100% - ${padding}px),
    calc(100% - ${cornerSize + padding - 1}px) calc(100% - ${padding}px),
    calc(100% - ${padding}px) calc(100% - ${cornerSize + padding - 1}px),
    calc(100% - ${padding}px) ${padding}px,
    ${padding}px ${padding}px
  );

  &:before {
    animation: ${rotationAnimation} 4000ms linear infinite;
    background: currentColor;
    content: '';
    height: 100%;
    width: 200%;
    opacity: 0.75;
    position: absolute;
    left: -50%;
    bottom: 50%;
    transform-origin: bottom center;
  }
`;

const TooltipContents = styled.div`
  color: white;
`;
const TooltipLabel = styled.div`
  font-weight: bold;
  text-align: center;
`;
const TooltipSublabel = styled.div`
  display: flex;
  flex-direction: row;
  color: #FFF;
  margin-top: 4px;
  &:before {
    color: ${theme.colors.red};
    content: "Disabled: ";
    flex: 1;
    margin-right: 4px;
  }
`;
const TooltipDelay = styled(TooltipSublabel)`
  &:before {
    color: ${theme.colors.sequenceLight};
    content: "Crew Delay: ";
  }
`;
const TooltipLease = styled(TooltipSublabel)`
  &:before {
    color: ${theme.colors.success};
    content: "Lease Rate: ";
  }
`;
const TooltipLeaseMin = styled(TooltipSublabel)`
  &:before {
    color: ${theme.colors.green};
    content: "Lease Min: ";
  }
`;

// TODO: consider a booleanProp wrapper so could wrap boolean props in
// {...booleanProps({ a, b, c })} where booleanProps(props) would either include
// or not rather than true/false OR would pass 1/0 instead

const SimpleTimer = ({ finishTime }) => {
  const syncedTime = useSyncedTime();
  return <>{finishTime > syncedTime ? formatTimer(finishTime - syncedTime, 1) : '...'}</>
};

const StackTally = ({ tally }) => {
  return (
    <CompletionTime>
      {tally > 1 ? `x${tally}` : ``}
    </CompletionTime>
  );
};

// (children used for mouseinfopane)
const ActionButtonComponent = forwardRef(({
  badgeProps = {},
  children,
  label,
  labelAddendum: rawLabelAddendum,
  prepaidLeaseConfig,
  flags: rawFlags,
  icon,
  enablePrelaunch,
  onClick,
  sequenceDelay,
  ...props
}, ref) => {
  const { isLaunched } = useCrewContext();

  const [isHovering, setIsHovering] = useState();

  const [flags, labelAddendum] = useMemo(() => {
    const f = rawFlags || {};
    let l = rawLabelAddendum;
    if (!enablePrelaunch && !isLaunched) {
      f.disabled = true;
      l = 'not yet launched';
    }
    return [f, l];
  }, [enablePrelaunch, isLaunched, rawFlags, rawLabelAddendum]);

  const _onClick = useCallback(() => {
    if (!flags?.disabled && onClick) onClick();
  }, [flags?.disabled, onClick]);

  const handleHover = useCallback((e) => {
    if (e.type === 'mouseenter') setIsHovering(true);
    else if (e.type === 'mouseleave') {
      setTimeout(() => {
        setIsHovering(false);
      }, underneathAnimationTime + underneathAnimationDelay);
    }
  }, []);

  const safeFlags = useMemo(() => {
    return Object.keys(flags).reduce((acc, k) => {
      if (k === 'badge') acc[k] = flags[k];
      else acc[k] = k === 'disabled' ? nativeBool(flags[k]) : reactBool(flags[k]);
      return acc;
    }, {})
  }, [flags]);

  const tooltipContent = useMemo(() => {
    try {
      return ReactDOMServer.renderToStaticMarkup(
        <TooltipContents>
          <TooltipLabel>{label}</TooltipLabel>
          {labelAddendum && <TooltipSublabel>{labelAddendum}</TooltipSublabel>}
          {!safeFlags.disabled && !safeFlags.loading && (
            <>
              {prepaidLeaseConfig && (
                <>
                  <TooltipLease>
                    <SwayIcon /> {Math.round(prepaidLeaseConfig.rate * 24 / TOKEN_SCALE[TOKEN.SWAY])} / Day
                  </TooltipLease>
                  {prepaidLeaseConfig.initialTerm > 0 && (
                    <TooltipLeaseMin>
                      {formatFixed(prepaidLeaseConfig.initialTerm / 86400, 1)} DAY
                    </TooltipLeaseMin>
                  )}
                </>
              )}
              {sequenceDelay && <TooltipDelay>{formatTimer(sequenceDelay - Math.round(Date.now()/1000), 2)}</TooltipDelay>}
            </>
          )}
        </TooltipContents>
      );
    } catch (e) {
      console.warn(e);
    }
    return null;
  }, [label, labelAddendum, prepaidLeaseConfig, isHovering, safeFlags, sequenceDelay]);

  return (
    <ActionButtonWrapper
      ref={ref}
      data-arrow-color="transparent"
      data-tooltip-id="globalTooltip"
      data-tooltip-place="top"
      data-tooltip-delay-hide={100}
      data-tooltip-content={null/*`${label}${labelAddendum ? ` (${labelAddendum})` : ''}`*/}
      data-tooltip-html={tooltipContent}
      onClick={_onClick}
      onMouseEnter={handleHover}
      onMouseLeave={handleHover}
      {...safeFlags}
      {...props}>
      {flags.loading && <LoadingAnimation />}
      {safeFlags.badge ? <BubbleBadge {...badgeProps}>{safeFlags.badge}</BubbleBadge> : null}
      <ActionButton {...safeFlags} overrideColor={props.overrideColor} overrideBgColor={props.overrideBgColor}>
        <ClipCorner dimension={cornerSize} />
        {prepaidLeaseConfig && !safeFlags.disabled && !flags.loading && <CornerBadge><AgreementIcon /></CornerBadge>}
        <div style={{ opacity: flags.tally > 1 ? 0.33 : 1 }}>{icon}</div>
        {flags.tally > 1 && <StackTally tally={flags.tally} />}
        {!(flags.tally > 1) && flags.loading && <CompletionTime><SimpleTimer finishTime={flags.finishTime} /></CompletionTime>}
      </ActionButton>
      {sequenceDelay && !safeFlags.disabled && !flags.loading && (
        <Underneath>
          <ScheduleFullIcon />
          <HoverContent>{isHovering && <>+<SimpleTimer finishTime={sequenceDelay} /></>}</HoverContent>
        </Underneath>
      )}
      {children}
    </ActionButtonWrapper>
  );
});

export const getCrewDisabledReason = ({
  asteroid,
  blockTime,
  crew,
  prepaidLeaseConfig,
  isAllowedInSimulation = false,
  // TODO: use config to get by step (can attach step to crew as well... or even allowed buttons directly on crew, etc)
isSequenceable = false,
  permission,
  permissionTarget,
  requireAsteroid = true,
  requireSurface = true,
  requireReady = true
}) => {
  if (crew?._isSimulation && !isAllowedInSimulation) return 'simulation restricted';
  if (permission && permissionTarget) {
    if (!crew) return 'access restricted';
    if (!Permission.isPermitted(crew, permission, permissionTarget, blockTime) && !prepaidLeaseConfig) return 'access restricted';
  }
  if (asteroid && requireAsteroid) {
    if (crew?._location?.asteroidId !== asteroid?.id) {
      return 'crew is away';
    } else if (requireSurface && !crew?._location?.lotId) {
      return 'crew in orbit';
    }
  }
  if (!!crew._actionTypeTriggered) return 'crew event pending';
  if (requireReady && isSequenceable && !crew?._readyToSequence) return 'crew fully scheduled';
  if (requireReady && !isSequenceable && !crew?._ready) return 'crew busy';
  return null;
};

export default ActionButtonComponent;