import { Address } from '@influenceth/sdk';

import { appConfig } from '~/appConfig';
import { EthIcon, SwayIcon } from '~/components/Icons';
import { safeBigInt } from './utils';
import { raw } from 'screenfull';

export const TOKEN = {
  ETH: Address.toStandard(appConfig.get('Starknet.Address.ethToken')),
  SWAY: Address.toStandard(appConfig.get('Starknet.Address.swayToken')),
  USDC: Address.toStandard(appConfig.get('Starknet.Address.usdcToken')),
  USDT: Address.toStandard(appConfig.get('Starknet.Address.usdtToken')),
}

export const TOKEN_SCALE = {
  [TOKEN.ETH]: 1e18,
  [TOKEN.SWAY]: 1e6,
  [TOKEN.USDC]: 1e6,
  [TOKEN.USDT]: 1e6
};

export const TOKEN_FORMAT = {
  SHORT: 'SHORT',
  STANDARD: 'STANDARD',
  VERBOSE: 'VERBOSE',
  FULL: 'FULL',
}

const formatUSD = (token) => (rawValue, format) => {
  const value = parseInt(rawValue);
  switch (format) {
    case TOKEN_FORMAT.SHORT:
      return value >= TOKEN_SCALE[token]
        ? <>${(value / TOKEN_SCALE[token]).toLocaleString(undefined, { maximumFractionDigits: 0 })}</>
        : <>${(value / TOKEN_SCALE[token]).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>;
    case TOKEN_FORMAT.FULL: return <>${(value / TOKEN_SCALE[token]).toLocaleString()}</>;
    case TOKEN_FORMAT.VERBOSE: return <>{(value / TOKEN_SCALE[token]).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {token}</>;
    default: return <>${(value / TOKEN_SCALE[token]).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>;
  }
}

export const TOKEN_FORMATTER = {
  [TOKEN.ETH]: (rawValue, format) => {
    const value = parseInt(rawValue);
    switch (format) {
      case TOKEN_FORMAT.FULL: return <><EthIcon className="icon" />{(value / TOKEN_SCALE[TOKEN.ETH]).toLocaleString(undefined)}</>
      case TOKEN_FORMAT.VERBOSE: return <>{(value / TOKEN_SCALE[TOKEN.ETH]).toLocaleString(undefined, { maximumFractionDigits: 4 })} ETH</>
      default: return <><EthIcon className="icon" />{(value / TOKEN_SCALE[TOKEN.ETH]).toLocaleString(undefined, { maximumFractionDigits: 4 })}</>;
    }
  },
  [TOKEN.SWAY]: (rawValue, format) => {
    const value = parseInt(rawValue);
    switch (format) {
      case TOKEN_FORMAT.FULL: return <><SwayIcon />{(value / TOKEN_SCALE[TOKEN.USDC]).toLocaleString()}</>
      case TOKEN_FORMAT.VERBOSE: return <>{(value / TOKEN_SCALE[TOKEN.SWAY]).toLocaleString(undefined, { maximumFractionDigits: 0 })} SWAY</>;
      default: return <><SwayIcon />{(value / TOKEN_SCALE[TOKEN.SWAY]).toLocaleString(undefined, { maximumFractionDigits: 0 })}</>;
    }
  },
  [TOKEN.USDC]: formatUSD(TOKEN.USDC),
  [TOKEN.USDT]: formatUSD(TOKEN.USDT)
};

export const asteroidPrice = (lots, priceConstants) => {
  if (!priceConstants?.ASTEROID_PURCHASE_BASE_PRICE || !priceConstants?.ASTEROID_PURCHASE_LOT_PRICE) return 0n;
  const roundedLots = safeBigInt(Number(lots));
  return priceConstants.ASTEROID_PURCHASE_BASE_PRICE + roundedLots * priceConstants.ASTEROID_PURCHASE_LOT_PRICE;
};

export const asteroidPriceToLots = (priceObj, priceConstants) => {
  if (!priceObj || !priceConstants?.ASTEROID_PURCHASE_BASE_PRICE || !priceConstants?.ASTEROID_PURCHASE_LOT_PRICE) return 0;
  return parseInt((safeBigInt(priceObj.to(priceConstants.ASTEROID_PURCHASE_TOKEN)) - priceConstants.ASTEROID_PURCHASE_BASE_PRICE) / priceConstants.ASTEROID_PURCHASE_LOT_PRICE);
};
