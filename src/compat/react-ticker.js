import styled, { keyframes } from 'styled-components';

const slide = keyframes`
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-50%);
  }
`;

const Viewport = styled.div`
  overflow: hidden;
  width: 100%;
`;

const Track = styled.div`
  animation: ${slide} ${p => p.$duration}s linear infinite;
  display: inline-flex;
  width: max-content;

  &:hover {
    animation-play-state: paused;
  }
`;

const Segment = styled.div`
  display: inline-flex;
  flex: 0 0 auto;
`;

const Ticker = ({ children, speed = 5 }) => {
  const content = typeof children === 'function' ? children() : children;
  if (!content) return null;

  const duration = Math.max(20, 120 / Math.max(speed, 1));

  return (
    <Viewport>
      <Track $duration={duration}>
        <Segment>{content}</Segment>
        <Segment aria-hidden>{content}</Segment>
      </Track>
    </Viewport>
  );
};

export default Ticker;
