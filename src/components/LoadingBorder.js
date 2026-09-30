import styled, { keyframes } from 'styled-components';

const rotationAnimation = keyframes`
  0% { transform: rotate(0); }
  100% { transform: rotate(360deg); }
`;

const LoadingBorder = styled.div`
  pointer-events: none;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  clip-path: polygon(
    0 0,
    100% 0,
    100% calc(100% - ${p => p.$cornerSize}px),
    calc(100% - ${p => p.$cornerSize}px) 100%,
    0 100%,
    0 0,
    ${p => p.$thickness}px ${p => p.$thickness}px,
    ${p => p.$thickness}px calc(100% - ${p => p.$thickness}px),
    calc(100% - ${p => p.$cornerSize + p.$thickness - 1}px) calc(100% - ${p => p.$thickness}px),
    calc(100% - ${p => p.$thickness}px) calc(100% - ${p => p.$cornerSize + p.$thickness - 1}px),
    calc(100% - ${p => p.$thickness}px) ${p => p.$thickness}px,
    ${p => p.$thickness}px ${p => p.$thickness}px
  );

  &:before {
    animation: ${rotationAnimation} 4000ms linear infinite;
    background: currentColor;
    content: '';
    /* A wide button needs a deeper rotating half-plane to cover its corners. */
    height: ${p => p.$rectangular ? 'auto' : '100%'};
    ${p => p.$rectangular && 'aspect-ratio: 2 / 1;'}
    width: 200%;
    opacity: 0.75;
    position: absolute;
    left: -50%;
    bottom: 50%;
    transform-origin: bottom center;
  }
`;

export default LoadingBorder;
