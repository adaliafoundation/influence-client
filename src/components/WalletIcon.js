import { ArgentXIcon, BraavosIcon, UserIcon } from '~/components/Icons';
import { normalizeConnectorId, WALLET_IDS } from '~/lib/walletIds';

const WalletIcon = ({ walletId }) => {
  switch (normalizeConnectorId(walletId)) {
    case WALLET_IDS.ARGENT_X: return <ArgentXIcon />;
    case WALLET_IDS.BRAAVOS: return <BraavosIcon />;
    case WALLET_IDS.PRIVY: return <UserIcon />;
    case WALLET_IDS.CONTROLLER:
      return (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="32" height="32" rx="8" fill="#191a1a" />
          <path d="M11.6 10.2H20.4V14.8H11.6V10.2Z" fill="#FBCB4A" />
          <path d="M8 18.1H24V22.7H8V18.1Z" fill="#FBCB4A" />
        </svg>
      );
    default: return null;
  }
};

export default WalletIcon;
