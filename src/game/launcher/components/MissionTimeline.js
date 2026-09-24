import { useState } from 'react';
import styled from 'styled-components';
import { StarterMission } from '@influenceth/sdk';
import Button from '~/components/ButtonAlt';
import { CheckIcon, HelpIcon, SwayIcon } from '~/components/Icons';
import MissionObjectiveAssets, { RouteSelect } from './MissionObjectiveAssets';
import { Muted, Reward } from './MissionStyles';

const Track = styled.ol`
  list-style: none;
  margin: 24px 0 0;
  padding: 0;
`;
const Step = styled.li`
  position: relative;
  padding: 0 0 28px 44px;
  min-height: 54px;
  &::before {
    content: '';
    position: absolute;
    left: 13px;
    top: 28px;
    bottom: 0;
    width: 2px;
    background: ${p => p.$done ? '#7cce9f' : '#34434f'};
  }
  &:last-child { padding-bottom: 0; }
  &:last-child::before { display: none; }
  & h3 { color: ${p => p.$done ? '#7cce9f' : '#e4e9ed'}; margin: 0; font-size: 16px; line-height: 28px; }
`;
const Marker = styled.span`
  position: absolute;
  left: 0;
  top: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid ${p => p.$done ? '#7cce9f' : p.$active ? p.theme.colors.main : '#34434f'};
  background: ${p => p.$done ? '#18362a' : '#101920'};
  color: ${p => p.$done ? '#7cce9f' : p.$active ? p.theme.colors.main : '#89959e'};
  border-radius: 50%;
  font-size: 12px;
  & svg { width: 16px; height: 16px; fill: currentColor; }
`;
const ObjectiveList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 12px 0 0;
  display: grid;
  gap: 10px;
`;
const Objective = styled.li`
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) 28px;
  align-items: start;
  gap: 12px;
  padding: 16px;
  background: ${p => p.theme.colors.contentHighlight};
  border: 1px solid ${p => p.theme.colors.borderBottomAlt};
  border-radius: 4px;
  @media (max-width: 600px) { padding: 12px; gap: 8px; }
`;
const ObjectiveTitle = styled.p`
  margin: 2px 0 0;
  color: ${p => p.$done ? '#7cce9f' : '#c4ced6'};
  line-height: 1.5;
  font-size: 14px;
  overflow-wrap: anywhere;
`;
const ObjectiveMarker = styled.span`
  margin-top: 5px;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${p => p.$done ? '#7cce9f' : p.theme.colors.main};
  border: 1px solid ${p => p.$done ? '#7cce9f' : p.$active ? p.theme.colors.main : '#89959e'};
  border-radius: 50%;
  & svg { width: 12px; height: 12px; fill: currentColor; }
`;
const GuidanceLink = styled.button`
  background: none;
  border: 0;
  padding: 0;
  color: ${p => p.theme.colors.main};
  cursor: ${p => p.theme.cursors.active};
  font: inherit;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  & svg { width: 20px; height: 20px; fill: currentColor; }
  &:hover { color: white; }
  &:focus-visible { outline: 1px solid currentColor; outline-offset: 4px; }
`;
const State = styled.span`
  color: ${p => p.$done ? '#7cce9f' : '#89959e'};
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  & svg { width: 13px; height: 13px; }
`;
const Controls = styled.div`
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
`;

const MissionTimeline = ({ mission, objectives, eligible, disabled, pending, onAccept, onComplete, onGuide }) => {
  const [routeId, setRouteId] = useState(0);
  const accepted = mission.accepted || mission.completed || mission.claimed;
  const objectivesMet = mission.earned || mission.completed || mission.claimed;
  const canComplete = mission.claimable || (eligible && mission.accepted && mission.earned && !mission.completed && !mission.claimed);
  return <Track aria-label="Mission steps">
    <Step $done={accepted}>
      <Marker $done={accepted} $active={mission.canAccept} aria-hidden="true">{accepted ? <CheckIcon /> : '1'}</Marker>
      <h3>{accepted ? 'Mission accepted' : 'Accept mission'}</h3>
      {!accepted && <>
        {!mission.canAccept && <Muted>Complete the previous mission to unlock this one.</Muted>}
        <Controls><Button disabled={disabled || !mission.canAccept} isTransaction onClick={onAccept}>
          {pending ? 'Transaction pending' : 'Accept mission'}
        </Button></Controls>
      </>}
    </Step>
    <Step $done={objectivesMet}>
      <Marker $done={objectivesMet} $active={accepted && !objectivesMet && eligible} aria-hidden="true">{objectivesMet ? <CheckIcon /> : '2'}</Marker>
      <h3>Objectives</h3>
      <Muted>{mission.description}</Muted>
      {mission.id === StarterMission.IDS.CLOSE_THE_PRODUCTION_LOOP && <RouteSelect
        aria-label="Production route" value={routeId} onChange={event => setRouteId(Number(event.target.value))}>
        {Object.values(StarterMission.ROUTE_TYPES).map(route => <option key={route.id} value={route.id}>{route.title}</option>)}
      </RouteSelect>}
      <ObjectiveList>{objectives.map((objective, index) => <Objective key={objective.label} $done={objective.complete}>
        <ObjectiveMarker $done={objective.complete} $active={accepted && eligible} role="img"
          aria-label={objective.complete ? 'Objective completed' : 'Objective incomplete'}>
          {objective.complete && <CheckIcon />}
        </ObjectiveMarker>
        <div>
          <ObjectiveTitle $done={objective.complete}>{objective.label}</ObjectiveTitle>
          <MissionObjectiveAssets mission={mission} objectiveIndex={index} routeId={routeId} />
        </div>
        {onGuide && mission.accepted && !objective.complete && <GuidanceLink aria-label="Show me how"
          data-tooltip-id="detailsTooltip" data-tooltip-content="Show me how"
          data-tooltip-place="top" data-tooltip-delay-show={0}
          onClick={() => onGuide(index)}><HelpIcon /></GuidanceLink>}
      </Objective>)}</ObjectiveList>
    </Step>
    <Step $done={mission.claimed}>
      <Marker $done={mission.claimed} $active={canComplete} aria-hidden="true">{mission.claimed ? <CheckIcon /> : '3'}</Marker>
      <h3>{mission.claimed ? 'Mission complete' : 'Complete mission'}</h3>
      <Controls>
        <Reward><SwayIcon /> {mission.reward.toLocaleString()} SWAY</Reward>
        {mission.claimed ? <State $done>Reward claimed</State> : <Button disabled={disabled || !canComplete} isTransaction onClick={onComplete}>
          {pending ? 'Transaction pending' : 'Complete mission'}
        </Button>}
      </Controls>
    </Step>
  </Track>;
};

export default MissionTimeline;
