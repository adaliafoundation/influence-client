import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import styled from 'styled-components';
import { FaEllipsisH as MenuIcon } from 'react-icons/fa';
import Lottie from 'lottie-react';
import MovingStripesSquare from '~/assets/icons/animated/MovingStripesSquare.json';

import ClipCorner from '~/components/ClipCorner';
import { getProductSpriteStyle, SPRITE_ATLAS_GROUPS, useSpriteAtlases } from '~/lib/spriteUtils';
import { hexToRGB } from '~/theme';
import { reactBool } from '~/lib/utils';
import ThumbnailBottomBanner from './ThumbnailBottomBanner';
import ThumbnailIconBadge from './ThumbnailIconBadge';

const defaultSize = '92px';
const defaultBorderColor = '#333';

const MenuWrapper = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  opacity: ${p => p.open ? 1 : 0};
  transition: opacity 250ms ease;
  z-index: 3;
`;

const MenuButton = styled.div`
  align-items: center;
  background: rgba(50, 50, 50, 0.6);
  border-radius: 4px;
  color: white;
  display: flex;
  height: 25px;
  justify-content: center;
  margin: 3px;
  width: 25px;
  &:hover {
    background: rgba(${p => p.theme.colors.mainRGB}, 0.5);
  }
`;

const MenuOpenWrapper = styled.div`
  background: rgba(33, 33, 33, 0.7);
  width: 90px;
`;

const LottieOverlayTexture = ({ animation, isPaused = false, size = '100%' }) => {
  const lottieRef = useRef();
  const style = useMemo(() => ({ opacity: 0.2, width: size, height: size }), [size]);

  useEffect(() => {
    if (isPaused) lottieRef.current.pause();
    else lottieRef.current.play();
  }, [isPaused]);

  return <Lottie lottieRef={lottieRef} animationData={animation} loop={true} autoplay={true} style={style} />;
};
export const AnimatedStripes = (props) => <LottieOverlayTexture animation={MovingStripesSquare} {...props} />;

export const ResourceThumbnailWrapper = styled.div`
  border: 1px solid;
  ${p => p.theme.clipCorner(10)};
  ${p => !p.disabled && `
    ${p.onClick && `cursor: ${p.theme.cursors.active};`}
    &:hover {
      ${p.onClick && `
        background: rgba(${p.theme.colors.mainRGB}, 0.4);
      `}
      ${MenuWrapper} {
        opacity: 1;
      }
    }
  `}
  height: ${p => p.size || defaultSize};
  padding: 2px;
  position: relative;
  width: ${p => p.size || defaultSize};
  ${p => `
    background-color: ${p.backgroundColor || 'black'}};
    border-color: ${p.outlineColor || defaultBorderColor};
    color: ${p.outlineColor || defaultBorderColor};
    ${p.badgeColor && p.hasDenominator ? `${ResourceBadge} { &:before { color: ${p.badgeColor} !important; } }` : ''}
    ${p.badgeColor && !p.hasDenominator ? `${ResourceBadge} { &:before { color: ${p.badgeColor} !important; } }` : ''}
    ${p.disabled ? `
      & > * { opacity: 0.35; }
      & > svg, ${ThumbnailCorner} { opacity: 1; }
    ` : ''}
  `}
`;

export const ResourceImage = styled.div`
  background-color: transparent;
  background-image: ${p => p.src ? `url("${p.src}")` : 'none'};
  background-position: center center;
  background-size: ${p => p.contain ? 'contain' : 'cover'};
  background-repeat: no-repeat;
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 0;
`;

export const ResourceProgress = styled.div`
  background: rgba(60,60,60,0.5);
  border-radius: 2px;
  position: absolute;
  bottom: 5px;
  right: 5px;
  ${p => p.horizontal
    ? `
      height: 4px;
      width: calc(100% - 14px);
      right: 10px;
    `
    : `
      height: calc(100% - 14px);
      width: 3px;
      bottom: 10px;
    `
  }
  &:after {
    content: "";
    background: ${p => p.theme.colors.brightMain};
    border-radius: 2px;
    position: absolute;
    ${p => p.horizontal
      ? `
        left: 0;
        height: 100%;
        width: ${Math.min(1, p.progress) * 100}%;
      `
      : `
        bottom: 0;
        height: ${Math.min(1, p.progress) * 100}%;
        width: 100%;
      `
    }
  }
  ${p => p.secondaryProgress && `
    &:before {
      content: "";
      background: ${p.theme.colors.reserved};
      border-radius: 2px;
      position: absolute;
      ${p.horizontal
        ? `
          left: 0;
          height: 100%;
          width: ${Math.min(1, p.secondaryProgress) * 100}%;
        `
        : `
          bottom: 0;
          height: ${Math.min(1, p.secondaryProgress) * 100}%;
          width: 100%;
        `
      }
    }
  `}
`;

//Item count label
const ResourceBadge = styled.div`
  position: absolute;
  bottom: 5px;
  color: white;
  font-size: 80%;
  font-weight: 500;
  text-shadow: 1px 1px 0px black;
  left: 5px;
  line-height: 1em;
  &:before {
    content: "${p => p.badge !== undefined ? p.badge.toLocaleString() : ''}";
    position: relative;
    z-index: 3;
  }
  &:after {
    content: "${p => p.badgeDenominator ? `/ ${p.badgeDenominator.toLocaleString()}` : ''}";
    display: block;
  }
`;

const ThumbnailCorner = styled.div`
  background-color: ${p => `rgba(${hexToRGB(p.color)}, 1.0)`};
  clip-path: polygon(0 0, 100% 0, 0 100%);
  color: white;
  font-size: 24px;
  height: 40px;
  left: 0;
  line-height: 0;
  padding: 1px 0 0 1px;
  position: absolute;
  top: 0;
  width: 40px;
`;

const UpperRightBadge = styled.div`
  background: ${p => p.color || p.theme.colors.lightOrange};
  border-radius: 3px;
  color: black;
  filter: saturate(110%);
  font-size: 12px;
  height: 15px;
  max-width: calc(100% - 8px);
  padding: 0 4px;
  position: absolute;
  right: 4px;
  top: 4px;
  vertical-align: middle;
`;

const BottomBanner = styled(ThumbnailBottomBanner)`
  background: ${p => `rgba(${p.theme.colors.mainRGB}, 0.65)`};
`;

const Menu = ({ children }) => {
  const [open, setOpen] = useState();
  const onClick = useCallback((e) => {
    e.stopPropagation();
    setOpen(true);
  }, []);
  return (
    <MenuWrapper onClick={onClick} open={reactBool(open)}>
      {open
        ? <MenuOpenWrapper>{children(() => setOpen(false))}</MenuOpenWrapper>
        : (
          <MenuButton>
            <MenuIcon />
          </MenuButton>
        )
      }
    </MenuWrapper>
  );
};

// TODO: this component is functionally overloaded... create more components so not trying to use in so many different ways
 const ResourceThumbnail = ({
  backgroundColor,
  badge,
  badgeColor,
  badgeDenominator,
  bottomBanner,
  deficit,
  iconBadge,
  iconBadgeCorner,
  iconBadgeColor,
  menu,
  outlineColor,
  outlineStyle,
  overlayIcon,
  overlayStripes,
  progress,
  resource,
  size,
  tooltipContainer = 'globalTooltip',
  tooltipOverride,
  underlay,
  upperRightBadge,
  upperRightBadgeColor,
  ...props
}) => {
  useSpriteAtlases(SPRITE_ATLAS_GROUPS.resources);

  const tooltipProps = tooltipContainer ? {
    'data-tooltip-place': 'top',
    'data-tooltip-content': tooltipOverride || resource.name,
    'data-tooltip-id': tooltipContainer
  } : {};
  const spriteStyle = getProductSpriteStyle(resource.i);
  return (
    <ResourceThumbnailWrapper
      backgroundColor={backgroundColor}
      badgeColor={badgeColor}
      size={size}
      hasDenominator={!!badgeDenominator}
      outlineColor={outlineColor}
      outlineStyle={outlineStyle}
      {...props}
      {...tooltipProps}>
      {underlay}
      <ResourceImage contain={props.contain} style={spriteStyle || undefined} />
      <ClipCorner dimension={10} color={outlineColor || defaultBorderColor} />
      {badge !== undefined && <ResourceBadge badge={badge} badgeDenominator={badgeDenominator} />}
      {iconBadge !== undefined && <ThumbnailIconBadge iconBadgeCorner={iconBadgeCorner} iconBadgeColor={iconBadgeColor}>{iconBadge}</ThumbnailIconBadge>}
      {progress !== undefined && <ResourceProgress progress={progress} />}
      {overlayStripes !== undefined && <AnimatedStripes />}
      {overlayIcon && <ThumbnailCorner color={badgeColor}>{overlayIcon}</ThumbnailCorner>}
      {upperRightBadge && <UpperRightBadge color={upperRightBadgeColor}>{upperRightBadge}</UpperRightBadge>}
      {menu && <Menu>{menu}</Menu>}
      {bottomBanner && <BottomBanner>{bottomBanner}</BottomBanner>}
    </ResourceThumbnailWrapper>
  );
};

export default ResourceThumbnail;
