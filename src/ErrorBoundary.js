import { errorMessages } from './lib/errorMessages';
import { sanitizeErrorReport } from './lib/errorReporting';
import { Component } from 'react';
import styled from 'styled-components';

import errorImageSrc from '~/assets/images/hopper.png';
import Button from '~/components/ButtonDumb';
import { STORE_NAME } from '~/hooks/useStore';
import { CheckIcon, CopyIcon, RefreshIcon, WarningIcon } from '~/components/Icons';
import { reactBool } from '~/lib/utils';
import theme, { hexToRGB } from './theme';

const Wrapper = styled.div`
  align-items: center;
  display: flex;
  height: 100vh;
  justify-content: center;
  width: 100vw;
`;

const InnerWrapper = styled.div`
  align-items: center;
  display: flex;
  flex-direction: row;
`;

const ErrorImage = styled.div`
  background: url(${errorImageSrc}) no-repeat center center;
  background-size: contain;
  margin-top: 100px;
  margin-right: 50px;
  min-height: 240px;
  width: 240px;
`;

const ErrorBody = styled.div`
  width: 580px;
  h1 {
    color: #20bde5;
    font-size: 2.5em;
    font-weight: normal;
    margin-top: 0;
    margin-bottom: 50px;
    text-transform: uppercase;
  }
  h4 {
    font-size: 1.2em;
  }
  p {
    opacity: 0.6;
  }
`;

const Buttons = styled.div`
  display: flex;
  flex-direction: row;
  padding-top: 40px;
  & > * {
    margin-right: 10px;
  }
`;

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      copied: false,
      debugData: null,
    };
  }

  // Update state so the next render will show the fallback UI.
  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    const redactedStore = JSON.parse(localStorage.getItem(STORE_NAME));
    if (Object.entries(redactedStore.currentSession || {}).length > 0) {
      redactedStore.currentSession = {
        accountAddress: redactedStore.currentSession.accountAddress,
        walletId: redactedStore.currentSession.walletId,
      };
    }

    // remove token data
    delete redactedStore.state.currentSession.token;
    delete redactedStore.state.currentSession.sessionDappKey;
    delete redactedStore.state.currentSession.gameplaySession;
    Object.keys(redactedStore.state.sessions).forEach((key) => {
      delete redactedStore.state.sessions[key].token;
      delete redactedStore.state.sessions[key].sessionDappKey;
      delete redactedStore.state.sessions[key].gameplaySession;
    });

    // remove inbox private key
    delete redactedStore.dmPrivateKey;

    // TODO (maybe):
    //  - current block number and block time
    //  - activities query cache
    //  - most recent websocket messages
    //  - most recent transactions
    this.setState({
      debugData: {
        errorMessage: typeof error === 'string' ? error : error?.message,
        errorCause: error?.cause, // (will likely be empty)
        // errorStack: error?.stack, // (should be redundant to errorInfo, not sure that is true though)
        errorInfo,
        redactedStore,
        userAgent: window?.navigator?.userAgent,
        href: window.location.href,
        timestamp: Math.floor(Date.now() / 1000),
      }
    });
  }

  copyToClipboard = () => {
    try {
      navigator.clipboard.writeText(JSON.stringify(sanitizeErrorReport(this.state.debugData), null, 2));
      this.setState({ copied: true });
    } catch (e) {
      console.warn(e);
    }
    setTimeout(() => { this.setState({ copied: false }); }, 5000);
  }

  reloadPage = () => {
    window.location.reload(true);
  }

  resetState = () => {
    localStorage.removeItem(STORE_NAME);
    window.location.reload(true);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Wrapper>
          <InnerWrapper>
            <ErrorImage />
            <ErrorBody>
              <h1>{errorMessages.crash.title}</h1>
              <h4>{errorMessages.crash.message}</h4>
              <p>
                {errorMessages.crash.help}
              </p>
              <p>
                {errorMessages.crash.recovery}
              </p>
              <Buttons>
                <Button
                  disabled={reactBool(this.state.copied)}
                  onClick={this.copyToClipboard}>
                  {this.state.copied ? <CheckIcon /> : <CopyIcon />}
                  <span>{errorMessages.crash.copy}</span>
                </Button>
                <Button onClick={this.reloadPage}>
                  <RefreshIcon /> <span>{errorMessages.crash.refresh}</span>
                </Button>
                <Button
                  background={`rgba(${hexToRGB(theme.colors.error)}, 0.2)`}
                  color={theme.colors.error}
                  onClick={this.resetState}>
                  <WarningIcon /> <span>{errorMessages.crash.reset}</span>
                </Button>
              </Buttons>
            </ErrorBody>
          </InnerWrapper>
        </Wrapper>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
