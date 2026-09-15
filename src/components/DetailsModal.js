import styled from 'styled-components';
import { useHistory } from 'react-router-dom';
import { Tooltip } from 'react-tooltip';

import IconButton from '~/components/IconButton';
import { CloseIcon } from '~/components/Icons';
import ClipCorner from './ClipCorner';
import theme from '~/theme';
import { useEffect, useState } from 'react';
import useCoachmarkRefSetter from '~/hooks/useCoachmarkRefSetter';
import { COACHMARK_IDS } from '~/contexts/CoachmarkContext';

const defaultMaxWidth = '1400px';
const cornerWidth = 35;

const Wrapper = styled.div`
  align-items: center;
  backdrop-filter: blur(2px);
  bottom: 0;
  display: flex;
  left: 0;
  justify-content: center;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  padding: 50px 25px 75px;
  pointer-events: all;
  position: absolute;
  right: 0;
  top: 0;
  z-index: 5;

  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    padding: 0 0 50px 0;
    z-index: 1;
  }
`;

const StyledDetails = styled.div`
  background-color: black;
  border: 1px solid ${p => p.theme.colors.borderBottom};
  ${p => p.theme.clipCorner(cornerWidth)};
  display: flex;
  flex-direction: column;
  height: 100%;
  max-width: ${p => p.maxWidth || defaultMaxWidth};
  overflow: hidden;
  pointer-events: auto;
  position: relative;
  width: auto;

  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    background-color: ${p => p.theme.colors.mobileBackground};
    backdrop-filter: none;
    clip-path: none;
  }
`;

const headerHeight = 60;
const Header = styled.h1`
  ${p => p.background ? `background: rgba(26, 71, 86, 0.3);` : ''}
  ${p => p.underline ? 'border-bottom: 1px solid #333;' : ''}
  ${p => p.v2
    ? `
      align-items: center;
      display: flex;
      span {
        border-left: 3px solid ${p.theme.colors.main};
        display: block;
        font-size: 20px;
        padding: 5px 10px;
        text-transform: uppercase;
      }
    `
    : `
      border-left: 5px solid ${p.theme.colors.main};
      line-height: ${headerHeight}px;
    `
  }
  font-size: 24px;
  font-weight: 400;
  height: ${headerHeight}px;
  padding: 0 0 0 30px;
  position: relative;
  margin: 0;
  z-index: 1;

  & b {
    color: ${p => p.theme.colors.main};
    font-weight: normal;
    margin-left: 10px;
  }

  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    padding-left: 20px;
  }
`;

const Content = styled.div`
  flex: 1 1 0;
  ${p => {
    if (p.edgeToEdge) {
      if (p.hasTitle) {
        return 'margin: -60px 0 0;';
      }
      return 'margin: 0;';
    }
    return 'margin: 25px 35px 35px;';
  }}
  overflow-y: auto;
  position: relative;
  scrollbar-width: thin;
  z-index: 0;

  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    margin: ${p => p.edgeToEdge && p.hasTitle ? '-60px 0 0' : '0'};
  }
`;

const ContentWrapper = styled.div`
  height: 100%;
  max-width: 100%;
  width: ${p => p.width === 'max' ? (p.maxWidth || defaultMaxWidth) : (p.width || 'auto')};
`;

const CloseButton = styled(IconButton)`
  position: absolute !important;
  top: 17px;
  right: 20px;
  z-index: 1;
  ${p => p.hasBackground ? 'background: rgba(0, 0, 0, 0.75);' : ''}

  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    right: 0;
  }
`;

const Details = (props) => {
  const {
    title,
    contentProps = {},
    contentInnerProps = {},
    detailsProps = {},
    edgeToEdge,
    headerProps,
    onClose,
    onCloseDestination,
    outerNode,
    width,
    wrapperProps = {},
    ...restProps
  } = props;
  const history = useHistory();
  const setCoachmarkRef = useCoachmarkRefSetter();

  // bc can go from details to details page, explicitly reset tooltip so doesn't linger after transition
  const [showTooltip, setShowTooltip] = useState();
  useEffect(() => {
    setShowTooltip(false);
    const timeoutId = setTimeout(() => { setShowTooltip(true); }, 0);
    return () => clearTimeout(timeoutId);
  }, [title]);

  return (
    <Wrapper {...restProps} {...wrapperProps}>
      <StyledDetails {...restProps} {...detailsProps}>
        {outerNode || null}
        {title && <Header {...headerProps}><span>{title}</span></Header>}
        <CloseButton
          setRef={setCoachmarkRef(COACHMARK_IDS.detailsClose)}
          onClick={onClose || (() => history.push(onCloseDestination || '/'))}
          hasBackground={edgeToEdge}>
          <CloseIcon />
        </CloseButton>
        <Content edgeToEdge={edgeToEdge} hasTitle={!!title} {...contentProps}>
          <ContentWrapper width={width} maxWidth={restProps.maxWidth} {...contentInnerProps}>
            {props.children}
          </ContentWrapper>
        </Content>
        <ClipCorner dimension={cornerWidth} color={theme.colors.borderBottom} />
      </StyledDetails>
      {showTooltip && <Tooltip id="detailsTooltip" />}
    </Wrapper>
  );
};

export default Details;
