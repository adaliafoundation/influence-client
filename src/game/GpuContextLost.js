import { useCallback, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import styled from 'styled-components';

import { appConfig } from '~/appConfig';
import useStore from '~/hooks/useStore';
import Button from '~/components/ButtonDumb';
import OnClickLink from '~/components/OnClickLink';

const GpuContextLostContainer = styled.div`
  align-items: center;
  display: flex;
  flex-direction: column;
  height: 100vh;
  justify-content: center;
  left: 400px;
  padding: 0 40px;
  position: absolute;
  top: 0;
  width: calc(100vw - 790px);
  @media (max-width: 1100px) {
    left: 0;
    width: 100%;
  }
`;

// TODO: should we also suggest Chrome in the list?
// TODO: ContextLoss is likely due to overwhelming the GPU memory or
//  rendering too many canvases concurrently (could CanvasTexture's be
//  responsible for that?)

export const GpuContextLostReporter = ({ setContextLost }) => {
  const { gl } = useThree();

  useEffect(() => {
    if (!gl?.domElement) return;
    const onEvent = (e) => {
      setContextLost(e.type === 'webglcontextlost');
    };
    gl.domElement.addEventListener('webglcontextlost', onEvent);
    gl.domElement.addEventListener('webglcontextrestored', onEvent);
    return () => {
      gl.domElement.removeEventListener('webglcontextlost', onEvent);
      gl.domElement.removeEventListener('webglcontextrestored', onEvent);
    };
  }, []);

  // // TODO: vvv for debugging
  // useEffect(() => {
  //   setTimeout(() => {
  //     const x = gl.getContext().getExtension('WEBGL_lose_context');
  //     console.log('losing...');
  //     x.loseContext();
  //     setTimeout(() => {
  //       console.log('restoring...');
  //       x.restoreContext();
  //     }, 10000);
  //   }, 10000);
  // }, []);
  // // ^^^

  return null;
}

export const GpuContextLostMessage = () => {
  const dispatchLauncherPage = useStore(s => s.dispatchLauncherPage);

  const openHelpChannel = useCallback(() => {
    window.open(appConfig.get('Url.help'), '_blank');
  }, []);

  return (
    <GpuContextLostContainer>
      <h3>GPU Context Lost</h3>
      <div>
        If you see this message often, here are some things to try:
        <ol>
          <li>Ensure "Hardware Acceleration" is enabled in your browser.</li>
          <li>Close other graphically intense processes (including other tabs open to the Influence client).</li>
          <li>Turn down the texture quality in your <OnClickLink onClick={() => dispatchLauncherPage('settings')}>Influence settings</OnClickLink></li>
          <li>Restart your browser and/or your computer.</li>
        </ol>
        If that does not help, please <OnClickLink onClick={openHelpChannel}>report a bug</OnClickLink> to our team in Discord. Include information on your browser,
        your OS, your hardware specs, and any steps you can follow to reliably reproduce this message.
      </div>
      <br/><br/>
      <Button onClick={() => window.location.reload()}>Refresh</Button>
    </GpuContextLostContainer>
  )
}
export const SceneLoadingErrorMessage = () => (
  <GpuContextLostContainer>
    <h3>Unable to load the scene</h3>
    <div>Scene generation stopped responding or failed. Reload to return to the belt and try again.</div>
    <br />
    <Button onClick={() => window.location.reload()}>Reload</Button>
  </GpuContextLostContainer>
);
