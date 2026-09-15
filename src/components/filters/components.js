import { useCallback, useEffect, useMemo } from 'react';
import styled from 'styled-components';
import { RiPaintFill as HighlightIcon } from 'react-icons/ri';

import IconButton from '~/components/IconButton';
import { CloseIcon } from '~/components/Icons';
import useStore from '~/hooks/useStore';
import { HudMenuCollapsibleSection } from '../../game/interface/hud/hudMenus/components/components';

const HighlightToggle = styled(IconButton)`
  color: ${p => p.enabled ? 'white' : '#444'};
  font-size: 14px;
  height: 1.6em;
  margin: 0;
  padding: 0;
  width: 1.6em;
`;

const Resetter = styled(IconButton)`
  background: rgba(${p => p.theme.colors.mainRGB}, 0.1);
  font-size: 14px;
  height: 1.6em;
  margin: 0 0 0 8px;
  padding: unset;
  width: 1.6em;
`;

export const InputBlock = styled.div`
  padding-bottom: 12px;
  padding-right: 2px;
  &:last-child {
    padding-bottom: 0;
  }

  label {
    font-size: 13px;
    margin-bottom: 4px;
    opacity: 0.5;
  }
  & > div {
    align-items: center;
    display: flex;
    flex-direction: row;
    font-size: 90%;
    justify-content: space-between;
    ${p => p.singleField ? '' : 'padding-top: 6px;'}
    width: 100%;

    & > span {
      flex: 1;
      opacity: 0.5;
      padding-left: 8px;
      transition: opacity 250ms ease;
    }

    ${p => p.singleField ? 'input { width: 100%; }' : ''}

    input:focus + span {
      opacity: 1;
    }
  }
`;

export const CheckboxButton = styled.button`
  background: transparent;
  border: 0;
  color: white;
  display: inline-block;
  font-family: inherit;
  font-size: 18px;
  height: 1em;
  margin-right: 6px;
  opacity: ${p => p.checked ? '1' : '0.3'};
  outline: 0;
  padding: 0;
  &:focus {
    opacity: 0.8;
  }
`;

export const CheckboxRow = styled.div`
  align-items: center;
  color: #999;
  cursor: ${p => p.disabled ? p.theme.cursors.default : p.theme.cursors.active};
  display: flex;
  padding: 4px 0;
  pointer-events: ${p => p.disabled ? 'none' : 'all'};
  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  & > svg {
    font-size: 18px;
    margin-right: 6px;
  }
  & > span {
    flex: 1;
  }
`;


const Highlighter = (props) => {
  const { active, onClick } = props;

  return (
    <HighlightToggle
      data-tooltip-content={active ? 'Disable highlighting' : 'Enable highlighting'}
      data-tooltip-id="globalTooltip"
      borderless
      enabled={active}
      onClick={onClick}>
      <HighlightIcon />
    </HighlightToggle>
  );
};

export const SearchMenu = ({
  assetType,
  children,
  fieldName,
  filters,
  highlightColorMap,
  highlightColorRange,
  highlightFieldName,
  highlightMetadata,
  title,
  ...props
}) => {
  const highlightable = useStore(s => Object.keys(s.assetSearch[assetType]).includes('highlight'));
  const highlight = useStore(s => s.assetSearch[assetType].highlight);
  const dispatchFilterReset = useStore(s => s.dispatchFilterReset);
  const updateHighlight = useStore(s => s.dispatchHighlightUpdated(assetType));
  const isAssetSearchFilterMatchingDefault = useStore(s => s.isAssetSearchFilterMatchingDefault);

  const fieldHighlight = useMemo(() => highlight && highlight.field === highlightFieldName, [highlight, highlightFieldName]);

  const filterIsOn = useMemo(() => {
    return !isAssetSearchFilterMatchingDefault(assetType, fieldName);
  }, [assetType, fieldName, filters[fieldName]]);

  const toggleHighlight = useCallback((e) => {
    e.stopPropagation();
    if (fieldHighlight) {
      updateHighlight();
    } else if (highlightColorMap) {
      updateHighlight({ field: highlightFieldName, colorMap: highlightColorMap, ...(highlightMetadata || {}) });
    } else if (highlightColorRange) {
      updateHighlight({ field: highlightFieldName, ...highlightColorRange, ...(highlightMetadata || {}) });
    }
  }, [highlightFieldName, fieldHighlight, highlightColorMap, highlightColorRange, highlightMetadata]);

  const resetFilter = useCallback((e) => {
    e.stopPropagation();
    dispatchFilterReset(assetType, fieldName);
  }, [assetType, dispatchFilterReset, fieldName]);

  useEffect(() => {
    if (fieldHighlight) {
      if (highlightColorMap) {
        updateHighlight({ field: highlightFieldName, colorMap: highlightColorMap, ...(highlightMetadata || {}) });
      } else if (highlightColorRange) {
        updateHighlight({ field: highlightFieldName, ...highlightColorRange, ...(highlightMetadata || {}) });
      }
    }
  }, [highlightColorMap, highlightColorRange, highlightMetadata]);

  return (
    <HudMenuCollapsibleSection
      titleText={title}
      titleAction={(isOpen) => (
        <div style={{ display: 'flex' }}>
          {highlightable && highlightFieldName && (isOpen || fieldHighlight) && (
            <Highlighter
              active={!!fieldHighlight}
              onClick={toggleHighlight} />
          )}
          {filterIsOn && (
            <Resetter
              data-tooltip-content="Reset Filter"
              data-tooltip-place="left"
              onClick={resetFilter}>
              <CloseIcon />
            </Resetter>
          )}
        </div>
      )}
      {...props}>
      {children}
    </HudMenuCollapsibleSection>
  );
}
