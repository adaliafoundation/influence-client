import styled from 'styled-components';
import Loader from 'react-spinners/PuffLoader';
import theme from '~/theme';
import { useCrewmateTutorialImageUrl } from './TutorialMessage';

const BUBBLE_WIDTH = 60;

const Bubble = styled.button`
  border: 0;
  font: inherit;
  background: rgba(${p => p.theme.colors.darkMainRGB}, 0.7);
  bottom: 10px;
  border-radius: 50px;
  cursor: ${p => p.theme.cursors.active};
  height: ${BUBBLE_WIDTH}px;
  left: 50%;
  opacity: ${p => p.$isIn ? 1 : 0};
  outline: 1px solid ${p => p.theme.colors.main};
  padding: 2px;
  pointer-events: ${p => p.$isIn ? 'all' : 'none'};
  position: fixed;
  transition: background 100ms ease, opacity 250ms ease ${p => p.$isIn ? '200ms' : '0'}, outline 100ms ease;
  width: ${BUBBLE_WIDTH}px;
  z-index: 1000000;

  &:after {
    color: ${p => p.theme.colors.brightMain};
    content: "▾";
    position: absolute;
    bottom: -4px;
    right: -8px;
    transition: color 100ms ease;
  }

  &:hover {
    background: rgba(${p => p.theme.colors.mainRGB}, 0.6);
    outline: 3px solid white;
    &:after {
      color: white;
    }
  }
`;

const CrewmateImage = styled.div`
  background-image: ${p => p.imageUrl ? `url("${p.imageUrl}")` : 'none'};
  background-position: top center;
  background-repeat: no-repeat;
  background-size: cover;
  border-radius: 0 0 ${BUBBLE_WIDTH}px ${BUBBLE_WIDTH}px;
  bottom: 40%;
  padding-top: 140%;
  position: relative;
  width: 100%;
  z-index: 2;
`;

const TutorialBubble = ({ crewmateId, crewmateImageOptionString, isIn, onClick, setRef }) => {
  const imageUrl = useCrewmateTutorialImageUrl({ crewmateId, crewmateImageOptionString });
  return <Bubble type="button" aria-label="Resume guidance" aria-hidden={!isIn} tabIndex={isIn ? 0 : -1}
    $isIn={isIn} onClick={onClick} ref={setRef}>
    <CrewmateImage imageUrl={imageUrl} />
    <div aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, zIndex: 1 }}>
      <Loader size={BUBBLE_WIDTH} color={theme.colors.brightMain} speedMultiplier={0.5} />
    </div>
  </Bubble>;
};

export default TutorialBubble;
