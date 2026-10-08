import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePopper } from 'react-popper';
import { PuffLoader } from 'react-spinners';
import styled from 'styled-components';
import useAutocomplete from '~/hooks/useAutocomplete';
import theme from '~/theme';
import TextInput from './TextInputUncontrolled';
import { reactBool } from '~/lib/utils';

const Wrapper = styled.div`
  position: relative;
  & > span {
    display: inline-block;
    height: ${p => p.inputHeight}px;
    & > input {
      height: 100%;
    }
  }
`;

const Options = styled.div`
  background: #111;
  font-size: 15px;
  max-height: 200px;
  min-width: ${p => p.width ? `${p.width}px` : 'auto'};
  overflow: auto;
  position: relative;
  ${p => p.dropUp && `
    bottom: ${p.inputHeight}px;
  `}
`;
const Option = styled.div`
  background-color: transparent;
  cursor: ${p => p.theme.cursors.active};
  padding: 8px;
  transition: background-color 200ms ease;
  width: 100%;
  &${p => p.isHighlighted ? '' : ':hover'} {
    background-color: rgba(${p => p.theme.colors.mainRGB}, 0.3);
  }
`;
const Footnote = styled.div`
  font-size: 10px;
  opacity: 0.6;
`;
const Loading = styled.div`
  display: ${p => p.isLoading ? 'block' : 'none'};
  pointer-events: none;
  position: absolute;
  right: 22px;
  top: 8px;
`;

const AutocompleteComponent = ({
  allowCustomInput,
  dropdownProps = {},
  excludeFunc,
  formatFootnote,
  formatLabel,
  onSelect,
  options: rawOptions,
  inputHeight = 32,
  isLoading,
  searchTerm,
  selected,
  setRef,
  setSearchTerm,
  valueKey,
  width,
  ...inputProps
}) => {
  const textInputEl = useRef();

  const [focused, setFocused] = useState();
  const [hovered, setHovered] = useState();
  const [highlighted, setHighlighted] = useState(0);
  const [popperEl, setPopperEl] = useState();
  const [referenceEl, setReferenceEl] = useState();

  const { userOnBlur, userOnFocus, safeInputProps } = useMemo(() => {
    const { onBlur: userOnBlur, onFocus: userOnFocus, ...safeInputProps } = inputProps;
    return { userOnBlur, userOnFocus, safeInputProps };
  }, [inputProps]);

  const { styles, attributes } = usePopper(referenceEl, popperEl, {
    placement: 'bottom-start',
    modifiers: [
      {
        name: 'flip',
        options: {
          fallbackPlacements: ['top-start', 'top-end', 'right', 'left'],
        },
      },
    ],
  });

  const options = useMemo(
    () => rawOptions.filter((o) => !excludeFunc || !excludeFunc(o)),
    [excludeFunc, rawOptions]
  );

  const handleSelection = useCallback((s) => {
    onSelect(s);
    setFocused(false);
    setHovered(false);
    textInputEl.current.blur();
  }, [onSelect]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      textInputEl.current.blur();
    } else if (e.key === 'Enter') {
      if (options[highlighted]) {
        handleSelection(options[highlighted]);
      } else if (allowCustomInput && searchTerm) {
        handleSelection(searchTerm);
      }
    } else if (e.key === 'ArrowUp') {
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'ArrowDown') {
      setHighlighted((h) => Math.min(h + 1, options.length - 1));
    }
  }, [allowCustomInput, handleSelection, highlighted, options]);

  const handleOptionHover = useCallback((e) => {
    if (e.type === 'mouseenter') {
      setHovered(true);
    } else {
      setHovered(false);
    }
  }, []);

  const handleBlur = useCallback((e) => {
    setFocused(false);
    if (userOnBlur) userOnBlur(e);
  }, [userOnBlur]);

  const handleFocus = useCallback((e) => {
    setFocused(true);
    if (userOnFocus) userOnFocus(e);
  }, [userOnFocus]);

  useEffect(() => {
    if (!focused && !hovered) {
      setHighlighted(0);
      setSearchTerm('');
    }
  }, [focused, hovered]);

  return (
    <Wrapper ref={setRef} inputHeight={inputHeight} onKeyDown={handleKeyDown}>
      <span ref={setReferenceEl}>
        <TextInput
          ref={textInputEl}
          onBlur={handleBlur}
          onInput={(e) => setSearchTerm(e.target.value)}
          onFocus={handleFocus}
          value={(selected && !focused) ? formatLabel(selected) : searchTerm}
          width={width}
          {...safeInputProps}
        />
        <Loading isLoading={reactBool(isLoading)}>
          <PuffLoader color={theme.colors.main} size="16px" />
        </Loading>
      </span>

      {(focused || hovered) && createPortal(
        <div ref={setPopperEl} style={{ ...styles.popper, zIndex: 10002 }} {...attributes.popper}>
          <Options
            inputHeight={inputHeight}
            onMouseEnter={handleOptionHover}
            onMouseLeave={handleOptionHover}
            width={width}
            {...dropdownProps}>
            {options.map((o, i) => (
              <Option
                key={o[valueKey]}
                isHighlighted={i === highlighted}
                onMouseDown={(e) => {
                  // Keep the input and dropdown anchor focused until selection completes.
                  if (e.button === 0) e.preventDefault();
                }}
                onClick={() => handleSelection(o)}>
                <label>{formatLabel(o)}</label>
                {formatFootnote && <Footnote>{formatFootnote(o)}</Footnote>}
              </Option>
            ))}
          </Options>
        </div>,
        document.body
      )}
    </Wrapper>
  );
}

export const StaticAutocomplete = ({
  dropdownProps = {},
  footnoteKey,
  labelKey,
  inputHeight,
  options = [],
  onSelect,
  selected,
  valueKey,
  width,
  ...inputProps
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  
  const formatFootnote = useCallback((o) => {
    if (typeof footnoteKey === 'string') return o[footnoteKey];
    if (typeof footnoteKey === 'function') return footnoteKey(o);
  }, [footnoteKey]);

  const formatLabel = useCallback((o) => {
    if (typeof labelKey === 'string') return o[labelKey];
    if (typeof labelKey === 'function') return labelKey(o);
  }, [labelKey]);

  const filteredOptions = useMemo(() => {
    const lcSearchTerm = searchTerm.toLowerCase();
    return options.filter(o => {
      return `${formatLabel(o)} ${formatFootnote(o)}`.toLowerCase().includes(lcSearchTerm)
    });
  }, [formatFootnote, formatLabel, searchTerm]);

  return (
    <AutocompleteComponent
      dropdownProps={dropdownProps}
      formatFootnote={formatFootnote}
      formatLabel={formatLabel}
      inputHeight={inputHeight}
      onSelect={onSelect}
      options={filteredOptions}
      selected={selected}
      searchTerm={searchTerm}
      setSearchTerm={setSearchTerm}
      valueKey={valueKey}
      width={width}
      {...inputProps}
    />
  );
};

const Autocomplete = ({
  allowCustomInput,
  assetType,
  dropdownProps = {},
  excludeFunc,
  inputHeight,
  meta,
  onSelect,
  selected,
  width,
  ...inputProps
}) => {
  const {
    formatFootnote,
    formatLabel,
    options,
    isLoading,
    searchTerm,
    setSearchTerm,
    valueKey
  } = useAutocomplete(assetType, meta);

  return (
    <AutocompleteComponent
      allowCustomInput={allowCustomInput}
      dropdownProps={dropdownProps}
      excludeFunc={excludeFunc}
      formatFootnote={formatFootnote}
      formatLabel={formatLabel}
      onSelect={onSelect}
      options={options}
      inputHeight={inputHeight}
      isLoading={isLoading}
      selected={selected}
      searchTerm={searchTerm}
      setSearchTerm={setSearchTerm}
      valueKey={valueKey}
      width={width}
      {...inputProps}
    />
  );
};

export default Autocomplete;
