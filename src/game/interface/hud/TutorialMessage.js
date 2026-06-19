import { useEffect, useState } from 'react';
import styled from 'styled-components';

import Button from '~/components/ButtonAlt';
import ClipCorner from '~/components/ClipCorner';
import IconButton from '~/components/IconButton';
import { CloseIcon } from '~/components/Icons';
import useCrewmate from '~/hooks/useCrewmate';
import { reactBool } from '~/lib/utils';
import { getCrewmateCompositorImageUrl } from '~/lib/spriteUtils';
import theme from '~/theme';

const messageClipCorner = 20;
const messageOffset = 75;
const messageHeight = 240;
export const messageWidth = 725;
const crewmateOverflowMult = 0.3;
const borderColor = `rgba(${theme.colors.mainRGB}, 0.33)`;
const CrewmateWrapper = styled.div`
  margin: 1px;
  background: linear-gradient(
    to top,
    rgba(${p => p.theme.colors.mainRGB}, 0.5) 0%,
    rgba(0, 0, 0, 0.5) 70%
  );
`;

const CrewmateOverflow = styled.div`
  overflow: hidden;
  position: relative;
`;

const CrewmateImage = styled.div`
  background-image: ${p => p.imageUrl ? `url("${p.imageUrl}")` : 'none'};
  background-position: top center;
  background-repeat: no-repeat;
  background-size: cover;
  padding-top: 140%;
  width: 100%;
`;

const TutorialMessageWrapper = styled.div`
  display: flex;
  flex-direction: row;
  position: fixed;
  bottom: ${p => p.messageOffset || messageOffset}px;
  height: ${p => p.messageHeight || messageHeight}px;
  left: calc(50% - ${messageWidth/2}px);
  pointer-events: all;
  transition: transform 250ms ease;
  transform: translateY(${p => p.isIn ? 0 : ((p.messageHeight || messageHeight) * (1 + crewmateOverflowMult) + (p.messageOffset || messageOffset))}px);
  width: ${messageWidth}px;
  z-index: 1000000;
  &:before {
    content: "";
    ${p => p.theme.clipCorner(messageClipCorner)};
    background: #000a0f;
    border: 1px solid ${borderColor};
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    bottom: 0;
    z-index: -1;
  }

  ${CrewmateWrapper} {
    flex: 0 0 ${p => 0.923 * (p.messageHeight || messageHeight)}px;
  }
  ${CrewmateOverflow} {
    height: ${p => (p.messageHeight || messageHeight) * (1 + crewmateOverflowMult)}px;
    top: -${p => (p.messageHeight || messageHeight) * crewmateOverflowMult}px;
  }
`;

const TutorialContent = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  padding: 0 15px;
  & > h3 {
    align-items: center;
    display: flex;
    font-size: 18px;
    font-weight: normal;
    text-transform: uppercase;
    margin: 0;
    padding: 8px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.15);
    & > span {
      flex: 1;
    }
    & > button {
      margin-right: 0;
    }
  }
  & > div {
    display: flex;
    flex: 1;
    flex-direction: column;
    padding: 12px 0;
    & > div:first-child {
      color: ${p => p.theme.colors.secondaryText};
      flex: 1;
      font-size: 90%;
      line-height: 120%;
      & > b {
        color: white;
        font-weight: normal;
      }
    }
    & a {
      color: #CCC;
      text-decoration: none;
      transition: color 100ms ease;
      &:hover {
        color: #DDD;
        text-decoration: underline;
      }
    }
  }
`;

const Buttons = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  & > * {
    margin-left: 6px;
  }
`;

export const useCrewmateTutorialImageUrl = ({ crewmateImageOptionString, crewmateId }) => {
  const { data: crewmate } = useCrewmate(crewmateImageOptionString ? null : crewmateId);
  const [imageUrl, setImageUrl] = useState();

  useEffect(() => {
    let ignore = false;

    const loadImage = async () => {
      if (crewmateImageOptionString) {
        try {
          const options = JSON.parse(crewmateImageOptionString);
          const url = await getCrewmateCompositorImageUrl({ Crewmate: options });
          if (!ignore) setImageUrl(url);
          return;
        } catch (error) {
          console.warn('Failed to render tutorial crewmate locally', error);
        }
      }

      if (crewmate) {
        try {
          const url = await getCrewmateCompositorImageUrl(crewmate);
          if (!ignore) setImageUrl(url);
          return;
        } catch (error) {
          console.warn('Failed to render tutorial crewmate locally', error);
        }
      }

      if (!ignore) {
        setImageUrl(undefined);
      }
    };

    loadImage();
    return () => {
      ignore = true;
    };
  }, [crewmate, crewmateImageOptionString]);

  return imageUrl;
};

const TutorialMessage = ({ closeIconOverride, crewmateImageOptionString, crewmateId, isIn, leftButton, onClose, rightButton, setButtonRef, step, ...props }) => {
  const imageUrl = useCrewmateTutorialImageUrl({ crewmateImageOptionString, crewmateId });

  return (
    <TutorialMessageWrapper isIn={reactBool(isIn)} {...props}>
      {step && (
        <>
          <CrewmateWrapper>
            <CrewmateOverflow>
              {imageUrl ? <CrewmateImage imageUrl={imageUrl} /> : null}
            </CrewmateOverflow>
          </CrewmateWrapper>

          <TutorialContent>
            <h3>
              <span>{step?.title}</span>
              <IconButton onClick={onClose} scale={0.75}>{closeIconOverride || <CloseIcon />}</IconButton>
            </h3>
            <div>
              <div>{step?.content}</div>
              <Buttons>
                {leftButton && (
                  <Button flip size="small" {...leftButton} />
                )}
                {rightButton && (
                  <Button setRef={setButtonRef} size="small" {...rightButton} />
                )}
              </Buttons>
            </div>
          </TutorialContent>
        </>
      )}

      <ClipCorner dimension={messageClipCorner} color={borderColor} offset={-1} />
    </TutorialMessageWrapper>
  );
}

export default TutorialMessage;
