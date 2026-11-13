import { useCallback, useEffect, useMemo, useRef } from 'react';
import styled from 'styled-components';

import NavIcon from './NavIcon';

const ANIMATION_TIME = 750;

const Wrapper = styled.div`
  margin: 0 -12px;
  overflow: hidden;
  padding: 0 12px;
  width: calc(100% + 24px);
`;

const Bar = styled.div`
  background: ${p => p.$available === undefined ? '#444' : `linear-gradient(to right, rgba(${p.theme.colors.mainRGB}, 0.3) ${p.$available}%, #292929 ${p.$available}%)`};
  border-radius: 3px;
  height: 5px;
  width: 100%;
`;

const InnerBar = styled.div.attrs(p => ({
  style: {
    width: `${p.value * 100}%`
  }
}))`
  background: ${p => p.theme.colors.main};
  border-radius: 3px;
  height: 100%;
`;

const Handle = styled.div.attrs(p => ({
  style: {
    left: `${p.value * 100}%`
  }
}))`
  position: absolute;
  left: 0;
  margin-left: -8px;
`;

const Slider = styled.div`
  align-items: center;
  color: white;
  display: flex;
  height: 36px;
  position: relative;
  width: 100%;
  & * {
    pointer-events: none;
  }
  ${p => p.animating && `
    ${InnerBar} {
      transition: width ${ANIMATION_TIME}ms ease;
    }
    ${Handle} {
      transition: left ${ANIMATION_TIME}ms ease;
    }
  `}
`;

const SliderInput = ({ disabled, min = 0, max = 1, availableMax = max, increment = 1, value, onChange, ariaLabel = 'Slider' }) => {
  const sliderRef = useRef();
  const updating = useRef(false);
  const expectedChange = useRef();

  const handleChange = useCallback((newValue) => {
    if (disabled) return;
    newValue = Math.min(Math.max(min, newValue), availableMax);
    const incrementedNewValue = (newValue === max || newValue === min) ? newValue : Math.round((1 / increment) * newValue) * increment;
    expectedChange.current = incrementedNewValue;
    if (onChange) onChange(Math.min(availableMax, incrementedNewValue));
  }, [disabled, increment, min, max, availableMax, onChange]);

  useEffect(() => {
    const mouseHandler = (e) => {
      if (e.type === 'mousedown') {
        updating.current = true;
      }
      if (updating.current && e.offsetX !== undefined) {
        handleChange(Math.min(Math.max(min, min + (e.offsetX / sliderRef.current.offsetWidth) * (max - min)), max));
      }
      if (e.type === 'mouseup' || e.type === 'mouseleave') {
        updating.current = false;
      }
    };

    const slider = sliderRef.current;
    slider.addEventListener('mousedown', mouseHandler);
    slider.addEventListener('mouseleave', mouseHandler);
    slider.addEventListener('mousemove', mouseHandler);
    slider.addEventListener('mouseup', mouseHandler);
    return () => {
      if (slider) {
        slider.removeEventListener('mousedown', mouseHandler);
        slider.removeEventListener('mouseleave', mouseHandler);
        slider.removeEventListener('mousemove', mouseHandler);
        slider.removeEventListener('mouseup', mouseHandler);
      }
    }
  }, [min, max, handleChange]);

  const percentage = useMemo(() => Math.max(0, Math.min(100, (value - min) / (max - min))), [value, min, max]) || 0;
  return (
    <Wrapper>
      <Slider ref={sliderRef} animating={expectedChange.current !== value}
        role="slider" aria-label={ariaLabel} aria-valuemin={min} aria-valuemax={availableMax}
        aria-valuenow={value} aria-disabled={disabled} tabIndex={disabled ? -1 : 0}
        onKeyDown={(event) => {
          if (['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            handleChange(event.key === 'Home' ? min : event.key === 'End' ? availableMax
              : value + (['ArrowLeft', 'ArrowDown'].includes(event.key) ? -increment : increment));
          }
        }}>
        <Bar $available={availableMax < max ? (availableMax - min) / (max - min) * 100 : undefined}><InnerBar value={percentage} /></Bar>
        <Handle value={percentage}><NavIcon thicker selected selectedColor="white" /></Handle>
      </Slider>
    </Wrapper>
  );
}

export default SliderInput;
