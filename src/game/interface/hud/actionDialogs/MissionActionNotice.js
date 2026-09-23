import styled from 'styled-components';
import { CheckedIcon, UncheckedIcon } from '~/components/Icons';
import { useMissionAction } from '~/contexts/MissionActionContext';
import actionStage from '~/lib/actionStages';

const Notice = styled.section`
  border-top: 1px solid #283640;
  padding: 12px 25px;
  color: #a4b3bc;
  font-size: 12px;
  & p { margin: 8px 0 0; }
  & button { background: none; color: inherit; border: 0; padding: 0; text-decoration: underline; cursor: pointer; }
`;
const Participation = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
  color: ${p => p.theme.colors.main};
  cursor: pointer;
  & input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }
  & svg { width: 18px; height: 18px; flex-shrink: 0; }
  & input:focus-visible + svg { outline: 1px solid currentColor; outline-offset: 3px; }
  & input:disabled ~ * { opacity: 0.4; cursor: default; }
`;

const MissionActionNotice = ({ stage }) => {
  const mission = useMissionAction();
  if (!mission?.visible || stage === actionStage.STARTING || stage === actionStage.COMPLETING) return null;
  return <Notice>
    {mission.ready && <Participation>
      <input type="checkbox" checked={mission.selected} disabled={!mission.eligible || mission.checking}
        onChange={event => mission.setSelected(event.target.checked)} />
      {mission.selected ? <CheckedIcon aria-hidden="true" /> : <UncheckedIcon aria-hidden="true" />}
      <span>Apply toward {mission.missionTitle} mission</span>
    </Participation>}
    {mission.ready && !mission.eligible && <p>This crew is no longer eligible. Actions will not earn campaign progress.</p>}
    {mission.pending && <p>Campaign transaction pending; waiting for indexed progress.</p>}
    {mission.message && <p role="status">{mission.message} <button type="button" onClick={mission.retry}>Retry verification</button></p>}
  </Notice>;
};

export default MissionActionNotice;
