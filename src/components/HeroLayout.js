import React, { useCallback, useEffect, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';

import Button from '~/components/ButtonAlt';
import Loader from '~/components/Loader';

const foldOffset = 28;
const minimumCoverHeight = 138;

const opacityTransition = keyframes`
  0% { opacity: 0; }
  100% { opacity: 1; }
`;

const InvisibleImage = styled.img`
  display: none;
`;

const CoverImage = styled.div`
  height: ${p => p.autoHeight ? '100%' : `calc(50% + ${foldOffset}px)`};
  max-height: calc(100% - ${foldOffset}px - ${p => p.belowFoldMin}px);

  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    height: 33%;
    max-height: none;
  }

  ${p => p.$collapsible && `
    flex-shrink: 0;
    height: calc(max(${minimumCoverHeight}px, min(50% + ${foldOffset}px, 100% - ${p.belowFoldMin + 80}px)) - var(--hero-collapse, 0px));
    max-height: none;
  `}

  &:before {
    background-color: #111;
    background-image: url(${p => p.src});
    background-repeat: no-repeat;
    background-position: ${p => p.center || 'center center'};
    background-size: cover;
    content: '';
    display: block;
    opacity: ${p => p.ready ? 1 : 0};
    height: 100%;
    mask-image: linear-gradient(to bottom, transparent 0%, black 20%, black 40%, transparent 98%);
    transition:
      background-position 750ms ease-out,
      opacity 750ms ease-out;
  }
`;

const aboveFoldHeight = 88;
const aboveFoldMobileMargin = -30;
const AboveFold = styled.div`
  height: ${p => (p.hasSubtitle ? 50 : 0) + aboveFoldHeight}px;
  margin-top: -${p => (p.hasSubtitle ? 50 : 0) + aboveFoldHeight}px;
  opacity: 0;
  padding: 0 35px;
  position: relative;
  z-index: 1;

  opacity: ${p => p.ready ? 1 : 0};
  transition: opacity 750ms ease-out;

  ${p => !p.hasSubtitle && `
    ${Rule} {
      margin-top: 20px;
    }
  `}

  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    height: ${aboveFoldHeight * 0.72}px;
    margin-top: ${aboveFoldMobileMargin}px;
    padding: 0 25px;
  }
`;

const Rule = styled.div`
  height: 0;
  border-bottom: 1px solid #333;
`;

const BelowFold = styled.div`
  display: flex;
  flex-direction: row;
  height: ${p => p.autoHeight ? 'auto' : `calc(50% - ${foldOffset}px)`};
  padding: 20px 0 10px 20px;
  position: relative;
  @media (min-width: ${p => p.theme.breakpoints.mobile}px) {
    min-height: ${p => p.belowFoldMin}px;
  }
  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    height: ${p => p.autoHeight ? 'auto' : `calc(67% - ${aboveFoldHeight + aboveFoldMobileMargin}px)`};
    padding: 10px 0 0;
  }

  & > * {
    opacity: 0;
    &:nth-child(1) {
      animation: ${opacityTransition} 600ms normal forwards ease 200ms;
    }
    &:nth-child(2) {
      animation: ${opacityTransition} 600ms normal forwards ease 400ms;
    }
    &:nth-child(3) {
      animation: ${opacityTransition} 600ms normal forwards ease 600ms;
    }
  }
`;

const Title = styled.div`
  color: white;
  filter: drop-shadow(1px -1px 1px rgba(0, 0, 0, 1));
  font-size: 45px;
  pointer-events: none;

  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    font-size: 28px;
    text-align: left;
  }
`;

const Subtitle = styled.div`
  color: white;
  height: 40px;
  margin-top: 20px;
  margin-bottom: 6px;
`;

const Body = styled.div`
  flex: ${p => p.flourishWidth ? '1' : '0'} 1 840px;
  height: 100%;
  overflow: hidden;
  padding: 0 35px 0 25px;
  position: relative;

  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    padding-top: 5px;
  }
`;

const FlourishWrapper = styled.div`
  align-items: center;
  display: flex;
  flex: ${p => p.flourishWidth ? `0 0 ${p.flourishWidth}px` : '1 0 250px'};
  flex-direction: column;
  margin-left: 20px;
  overflow: hidden;

  @media (max-width: 1300px) {
    display: none;
  }
`;

const Footer = styled.div`
  background: black;
  flex: 0 0 80px;
  padding: 0 35px;
`;

const HeroLayout = ({
  autoHeight,
  collapseOnScroll = 0,
  children,
  belowFoldMin = 256,
  coverImage,
  coverImageCenter,
  flourish, // TODO: default?
  flourishWidth, // TODO: default?
  leftButton,
  rightButton,
  title,
  subtitle,
  styleOverrides = {}
}) => {
  const [imageLoaded, setImageLoaded] = useState();
  const layoutRef = useRef();
  const coverRef = useRef();
  const collapseRef = useRef(0);

  const handleScroll = useCallback((event) => {
    // Compensating padding keeps the scroll range stable as the body grows.
    const expandedHeight = coverRef.current.clientHeight + collapseRef.current;
    const collapse = Math.max(0, Math.min(event.currentTarget.scrollTop, collapseOnScroll, expandedHeight - minimumCoverHeight));
    collapseRef.current = collapse;
    layoutRef.current.style.setProperty('--hero-collapse', `${collapse}px`);
  }, [collapseOnScroll]);

  useEffect(() => {
    setImageLoaded();
  }, [coverImage]);

  const onImageLoaded = useCallback(() => {
    setImageLoaded(coverImage);
  }, [coverImage]);

  return (
    <div ref={layoutRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', overflow: collapseOnScroll ? 'hidden' : undefined }}>
      <InvisibleImage src={coverImage} onError={onImageLoaded} onLoad={onImageLoaded} />
      <CoverImage
        ref={coverRef}
        $collapsible={!!collapseOnScroll}
        autoHeight={autoHeight}
        src={imageLoaded}
        belowFoldMin={belowFoldMin}
        center={coverImageCenter}
        ready={coverImage === imageLoaded} />
      <AboveFold ready={!!imageLoaded} hasSubtitle={!!subtitle} style={{ ...(collapseOnScroll ? { flexShrink: 0 } : {}), ...styleOverrides?.aboveFold }}>
        {title && <Title style={styleOverrides?.title}>{title}</Title>}
        {subtitle && <Subtitle>{subtitle}</Subtitle>}
        <Rule style={styleOverrides?.rule} />
      </AboveFold>
      <BelowFold autoHeight={autoHeight} belowFoldMin={belowFoldMin} style={{ ...(collapseOnScroll ? { flex: '1 1 0', minHeight: 0 } : {}), ...styleOverrides?.belowFold }}>
        {!imageLoaded && <Loader />}
        {imageLoaded && (
          <>
            {flourish && <FlourishWrapper flourishWidth={flourishWidth}>{flourish}</FlourishWrapper>}
            <Body flourishWidth={flourishWidth}
              onScroll={collapseOnScroll ? handleScroll : undefined}
              style={{ ...(collapseOnScroll ? { overflowY: 'auto', scrollbarWidth: 'thin', overflowAnchor: 'none' } : {}), ...styleOverrides?.body }}>
              {collapseOnScroll ? <div style={{ display: 'flow-root', paddingTop: 'var(--hero-collapse, 0px)' }}>{children}</div> : children}
            </Body>
          </>
        )}
      </BelowFold>
      <Footer>
        <Rule />
        <div style={{ alignItems: 'center', display: 'flex', height: 'calc(100% - 1px)', justifyContent: 'space-between' }}>
          <div>
            {leftButton && (
              <Button flip onClick={leftButton.onClick} {...(leftButton.props || {})}>
                {leftButton.label}
              </Button>
            )}
          </div>
          
          {rightButton && (
            <div style={{ alignItems: 'center', display: 'flex' }}>
              {rightButton.preLabel || ''}
              {rightButton.onClick && rightButton.label && (
                <Button onClick={rightButton.onClick} {...(rightButton.props || {})}>
                  {rightButton.label}
                </Button>
              )}
            </div>
          )}
        </div>
      </Footer>
    </div>
  );
};

export default HeroLayout;
