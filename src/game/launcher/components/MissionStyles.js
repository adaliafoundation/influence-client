import styled from 'styled-components';

export const Eyebrow = styled.div`
  color: ${p => p.theme.colors.main};
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
`;

export const Muted = styled.p`
  color: #a4afb8;
  font-size: 14px;
  line-height: 1.65;
  margin: 8px 0;
`;

export const Reward = styled.span`
  align-items: center;
  display: inline-flex;
  gap: 6px;
  white-space: nowrap;
  color: #e4eef3;
  font-size: 14px;
  & > svg { width: 20px; height: 20px; }
`;

export const ProgressTrack = styled.div`
  background: rgba(255, 255, 255, 0.09);
  height: 3px;
  overflow: hidden;
  & > div {
    background: ${p => p.theme.colors.main};
    height: 100%;
    width: ${p => p.$value || 0}%;
    transition: width 300ms ease;
  }
`;

export const Status = styled.span`
  align-items: center;
  display: inline-flex;
  justify-content: center;
  flex-shrink: 0;
  gap: 8px;
  color: ${p => ['claimed', 'completed'].includes(p.$status) ? p.theme.colors.success
    : p.$status === 'locked' ? '#7d8992' : p.theme.colors.main};
  font-size: 14px;
  & > svg { height: 21px; width: 21px; }
`;

export const SurfaceButton = styled.button`
  appearance: none;
  background: #10171c;
  border: 1px solid #29343d;
  color: white;
  cursor: ${p => p.theme.cursors.active};
  font: inherit;
  text-align: left;
  width: 100%;
  transition: border-color 160ms ease, background 160ms ease;
  &:hover { border-color: ${p => p.theme.colors.main}; background-color: #17232b; }
  &:focus-visible { outline: 2px solid ${p => p.theme.colors.main}; outline-offset: 3px; }
`;
