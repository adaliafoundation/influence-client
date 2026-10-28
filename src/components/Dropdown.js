import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePopper } from 'react-popper';
import styled from 'styled-components';
import Button from './ButtonAlt';
import { nativeBool } from '~/lib/utils';

const Wrapper = styled.div`
  position: relative;
`;

const Caret = styled.span`
  font-size: 80%;
`;

const IconWrapper = styled.span`
  display: inline-block;
  font-size: 120%;
  line-height: 0;
  margin-right: 4px;
`;

const Options = styled.div`
  background: #111;

  max-height: min(50vh, var(--dropdown-available-height, 50vh));
  max-width: calc(100vw - 16px);
  overscroll-behavior: contain;
  min-width: ${p => p.width ? `${p.width}px` : 'auto'};
  overflow: auto;
`;
const Option = styled.div`
  background-color: transparent;
  cursor: ${p => p.theme.cursors.active};
  padding: 8px;
  transition: background-color 200ms ease;
  width: 100%;
  box-sizing: border-box;
  &:hover {
    background-color: rgba(${p => p.theme.colors.mainRGB}, 0.3);
  }
`;

const SelectedLabel = styled.label`
  flex: 1;
  text-align: left;
`;

// options can be array of strings or array of objects
const Dropdown = ({
  disabled,
  footnote,
  hideSelected,
  initialSelection,
  iconKey = 'icon',
  labelKey = 'label',
  valueKey = 'value',
  onChange,
  triggerComponent: Trigger = Button,
  menuZIndex = 1000,
  options: rawOptions,
  ...styleProps
}) => {
  const [isObjArr, options] = useMemo(() => {
    if (typeof (rawOptions || [])[0] === 'object') {
      return [true, [...rawOptions]];
    }
    return [false, (rawOptions || []).map((o, i) => ({ [labelKey]: o, [valueKey]: i }))];
  }, [labelKey, rawOptions, valueKey]);

  const closeTimer = useRef();

  const [open, setOpen] = useState(false);
  const [popperEl, setPopperEl] = useState();
  const [referenceEl, setReferenceEl] = useState();
  const [selected, setSelected] = useState();

  const { styles, attributes } = usePopper(referenceEl, popperEl, {
    placement: styleProps.dropUp ? 'top-start' : 'bottom-start',
    modifiers: [
      {
        name: 'size',
        options: {
          padding: 8,
          apply: ({ availableHeight, elements }) => {
            elements.floating.style.setProperty('--dropdown-available-height', `${Math.max(0, availableHeight)}px`);
          }
        }
      },
      {
        name: 'flip',
        options: {
          fallbackPlacements: [styleProps.dropUp ? 'bottom-start' : 'top-start'],
        },
      },
    ],
  });

  const handleToggle = useCallback(() => {
    if (!disabled)
    setOpen((o) => !o);
  }, [disabled]);

  const handleSelection = useCallback((option) => () => {
    if (option[valueKey] !== selected[valueKey]) {
      onChange(isObjArr ? option : option[valueKey]);
    }
    setSelected(option);
    setOpen(false);
  }, [onChange, selected]);

  const handleMouseEnter = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
    }
  }, []);
  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    closeTimer.current = setTimeout(() => {
      setOpen(false);
    }, 500);
  }, []);

  // if initialSelection changes, assume that should be my new value
  // (but don't call onChange since obviously changed from elsewhere)
  useEffect(() => {
    setSelected(
      (initialSelection && options.find((o) => o[valueKey] === initialSelection)) || options[0]
    );
  }, [initialSelection, options?.length]);

  useEffect(() => {
    setOpen(false);
  }, [disabled]);

  if (!selected) return null;
  return (
    <Wrapper
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}>

      <span ref={setReferenceEl}>
        <Trigger
          disabled={nativeBool(disabled)}
          onClick={handleToggle}
          {...styleProps}>
          {selected[iconKey] && <IconWrapper>{selected[iconKey]}</IconWrapper>}
          <SelectedLabel>{selected[labelKey] || ''}</SelectedLabel>
          <Caret>▾</Caret>
        </Trigger>
      </span>

      {open && createPortal(
        <div ref={setPopperEl} style={{ ...styles.popper, zIndex: menuZIndex }} {...attributes.popper}>
          <Options {...styleProps} width={styleProps.width || referenceEl?.getBoundingClientRect().width}>
            {options.filter((o) => !hideSelected || o[valueKey] !== selected[valueKey]).map((o) => (
              <Option key={o[valueKey]} footnote={footnote && footnote(o)} onClick={handleSelection(o)}>
                {o[iconKey] && <IconWrapper>{o[iconKey]}</IconWrapper>}
                <label>{o[labelKey]}</label>
              </Option>
            ))}
          </Options>
        </div>,
        document.body
      )}
    </Wrapper>
  );
};

export default Dropdown;