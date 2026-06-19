import { useEffect, useState } from 'react';
import styled from 'styled-components';

const StyledSlider = styled.input`
  -webkit-appearance: none;
  appearance: none;
  background-color: transparent !important;
  background-image: linear-gradient(
    to right,
    ${props => props.theme.colors.main} 0%,
    ${props => props.theme.colors.main} var(--range-progress),
    ${props => props.theme.colors.mainText} var(--range-progress),
    ${props => props.theme.colors.mainText} 100%
  );
  background-position: center;
  background-repeat: no-repeat;
  background-size: 100% 2px;
  border: 0;
  cursor: ${props => props.theme.cursors.active};
  height: 26px;
  margin: 0 20px;
  max-width: 360px;
  overflow-y: visible;
  outline: none;
  padding: 13px 0;
  width: 100%;

  &:focus,
  &:focus-visible {
    outline: none;
    box-shadow: none;
  }

  &::-moz-focus-outer {
    border: 0;
  }

  &::-webkit-slider-runnable-track {
    background: transparent;
    height: 2px;
  }

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    background: radial-gradient(circle, ${p => p.theme.colors.mainText} 0 4px, transparent 4px);
    border: 1px solid rgba(${props => props.theme.colors.mainRGB}, 0.5);
    border-radius: 0;
    box-sizing: border-box;
    height: 18px;
    margin-top: -8px;
    transform: rotate(45deg);
    width: 18px;
  }

  &::-moz-range-track {
    background-color: ${props => props.theme.colors.mainText};
    border: 0;
    border-radius: 1px;
    height: 2px;
  }

  &::-moz-range-progress {
    background-color: ${props => props.theme.colors.main};
    box-shadow: 0 0 5px ${props => props.theme.colors.main};
    height: 2px;
  }

  &::-moz-range-thumb {
    background: radial-gradient(circle, ${p => p.theme.colors.mainText} 0 4px, transparent 4px);
    border: 1px solid rgba(${props => props.theme.colors.mainRGB}, 0.5);
    border-radius: 0;
    box-sizing: border-box;
    height: 18px;
    transform: rotate(45deg);
    width: 18px;
  }
`;

const Range = (props) => {
  const { defaultValue, value, onChange, style, ...restProps } = props;
  const min = Number(restProps.min ?? 0);
  const max = Number(restProps.max ?? 100);
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) ? max : 100;

  const [internalValue, setInternalValue] = useState(defaultValue ?? safeMin);

  useEffect(() => {
    if (value === undefined && defaultValue !== undefined) {
      setInternalValue(defaultValue);
    }
  }, [defaultValue, value]);

  const sliderValue = Number(value ?? internalValue);
  const clampedValue = Number.isFinite(sliderValue)
    ? Math.min(safeMax, Math.max(safeMin, sliderValue))
    : safeMin;
  const progress = safeMax > safeMin
    ? ((clampedValue - safeMin) / (safeMax - safeMin)) * 100
    : 0;

  return (
    <StyledSlider
      {...restProps}
      type="range"
      value={clampedValue}
      style={{ '--range-progress': `${progress}%`, ...style }}
      onChange={(e) => {
        const nextValue = Number(e.target.value);
        if (value === undefined) setInternalValue(nextValue);
        onChange?.(nextValue);
      }}
    />
  );
};

export default Range;
