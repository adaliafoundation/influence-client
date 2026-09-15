import { features } from '~/appConfig/features';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useHistory } from 'react-router-dom';
import styled, { css, keyframes } from 'styled-components';

import CollapsibleSection from '~/components/CollapsibleSection';
import CrewmateCardFramed from '~/components/CrewmateCardFramed';
import CrewLocationCompactLabel from '~/components/CrewLocationCompactLabel';
import LiveFoodStatus from '~/components/LiveFoodStatus';
import { FastForwardIcon, PlusIcon } from '~/components/Icons';
import useSession from '~/hooks/useSession';
import useCrewContext from '~/hooks/useCrewContext';
import formatters from '~/lib/formatters';
import theme, { hexToRGB } from '~/theme';
import useStore from '~/hooks/useStore';
import LiveReadyStatus, { TimerWrapper } from '~/components/LiveReadyStatus';
import { SECTION_WIDTH } from './ActionItems';
import Button from '~/components/ButtonAlt';
import { COACHMARK_IDS } from '~/contexts/CoachmarkContext';
import SIMULATION_CONFIG from '~/simulation/simulationConfig';
import useSimulationState from '~/hooks/useSimulationState';
import useCoachmarkRefSetter from '~/hooks/useCoachmarkRefSetter';
import LiveTimer from '~/components/LiveTimer';

const menuWidth = SECTION_WIDTH;

const Wrapper = styled.div`
  pointer-events: none;
  width: ${menuWidth}px;
  padding: 6px 0;
`;

const CrewWrapper = styled.div`
  display: flex;
  flex-direction: row;
`;

export const CrewInfoContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const gradientWidth = 18;
const gradientAngle = 135;
const gradientAngleSine = Math.sin(Math.PI * gradientAngle / 180);
const widthOverSine = gradientWidth / gradientAngleSine;
const actionProgressBarAnimation = keyframes`
  0% { background-position: ${widthOverSine}px 0; }
`;
const actionProgressPadding = 4;
export const TitleBar = styled.div`
  align-items: center;
  background: ${p => `rgba(${p.rgb || '0,0,0'}, 0.7)`};
  color: white;
  display: flex;
  flex-direction: row;
  font-size: 20px;
  height: 48px;
  justify-content: space-between;
  margin-left: 0;
  padding: 0 5px 12px;
  pointer-events: auto;
  position: relative;

  clip-path: polygon(
    0 0,
    100% 0,
    100% 24px,
    calc(100% - 12px) 36px,
    10px 36px,
    0 48px
  );

  & > div svg {
    font-size: 24px;
  }
  & > div:last-child svg {
    font-size: 18px;
  }

  ${p => p.animate && css`
    &:before {
      content: "";
      animation: ${actionProgressBarAnimation} 2.5s linear infinite reverse;
      background: repeating-linear-gradient(
        ${gradientAngle}deg,
        rgba(255, 255, 255, 0.6) 0,
        rgba(255, 255, 255, 0.6) 12px,
        transparent 12px,
        transparent ${gradientWidth}px
      );
      background-size: ${widthOverSine}px 100%;
      clip-path: polygon(
        0 0,
        100% 0,
        100% calc(100% - 10px),
        calc(100% - 10px) 100%,
        0 100%
      );
      opacity: 0.09;
      position: absolute;
      top: ${actionProgressPadding}px;
      bottom: ${actionProgressPadding + 12}px;
      left: ${actionProgressPadding}px;
      right: ${actionProgressPadding}px;
    }
  `}
`;

const opacityAnimation = keyframes`
  0% { opacity: 1; }
  50% { opacity: 0.25; }
  100% { opacity: 1; }
`;
const FastForwarder = styled.div`
  align-items: center;
  color: white;
  display: flex;
  flex-direction: row;
  line-height: 0;
  & > label {
    color: white;
    font-size: 15px;
    font-weight: bold;
    padding-left: 4px;
    text-transform: uppercase;
    white-space: nowrap;
  }
  & > span {
    align-items: center;
    animation: ${opacityAnimation} 500ms linear infinite;
    display: flex;
    justify-content: center;
    font-size: 24px;
    margin-left: 4px;
    height: 24px;
    width: 24px;
  }
`;

const Crewmates = styled.div`
  display: flex;
  flex-direction: row;
  padding-left: 2px;
  margin-left: 12px;
  margin-top: -4px;
  & > * {
    margin-left: 6px;
    &:first-child {
      margin-left: 0;
    }
  }
`;

const TitleWrapper = styled.div`
  align-items: center;
  display: flex;
  filter: drop-shadow(0px 0px 2px rgba(0, 0, 0, 0.5));
  flex-direction: row;
  justify-content: space-between;
  width: ${menuWidth - 30}px;

  & > * {
    flex: 1 1 ${(menuWidth - 30)/2}px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    &:first-child {
      padding-right: 10px;
    }
  }
`;

const Instruction = styled.div`
  color: #a0a0a0;
  font-size: 14px;
  padding-left: 10px;
`;

const ButtonWrapper = styled.div`
  padding: 2px 0 0 15px;
  & > button {
    width: 225px;
  }
`;

const AvatarMenu = () => {
  const { authenticated, walletCapabilities } = useSession();
  const { captain, crew, loading: crewIsLoading } = useCrewContext();
  const history = useHistory();
  const setCoachmarkRef = useCoachmarkRefSetter();
  const simulation = useSimulationState();

  const onSetAction = useStore(s => s.dispatchActionDialog);
  const dispatchLauncherPage = useStore(s => s.dispatchLauncherPage);
  const dispatchSimulationState = useStore(s => s.dispatchSimulationState);
  const asteroidId = useStore(s => s.asteroids.origin);
  const simulationActions = useStore(s => s.simulationActions);
  const zoomStatus = useStore(s => s.asteroids.zoomStatus);
  
  const [ffTarget, setFFTarget] = useState();

  const silhouetteOverlay = useMemo(() => {
    if (!captain) {
      return {
        alwaysOn: ['icon'],
        disableHover: true,
        icon: <PlusIcon />,
        iconSize: 60,
        rgb: theme.colors.mainRGB,
      };
    }

    return null;
  }, [captain]);

  const onClick = useCallback((crewmateId) => () => {
    if (simulation) {
      if (!crewmateId || (crewmateId === SIMULATION_CONFIG.crewmateId)) {
        // TODO: should/could link back to simulation crewmate
        if (!simulation.crewmate && simulationActions.includes('RecruitCrewmate')) {
          history.push(`/recruit/0/1/0/create`); 
        }
        return;
      }
      return history.push(`/crewmate/${crewmateId}`);
    }

    if (!crewmateId && !crew?._crewmates?.length && features.stripe && walletCapabilities?.preferredForStarterPacks) {
      dispatchLauncherPage('store', 'packs', { menuCollapsed: true });
      return;
    }

    return history.push(!crewmateId && !crew?._crewmates?.length ? '/recruit/0' : '/crew');
  }, [crew?._crewmates?.length, dispatchLauncherPage, history, simulation, simulationActions, walletCapabilities?.preferredForStarterPacks]);

  useEffect(() => {
    const { canFastForward, crewReadyAt, taskReadyAt } = simulation || {};
    if (!ffTarget) {
      if (canFastForward && (crewReadyAt || taskReadyAt)) {
        // init timer
        const startTimer = Date.now();
        const totalTime = ((crewReadyAt || 0) + (taskReadyAt || 0)) - Math.floor(Date.now() / 1e3);
        setFFTarget(Math.floor(Date.now() / 1e3) + totalTime);

        // run timer
        const i = setInterval(() => {
          const remaining = totalTime * (1 - (Date.now() - startTimer) / SIMULATION_CONFIG.fastForwardAnimationDuration);
          if (remaining > 0) {
            setFFTarget(Math.floor(Date.now() / 1e3) + remaining);
          } else {
            setFFTarget();
            dispatchSimulationState('crewReadyAt', 0);
            dispatchSimulationState('taskReadyAt', 0);
            clearInterval(i);
          }
        }, 1e3 / 30); // 30 fps
        return () => clearInterval(i);
      }
    }
  }, [simulation?.canFastForward, simulation?.crewReadyAt, simulation?.taskReadyAt]);

  if (crewIsLoading) return null;
  return (
    <Wrapper>
      <CollapsibleSection
        borderless={!authenticated}
        containerHeight={140}
        collapsedHeight={46}
        title={(
          <TitleWrapper>
            {crew
              ? (
                <>
                  <div style={{ fontSize: '18px' }}>{formatters.crewName(crew)}</div>

                  <CrewLocationCompactLabel
                    crew={crew}
                    flip
                    setRef={setCoachmarkRef(COACHMARK_IDS.hudCrewLocation)}
                    zoomedToAsteroid={zoomStatus === 'in' && asteroidId} />
                </>
              )
              : `No Active Crews`
            }
          </TitleWrapper>
        )}>
        <CrewWrapper>
          <CrewmateCardFramed
            borderColor={`rgba(${theme.colors.mainRGB}, 0.4)`}
            crewmate={captain}
            isCaptain
            onClick={onClick(captain?.id)}
            noAnimation
            setRef={setCoachmarkRef(COACHMARK_IDS.hudRecruitCaptain)}
            silhouetteOverlay={silhouetteOverlay}
            CrewmateCardProps={simulation ? { useExplicitAppearance: true } : {}}
            warnIfNotOwnedBy={simulation ? undefined : crew?.Nft?.owner}
            width={98} />

          <CrewInfoContainer>
            <TitleBar
              animate={ffTarget || (crew && !crew._ready)}
              rgb={(
                ffTarget
                  ? hexToRGB(theme.colors.darkGreen)
                  : (
                    crew && !crew._ready
                      ? theme.colors.darkMainRGB
                      : undefined
                  )
              )}>
              {ffTarget
                ? (
                  <>
                    <FastForwarder><span><FastForwardIcon /></span><label>Fast Forward</label></FastForwarder>
                    <LiveTimer target={ffTarget} maxPrecision={2}>
                      {(formattedTime) => (
                        <TimerWrapper len={formattedTime.length} style={{ fontSize: 14, paddingRight: 6 }}>
                          {formattedTime}
                        </TimerWrapper>
                      )}
                    </LiveTimer>
                  </>
                )
                : (
                  crew?._crewmates?.length > 0
                    ? (
                      <>
                        <LiveReadyStatus crew={crew} flip style={{ fontSize: '15px' }} />
                        <LiveFoodStatus crew={crew} onClick={() => { onSetAction('FEED_CREW'); }} />
                      </>
                    )
                    : (
                      <Instruction>Recruit your crew to begin</Instruction>
                    )
                  )
                }
            </TitleBar>

            {crew?._crewmates?.length > 0
              ? (
                <Crewmates>
                  {(crew?._crewmates || []).map((crewmate, i) => {
                    if ((!simulation || !!simulation.crewmate) && i === 0) return null;
                    return (
                      <CrewmateCardFramed
                        key={crewmate.id}
                        borderColor={`rgba(${theme.colors.mainRGB}, 0.4)`}
                        crewmate={crewmate}
                        onClick={onClick(crewmate?.id)}
                        warnIfNotOwnedBy={simulation ? undefined : crew?.Nft?.owner}
                        width={69}
                        noArrow />
                    );
                  })}
                </Crewmates>
              )
              : (
                <ButtonWrapper>
                  <Button onClick={onClick()}>
                    Start Recruitment
                  </Button>
                </ButtonWrapper>
              )
            }
          </CrewInfoContainer>
        </CrewWrapper>
      </CollapsibleSection>
    </Wrapper>
  );
};

export default AvatarMenu;
