import { errorMessages } from './errorMessages';
import { appConfig } from '~/appConfig';
import { UpdateIcon, WarningIcon, SettingsIcon, WalletIcon, ClipboardIcon } from '~/components/Icons';

const entries = {
  //
  // Generic
  //

  GenericAlert: (e) => ({
    icon: <WarningIcon />,
    content: <span>{e.content}</span>
  }),

  WalletConnectionRequired: (e) => ({
    icon: <WarningIcon />,
    content: <span>Please try again after connecting your {e.walletName} account: <strong>{e.address}</strong></span>
  }),

  DeployAccount: (e) => ({
    icon: <WalletIcon />,
    content: <span>{errorMessages.setupRequired}</span>
  }),

  // TODO: this may be out of use...
  GenericLoadingError: (e) => ({
    content: (
      <span>{errorMessages.genericLoading(e.label)}</span>
    ),
  }),

  WalletAlert: (e) => ({
    icon: <WalletIcon />,
    content: <span>{e.content}</span>
  }),

  ClipboardAlert: (e) => ({
    icon: <ClipboardIcon />,
    content: <span>{e.content}</span>
  }),

  //
  // App-level
  //

  App_Updated: (e) => ({
    icon: <UpdateIcon />,
    content: (
      <>
        <span>A new version of Influence is now available! </span>
        <span><b>Click here</b> to update your client.</span>
      </>
    )
  }),

  Game_GPUPrompt: (e) => ({
    icon: <SettingsIcon />,
    content: (
      <>
        <span>Please consider turning on browser hardware accleration for a better experience.</span>
        <span> Find instructions </span>
        <a href="https://www.computerhope.com/issues/ch002154.htm" rel="noreferrer" target="_blank">
          here
        </a>
      </>
    ),
  }),

  //
  // Activities
  //

  ActivityLog: (logContent) => {
    if (!logContent) return null;

    const { icon, content, txHash } = logContent;
    return {
      icon,
      content,
      txLink: txHash ? `${appConfig.get('Url.starknetExplorer')}/tx/${txHash}` : null,
    }
  },
};

const getAlertContent = ({ type, data }) => {
  try {
    return entries[type](data);
  } catch (e) {
    return null;
  }
};

export default getAlertContent;
