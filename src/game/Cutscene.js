import { useCallback, useEffect, useState } from 'react';
import ReactPlayer from 'react-player/lazy';
import styled from 'styled-components';
import BrightButton from '~/components/BrightButton';

import Button from '~/components/Button';
import useStore from '~/hooks/useStore';
import { reactBool } from '~/lib/utils';

export const cutsceneHideTime = 1000;

const ButtonHolder = styled.div`
  bottom: 0;
  position: absolute;
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  opacity: ${p => p.highlight ? 1 : 0.3};
  width: 100%;
  transition: opacity 500ms ease;
  & > button {
    margin: 10px 10px 10px 0;
  }
  &:hover {
    opacity: 1;
  }
`;

const Container = styled.div`
  background-color: black;
  height: 100%;
  left: 0;
  opacity: ${p => p.hiding ? 0 : 1};
  position: fixed;
  top: 0;
  transition: opacity ${cutsceneHideTime}ms ease;
  width: 100%;
  z-index: 99999;
`;

const Cutscene = () => {
  const { source, allowSkip } = useStore(s => s.cutscene || {});
  const dispatchCutscene = useStore(s => s.dispatchCutscene);

  const [hiding, setHiding] = useState(true);
  const [highlightButtons, setHighlightButtons] = useState(true);

  useEffect(() => {
    setHiding(false);
  }, []);

  const onComplete = useCallback(() => {
    setHiding(true);
    setTimeout(() => {
      dispatchCutscene();
    }, cutsceneHideTime);
  }, [dispatchCutscene]);

  const onError = useCallback((err) => {
    console.error(err);
    onComplete();
  }, [onComplete]);

  const onSkip = useCallback(() => {
    onComplete();
  }, [onComplete]);

  // onload, set buttons to show up in 8 seconds
  useEffect(() => {
    const to = setTimeout(() => {
      setHighlightButtons(false);
    }, 8000);
    return () => {
      if (to) clearTimeout(to);
    }
  }, []);

  return (
    <Container hiding={reactBool(hiding)}>
      <ReactPlayer
        url={source}
        height="100%"
        width="100%"
        playing={!hiding}
        onEnded={onComplete}
        onError={onError}
        config={{
          file: {
            forceHLS: true
          }
        }} />
      {allowSkip && (
        <ButtonHolder highlight={highlightButtons}>
          <BrightButton onClick={onSkip}>Skip Intro</BrightButton>
        </ButtonHolder>
      )}
    </Container>
  );
};

export default Cutscene;
