import React, { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styled, { keyframes } from 'styled-components';

const fadeIn = keyframes`
  0% { opacity: 0; }
  100% { opacity: 1; }
`;

const Backdrop = styled.div`
  animation: ${fadeIn} 200ms linear 1;
  pointer-events: auto;
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  bottom: 0;
  z-index: 10001;
  display: flex;
  align-items: center;
  justify-content: center;

  ${p => p.invisibleBackdrop ? '' : `
    backdrop-filter: blur(1.5px);
    background-color: ${p.backdrop || p.theme.colors.contentBackdrop};
  `}
`;

// Reset native dialog presentation; retain the shared backdrop and modal styles.
const BlockingBackdrop = styled(Backdrop).attrs({ as: 'dialog' })`
  border: 0;
  padding: 0;
  margin: 0;
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  &::backdrop { background: transparent; }
`;

const Modal = styled.div`
  background: ${p => p.opaque ? 'black' : 'rgba(0, 0, 0, 0.9)'};
  color: white;
  min-width: 300px;
  min-height: 200px;
  max-width: 90%;
  max-height: 90%;
  overflow: auto;
  ${p => p.css || ``};
`;

const Dialog = ({ children, blocking = false, 'aria-label': ariaLabel, dialogCss, dialogStyle = {}, ...props }) => {
  const ref = useRef();
  useLayoutEffect(() => {
    if (!blocking) return;
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, [blocking]);

  const content = (
    <Modal {...props} css={dialogCss} style={dialogStyle}>
      {children}
    </Modal>
  );
  if (blocking) return createPortal(
    <BlockingBackdrop ref={ref} aria-label={ariaLabel} onCancel={event => event.preventDefault()} {...props}>
      {content}
    </BlockingBackdrop>,
    document.body
  );
  return <Backdrop aria-label={ariaLabel} {...props}>{content}</Backdrop>;
};

export default Dialog;
