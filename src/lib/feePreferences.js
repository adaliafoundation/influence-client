import { Address } from '@influenceth/sdk';
import { TOKEN } from '~/lib/priceUtils';

export const FALLBACK_FEE_TOKENS = [TOKEN.USDC, TOKEN.SWAY];

export const getFallbackFeeTokens = (gameplay, accountAddress) => {
  if (Array.isArray(gameplay.feeTokens)) return gameplay.feeTokens;
  return accountAddress && gameplay.starterPackFeeAccounts?.[Address.toStandard(accountAddress)]
    ? FALLBACK_FEE_TOKENS : [];
};

export const migrateFeePreferences = (gameplay = {}) => ({
  ...gameplay,
  // Old saves cannot distinguish a default from an explicit choice. Preserve both.
  feeTokens: Array.isArray(gameplay.feeTokens)
    ? FALLBACK_FEE_TOKENS.filter((token) => gameplay.feeTokens.some((saved) => Address.areEqual(saved, token)))
    : null
});
