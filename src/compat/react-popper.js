import { useEffect, useMemo } from 'react';
import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/react';

const getFallbackPlacements = (modifiers = []) => {
  const flipModifier = modifiers.find((modifier) => modifier?.name === 'flip');
  return flipModifier?.options?.fallbackPlacements;
};

const getOffset = (modifiers = []) => {
  const offsetModifier = modifiers.find((modifier) => modifier?.name === 'offset');
  return offsetModifier?.options?.offset;
};

export const usePopper = (referenceEl, popperEl, options = {}) => {
  const middleware = useMemo(() => {
    const next = [];
    const fallbackPlacements = getFallbackPlacements(options.modifiers);
    const offsetValue = getOffset(options.modifiers);

    if (offsetValue !== undefined) {
      next.push(offset(offsetValue));
    }
    next.push(flip({ fallbackPlacements }));
    next.push(shift());

    return next;
  }, [options.modifiers]);

  const { x, y, strategy, refs, placement, update, isPositioned } = useFloating({
    middleware,
    placement: options.placement || 'bottom',
    whileElementsMounted: autoUpdate
  });

  useEffect(() => {
    refs.setReference(referenceEl || null);
  }, [referenceEl, refs]);

  useEffect(() => {
    refs.setFloating(popperEl || null);
  }, [popperEl, refs]);

  return {
    attributes: {
      popper: {
        'data-popper-placement': placement
      }
    },
    styles: {
      popper: {
        left: x ?? 0,
        position: strategy,
        top: y ?? 0,
        // Keep the element measurable without flashing at the initial (0, 0).
        visibility: referenceEl && popperEl && isPositioned ? 'visible' : 'hidden'
      }
    },
    update
  };
};
