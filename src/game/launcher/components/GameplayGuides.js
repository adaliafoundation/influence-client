import styled from 'styled-components';
import Button from '~/components/ButtonAlt';
import useStore from '~/hooks/useStore';
import useSimulationEnabled from '~/hooks/useSimulationEnabled';
import { useMissionScope } from '~/hooks/useMissionGuidance';
import { gameplayGuides } from '~/lib/missionGuidance';

const Topics = styled.section`
  padding: 32px;
  & ul { list-style: none; padding: 0; }
  & li { border-top: 1px solid #333; padding: 12px 0; }
`;

const GameplayGuides = () => {
  const scope = useMissionScope();
  const setGuidance = useStore(s => s.dispatchMissionGuidance);
  const simulation = useSimulationEnabled();
  return <Topics aria-label="Gameplay Guides">
    <h2>Gameplay Guides</h2>
    {simulation ? <p>Finish or exit training to explore gameplay guides.</p> : <ul>
      {Object.entries(gameplayGuides).map(([topic, guide]) => <li key={topic}>
        <Button onClick={() => setGuidance({ scope, topic })}>{guide.title}</Button>
      </li>)}
    </ul>}
  </Topics>;
};

export default GameplayGuides;
