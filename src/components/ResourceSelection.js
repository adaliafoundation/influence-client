import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import styled from 'styled-components';

import theme, { hexToRGB } from '~/theme';
import ResourceThumbnail from '~/components/ResourceThumbnail';
import { formatResourceAmount } from '~/game/interface/hud/actionDialogs/components';

const Miniform = styled.div`
  color: white;
  display: flex;
  flex-direction: row;
  padding: 4px 2px 6px;
  & small {
    font-size: 12px;
    line-height: 20px;
  }
`;

const QuantaInput = styled.input`
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.5);
  color: white;
  flex: 1;
  font-family: inherit;
  margin-right: 2px;
  outline: 0;
  text-align: right;
  width: 100%;
`;

const PartialSelectMenu = ({ maxSelectable, onChange, onClose, resource, selected }) => {
  const fieldRef = useRef();

  const onBlur = useCallback(() => {
    let useValue = parseInt(fieldRef.current.value) || 0;
    if (useValue < 0) useValue = 0;
    if (useValue > maxSelectable) useValue = maxSelectable;
    onChange(useValue);
    onClose();
  }, []);

  const onKeyDown = useCallback((e) => {
    if (e.key === 'Enter' || e.key === 'Tab' || e.key === 'Escape') {
      e.preventDefault();
      onBlur();
    }
  }, []);

  useEffect(() => {
    if (fieldRef.current) {
      fieldRef.current.value = selected || 0;
      fieldRef.current.select();
    }
  }, []);

  return (
    <Miniform>
      <QuantaInput
        ref={fieldRef}
        type="number"
        max={maxSelectable}
        min={0}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        step={1} />
      <small>{resource.isAtomic ? '' : 'kg'}</small>
    </Miniform>
  );
};

const ResourceSelection = ({ item, onSelectItem }) => {
  const props = useMemo(() => {
    const config = {};
    if (item.selected > 0) {
      config.badgeColor = theme.colors.brightMain;
      config.backgroundColor = `rgba(${hexToRGB(theme.colors.darkMain)}, 0.5)`;
      config.outlineColor = theme.colors.brightMain;

      if (item.selected < item.available) {
        config.badge = formatResourceAmount(item.selected, item.resource.i);
        config.badgeDenominator = formatResourceAmount(item.available, item.resource.i);
      } else {
        config.badge = formatResourceAmount(item.selected, item.resource.i);
      }
    } else {
      config.badge = formatResourceAmount(item.available, item.resource.i);
      config.badgeColor = '#ffffff';
    }

    if (item.maxSelectable > 0) {
      config.menu = (onClose) => <PartialSelectMenu onChange={onSelectItem} onClose={onClose} {...item} />;
    } else {
      config.disabled = true;
    }

    return config;
  }, [item]);

  const onToggleAll = useCallback(() => {
    if (item.selected > 0) onSelectItem(0);
    else onSelectItem(item.maxSelectable);
  }, [item]);

  return (
    <ResourceThumbnail
      {...props}
      onClick={onToggleAll}
      resource={item.resource}
      tooltipContainer="selectionDialogTooltip" />
  );
};

export default ResourceSelection;