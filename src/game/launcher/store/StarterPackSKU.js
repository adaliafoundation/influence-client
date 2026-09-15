import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styled, { keyframes } from 'styled-components';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building, Crewmate, Entity, Product } from '@influenceth/sdk';

import OwnedCrewImage from '~/assets/images/modal_headers/OwnedCrew.png';
import Button from '~/components/ButtonAlt';
import CrewmateCardFramed from '~/components/CrewmateCardFramed';
import Details from '~/components/DetailsModal';
import {
  CheckIcon,
  CheckedIcon,
  CrewmateCreditIcon,
  LotControlIcon,
  MyAssetIcon,
  UncheckedIcon,
  WarningIcon
} from '~/components/Icons';
import { CheckboxButton } from '~/components/filters/components';
import PageLoader from '~/components/PageLoader';
import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import {
  AboveFold,
  CoverImage,
  CrewInfoContainer,
  Crewmates,
  CrewWrapper,
  MainContainer,
  ManagementContainer,
  MyCrewStatement,
  Stat,
  TitleBar
} from '~/game/interface/details/CrewDetails';
import { CrewmateDesigner } from '~/game/interface/details/crewAssignments/Create';
import useSession from '~/hooks/useSession';
import useCrewContext from '~/hooks/useCrewContext';
import useNameAvailability from '~/hooks/useNameAvailability';
import useStarterPacks from '~/hooks/useStarterPacks';
import useStore from '~/hooks/useStore';
import { appConfig } from '~/appConfig';
import api from '~/lib/api';
import { getBuildingIcon, getProductIcon } from '~/lib/assetUtils';
import { entitiesCacheKey } from '~/lib/cacheKey';
import {
  STARTER_PACK_CREWMATE_TRAIT_TALLY,
  STARTER_PACK_CHECKOUT_PARAM,
  STARTER_PACK_STATUSES,
  buildStarterPackCrewmate,
  buildStarterPackGrantRequest,
  buildStarterPackReturnUrl,
  createDevStarterPackPurchase,
  createSeededStarterPackCrewmates,
  getRandomStarterPackTraits,
  isDevStarterPackPurchase,
  isStarterPackCheckoutActive,
  isStarterPackCustomizationDraftComplete,
  isStarterPackGrantPending,
  shouldUsePendingStarterPackPurchase
} from '~/lib/starterPacks';
import { getRandomAdalianAppearance } from '~/lib/crewmateDesign';
import { nativeBool } from '~/lib/utils';
import { getPrimaryNewPlayerLoginOptions } from '~/lib/wallets';
import { PurchaseForm } from './components/PurchaseForm';
import SKUHighlight from './components/SKUHighlight';
import StripeEmbeddedCheckout, { stripePromise } from './components/StripeEmbeddedCheckout';

const checkoutPollMs = 5000;
const grantedCrewPollMs = 2000;
const expandedPackPortraitWidth = 112.5;

const StarterPackContent = styled.div`
  padding-bottom: 20px;
  position: relative;
  width: 100%;
`;

const StarterPacksOuter = styled.div`
  align-items: flex-end;
  display: flex;
  flex-direction: row;
  gap: 24px;
  justify-content: center;
  min-height: 500px;
  padding: 30px 0 20px;
  width: 100%;

  & > div {
    flex: 1 1 0;
    min-width: 0;
    transition: transform 150ms ease, filter 150ms ease;

    &:hover {
      filter: brightness(1.08);
      transform: scale(1.025);
      z-index: 1;
    }

    &:nth-child(2) {
      transform: scale(1.045);
      z-index: 1;

      &:hover {
        transform: scale(1.075);
      }
    }
  }

  ${p => p.$single && `
    & > div {
      flex: 0 1 1400px;
      max-width: 96%;
      min-width: 800px;
    }

    & > div:hover {
      filter: none;
      transform: none;
    }
  `}
`;

const StarterPackPurchaseForm = styled(PurchaseForm)`
  flex: 1 1 0;
  min-width: 0;
  outline: 1px solid #333;
  text-align: left;

  &:hover {
    outline-width: 2px;
  }

  &[aria-disabled='true'] {
    cursor: not-allowed;
    opacity: 0.65;
  }

  &[data-locked='true'] {
    opacity: 1;

    &:hover {
      outline-color: #333;
      outline-width: 1px;
    }
  }

  &[data-expanded='true'] {
    cursor: default;
    outline-color: ${p => p.$highlightColor};
    outline-width: 4px;
  }

  &[data-expanded='true']:hover {
    outline-color: ${p => p.$highlightColor};
    outline-width: 4px;
  }

  & > h2 {
    text-align: left;
    padding-left: 100px;
  }
`;

const RecommendedBadge = styled.div`
  background: ${p => p.theme.colors.main};
  border-radius: 0 0 6px 6px;
  color: black;
  font-size: 12px;
  bottom: 0;
  left: 0;
  padding: 6px 12px;
  pointer-events: none;
  position: absolute;
  right: 0;
  text-align: center;
  text-transform: uppercase;
  white-space: nowrap;
  z-index: 3;
`;

const PackWrapper = styled.div`
  min-height: 440px;
  padding: 0px 8px 10px;
`;

const ExpandedProductLayout = styled.div`
  display: grid;
  grid-template-columns: minmax(300px, 36%) minmax(0, 64%);
  min-height: 490px;
`;

const ExpandedPackSummary = styled.div`
  align-items: center;
  background: rgba(${p => p.theme.hexToRGB(p.color)}, 0.16);
  border-right: 1px solid rgba(255, 255, 255, 0.15);
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 24px 32px;
  text-align: center;

  & h2 {
    color: white;
    font-size: 26px;
    font-weight: normal;
    margin: 16px 0 0;
    text-transform: uppercase;
  }
`;

const ExpandedPortrait = styled.div`
  filter: drop-shadow(0 8px 14px rgba(0, 0, 0, 0.75));
`;

const ExpandedDescription = styled.div`
  color: ${p => p.color || p.theme.colors.main};
  filter: brightness(135%);
  font-size: 15px;
  line-height: 1.45;
  margin: 14px 0 12px;
  max-width: 430px;
`;

const ExpandedDisclosure = styled.div`
  color: #ddd;
  font-size: 12px;
  line-height: 1.45;
  margin: 0 0 18px;
  max-width: 430px;
`;

const ExpandedPrice = styled(SKUHighlight)`
  margin: 0;
  width: 100%;
`;

const ExpandedPackContents = styled.div`
  align-items: center;
  display: flex;
  min-width: 0;
  padding: 22px;
`;

const PackFlavor = styled.div`
  align-items: center;
  color: ${p => p.color || p.theme.colors.main};
  display: flex;
  filter: brightness(135%);
  font-size: 14px;
  height: 85px;
  padding: 0 5px 0 95px;
  text-align: left;
`;

const PackContents = styled.div`
  padding: 10px 0 15px;
`;

const PackFeatureList = styled.div`
  margin-top: 5px;

  & > div {
    align-items: flex-start;
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
    padding-right: 4px;

    &:last-child {
      margin-bottom: 0;
    }

    & > span {
      color: ${p => p.color};
      flex: 0 0 24px;
      font-size: 12px;
      padding-top: 2px;
    }

    & > label {
      color: white;
      font-size: 13px;
      line-height: 18px;
    }
  }
`;

const ExpandedPackDetails = styled.div`
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: repeat(3, minmax(0, 1fr));
  height: 380px;
  width: 100%;
`;

const PackEntitlement = styled.div`
  align-items: center;
  background-color: rgba(${p => p.theme.colors.mainRGB}, ${p => p.$backgroundImage ? 0.18 : 0.34});
  ${p => p.$backgroundImage && `
    align-items: flex-end;
    background-image: url("${p.$backgroundImage}");
    background-position: center;
    background-repeat: no-repeat;
    background-size: cover;

    & > span:last-child {
      align-self: flex-end;
      padding: 7px 9px;
      width: 100%;
    }
  `}
  display: flex;
  gap: 10px;
  min-height: 0;
  overflow: hidden;
  padding: 14px;
  position: relative;
  transition: background 150ms ease;

  &[data-tooltip-content] {
    cursor: help;

    &:hover {
      background-color: rgba(${p => p.theme.colors.mainRGB}, ${p => p.$backgroundImage ? 0.3 : 0.44});

      & img {
        transform: scale(1.06);
      }
    }
  }

  & > span:first-child {
    align-items: center;
    color: ${p => p.color || p.theme.colors.main};
    display: flex;
    flex: 0 0 72px;
    font-size: 38px;
    justify-content: center;
    position: relative;
    z-index: 1;
  }

  & label {
    color: #e2e2e2;
    display: block;
    font-size: 12px;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
    text-transform: uppercase;
  }

  & strong {
    color: #e2e2e2;
    display: block;
    font-size: 22px;
    font-weight: normal;
    margin-top: 3px;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
  }
`;

const PackEntitlementContent = styled.span`
  align-self: center;
  min-width: 0;
  position: relative;
  z-index: 2;
`;

const PackThumbnail = styled.img`
  box-sizing: border-box;
  filter: drop-shadow(0 5px 10px rgba(0, 0, 0, 0.7));
  flex: 0 0 72px;
  height: 72px;
  object-fit: contain;
  padding: 5px;
  transition: transform 180ms ease;
  width: 72px;
`;

const Flair = styled.div`
  background: ${p => p.color || p.theme.colors.main};
  clip-path: polygon(0 0, 100% 0, 0 100%);
  font-size: 23px;
  height: 44px;
  left: 0;
  padding: 2px 3px;
  position: absolute;
  text-align: left;
  top: 0;
  width: 44px;
  z-index: 2;
`;

const FlairCard = styled.div`
  filter: drop-shadow(2px 2px 6px black);
  left: 5px;
  position: absolute;
  top: 5px;
  z-index: 1;
`;

const FlowPanel = styled.div`
  background: rgba(0, 0, 0, 0.82);
  border: 1px solid ${p => p.theme.colors.contentBorder};
  color: #ddd;
  margin-top: 18px;
  padding: 18px;
  width: 100%;
  & h3 {
    color: white;
    font-size: 18px;
    margin: 0 0 8px;
    text-transform: uppercase;
  }
  & p {
    line-height: 1.45em;
    margin: 0 0 12px;
  }
`;

const finalizingSweep = keyframes`
  0% { transform: translateX(-100%); }
  100% { transform: translateX(250%); }
`;

const Notice = styled.div`
  align-items: center;
  background: rgba(${p => p.warn ? p.theme.colors.warningRGB : p.theme.colors.mainRGB}, 0.18);
  color: white;
  display: flex;
  flex: 1 1 auto;
  gap: 10px;
  margin: 8px 0 0;
  min-width: 0;
  overflow: hidden;
  padding: 9px 14px;
  position: relative;
  width: 100%;

  &::after {
    animation: ${p => p.$finalizing ? finalizingSweep : 'none'} 2200ms ease-in-out infinite;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
    bottom: 0;
    content: '';
    display: ${p => p.$finalizing ? 'block' : 'none'};
    left: 0;
    pointer-events: none;
    position: absolute;
    top: 0;
    width: 42%;
  }

  & > * {
    position: relative;
    z-index: 1;
  }

  & > span {
    flex: 1;
  }

  & > button {
    flex: 0 0 auto;
    margin-left: auto;
    width: auto;
  }

  & > .notice-actions {
    display: flex;
    flex: 0 0 auto;
    gap: 10px;
    margin-left: auto;

    & > button {
      width: auto;
    }
  }
`;

const NoticeBody = styled.div`
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
`;

const NoticeActions = styled.div.attrs({ className: 'notice-actions' })``;

const StarterPackStatusSlot = styled.div`
  display: flex;
  margin: 0 auto;
  max-width: 1400px;
  width: 96%;
`;

const CheckoutAcknowledgement = styled.div`
  align-items: center;
  color: #ddd;
  cursor: ${p => p.theme.cursors.active};
  display: flex;
  flex: 0 1 auto;
  font-size: 12px;
  gap: 8px;
  line-height: 1.3;
  margin: 0;
  max-width: 980px;

  & ${CheckboxButton} {
    color: ${p => p.$checked ? p.theme.colors.main : '#aaa'};
    flex: 0 0 auto;
    margin-right: 0;
    opacity: ${p => p.$checked ? 1 : 0.65};
  }
`;

const DesignerWrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
`;

const DesignerFooter = styled.div`
  background: black;
  border-top: 1px solid #333;
  display: grid;
  flex: 0 0 80px;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 10px;
  padding: 0 35px;

  & > button:first-child {
    justify-self: start;
  }

  & > button:last-child {
    justify-self: end;
  }
`;

const CrewCounter = styled.div`
  color: ${p => p.theme.colors.main};
  text-align: center;

  & b {
    color: white;
    font-weight: normal;
  }
`;

const CrewReview = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  position: relative;
`;

const CrewReviewMain = styled(MainContainer)`
  flex: 1;
  min-height: 0;
  overflow: hidden auto;
`;

const CrewReviewOverview = styled(AboveFold)`
  flex-direction: column;
  min-height: 0;
`;

const CrewReviewCrew = styled.div`
  flex: 0 0 auto;
  width: 100%;
`;

const CrewReviewWrapper = styled(CrewWrapper)`
  & > :first-child {
    flex: 0 0 180px;
  }
`;

const CrewReviewCrewmates = styled(Crewmates)`
  margin-bottom: 25px;

  & > * {
    flex: 0 0 auto;
  }
`;

const CrewReviewSummary = styled(ManagementContainer)`
  display: flex;
  flex: 0 0 auto;
  flex-direction: row;
  border-left: 0;
  border-top: 1px solid #363636;
  gap: 20px;
  flex-direction: column;
  margin: 0 0 0 64px;
  padding: 20px 0 0;
  width: calc(100% - 64px);

  & > div {
    margin-top: 0;
  }
`;

const CrewReviewSummaryText = styled.p`
  color: ${p => p.theme.colors.secondaryText};
  line-height: 1.45;
  margin: 0;
`;

const CrewReviewStat = styled(Stat)`
  align-items: baseline;
  display: flex;
  gap: 6px;

  &:before {
    display: inline;
  }
`;

const CrewReviewFooter = styled.div`
  align-items: center;
  background: black;
  border-top: 1px solid #333;
  display: flex;
  flex: 0 0 80px;
  justify-content: space-between;
  padding: 0 35px;
`;

const Actions = styled.div`
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 14px;
`;

const DevPanel = styled(FlowPanel)`
  border-color: rgba(${p => p.theme.colors.warningRGB}, 0.5);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.75);
  margin: 0;
  width: 560px;
  & textarea {
    background: #050505;
    border: 1px solid #333;
    color: #ddd;
    font-family: monospace;
    font-size: 11px;
    min-height: 150px;
    padding: 8px;
    resize: vertical;
    width: 100%;
  }
`;

const FloatingDevTools = styled.div`
  pointer-events: auto;
  position: relative;
`;

const DevToggle = styled(Button)`
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.6);
  height: 35px;
  width: auto;
`;

const DevControls = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
  & input {
    background: black;
    border: 1px solid #333;
    color: white;
    flex: 1 0 260px;
    height: 36px;
    padding: 0 8px;
  }
  & button {
    width: auto;
  }
`;

const formatPrice = (product) => {
  const currency = (product.currency || 'usd').toUpperCase();
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format((product.amount || 0) / 100);
};

const getCheckoutSessionIdFromUrl = () => {
  if (typeof window === 'undefined') return null;
  return new URL(window.location.href).searchParams.get(STARTER_PACK_CHECKOUT_PARAM);
};

const clearCheckoutSessionIdFromUrl = () => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has(STARTER_PACK_CHECKOUT_PARAM)) return;
  url.searchParams.delete(STARTER_PACK_CHECKOUT_PARAM);
  window.history.replaceState({}, '', url.toString());
};

const PackEntitlements = ({ color, product }) => (
  <ExpandedPackDetails>
    {!!product.requiredCrewmates && (
      <PackEntitlement
        color={color}
        data-tooltip-content={product.features?.[0]}
        data-tooltip-id="launcherTooltip"
        data-tooltip-place="top">
        <span><CrewmateCreditIcon /></span>
        <PackEntitlementContent>
          <label>Crewmates</label>
          <strong>{product.requiredCrewmates}</strong>
        </PackEntitlementContent>
      </PackEntitlement>
    )}
    {!!product.lotAllowance && (
      <PackEntitlement
        color={color}
        data-tooltip-content={product.features?.[1]}
        data-tooltip-id="launcherTooltip"
        data-tooltip-place="top">
        <span><LotControlIcon /></span>
        <PackEntitlementContent>
          <label>Starter Lots</label>
          <strong>{product.lotAllowance}</strong>
        </PackEntitlementContent>
      </PackEntitlement>
    )}
    {!!product.coreSampleAllowance && (
      <PackEntitlement
        color={color}
        data-tooltip-content={product.features?.[2]}
        data-tooltip-id="launcherTooltip"
        data-tooltip-place="top">
        <PackThumbnail alt="" src={getProductIcon(Product.IDS.CORE_DRILL, 'w400')} />
        <PackEntitlementContent>
          <label>Core Samples</label>
          <strong>{product.coreSampleAllowance}</strong>
        </PackEntitlementContent>
      </PackEntitlement>
    )}
    {!!product.foodReloadAllowance && (
      <PackEntitlement
        color={color}
        data-tooltip-content={product.features?.[3]}
        data-tooltip-id="launcherTooltip"
        data-tooltip-place="top">
        <PackThumbnail alt="" src={getProductIcon(Product.IDS.FOOD, 'w400')} />
        <PackEntitlementContent>
          <label>Food Resupplies</label>
          <strong>{product.foodReloadAllowance}</strong>
        </PackEntitlementContent>
      </PackEntitlement>
    )}
    {product.buildings.map(({ id }) => (
      <PackEntitlement
        $backgroundImage={getBuildingIcon(id, 'w400')}
        key={id}
        color={color}
        data-tooltip-content={product.features?.[4]}
        data-tooltip-id="launcherTooltip"
        data-tooltip-place="top">
        <PackEntitlementContent>
          <label>Construct {Building.TYPES[id]?.name}</label>
        </PackEntitlementContent>
      </PackEntitlement>
    ))}
  </ExpandedPackDetails>
);

const ProductCard = ({ disabled, expanded, isPurchasing, isRecommended, locked, onSelect, product }) => {
  const { color, colorLabel, crewmateAppearance, flairIcon } = product.ui;
  const displayCrewmate = {
    Crewmate: {
      appearance: crewmateAppearance,
      class: 0,
      coll: Crewmate.COLLECTION_IDS.ADALIAN
    }
  };

  const unavailable = disabled || isPurchasing;
  const activate = () => {
    if (!unavailable && !expanded) onSelect(product);
  };
  const onKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate();
    }
  };

  return (
    <StarterPackPurchaseForm
      aria-disabled={unavailable}
      aria-label={locked
        ? `${product.name} starter pack purchased`
        : (expanded ? `${product.name} starter pack selected` : `Select ${product.name} starter pack`)}
      color={colorLabel}
      data-expanded={expanded}
      data-locked={locked}
      $highlightColor={color}
      onClick={activate}
      onKeyDown={onKeyDown}
      pack={{ price: { usdcValue: product.amount * 10000 } }}
      role={expanded ? 'group' : 'button'}
      tabIndex={unavailable || expanded ? -1 : 0}
      asButton>
      {isRecommended && <RecommendedBadge>Recommended</RecommendedBadge>}
      {expanded
        ? (
          <ExpandedProductLayout>
            <Flair color={color}>{flairIcon || <MyAssetIcon />}</Flair>
            <ExpandedPackSummary color={color}>
              <ExpandedPortrait>
                <CrewmateCardFramed
                  isCaptain
                  CrewmateCardProps={{ useExplicitAppearance: true }}
                  crewmate={displayCrewmate}
                  width={expandedPackPortraitWidth} />
              </ExpandedPortrait>
              <h2>{product.name}</h2>
              <ExpandedDescription color={color}>{product.description}</ExpandedDescription>
              <ExpandedDisclosure>
                Starter packs include early-game support for getting established in the belt. After the starter period, further actions may require additional funds. In-game resources can be earned during play or additional funds added later if needed.
              </ExpandedDisclosure>
              <ExpandedPrice color={color}>
                <span>{formatPrice(product)}</span>
              </ExpandedPrice>
            </ExpandedPackSummary>
            <ExpandedPackContents>
              <PackEntitlements color={color} product={product} />
            </ExpandedPackContents>
          </ExpandedProductLayout>
        )
        : (
          <>
            <h2>
              <Flair color={color}>{flairIcon || <MyAssetIcon />}</Flair>
              <FlairCard>
                <CrewmateCardFramed
                  isCaptain
                  CrewmateCardProps={{ useExplicitAppearance: true }}
                  crewmate={displayCrewmate}
                  width={85} />
              </FlairCard>
              {product.name}
            </h2>
            <PackWrapper>
              <PackFlavor color={color}>{product.description}</PackFlavor>
              <PackContents color={color}>
                <SKUHighlight color={color}>
                  <span>{formatPrice(product)}</span>
                </SKUHighlight>
                <SKUHighlight color={color}>
                  <CrewmateCreditIcon />
                  <span style={{ marginLeft: 8 }}>
                    {product.requiredCrewmates} Crewmate{product.requiredCrewmates === 1 ? '' : 's'}
                  </span>
                </SKUHighlight>
              </PackContents>
              <PackFeatureList color={color}>
                {product.features?.map((feature, index) => (
                  <div key={index}>
                    <span><CheckIcon /></span>
                    <label>{feature}</label>
                  </div>
                ))}
              </PackFeatureList>
            </PackWrapper>
          </>
        )}
    </StarterPackPurchaseForm>
  );
};

const PackSelectionStatus = ({ acknowledged, confirming, onAcknowledge, onCancel, onConfirm, product }) => {
  const onAcknowledgementKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onAcknowledge();
    }
  };

  return (
    <Notice>
      <NoticeBody>
        <CheckoutAcknowledgement
          $checked={acknowledged}
          aria-checked={acknowledged}
          onClick={onAcknowledge}
          onKeyDown={onAcknowledgementKeyDown}
          role="checkbox"
          tabIndex={0}>
          <CheckboxButton
            checked={acknowledged}
            tabIndex={-1}
            type="button">
            {acknowledged ? <CheckedIcon /> : <UncheckedIcon />}
          </CheckboxButton>
          <span>
            I understand that by checking out for the <b>{product.name}</b>, fulfillment begins when I submit my starter crew customization, and once fulfillment begins I may lose any statutory withdrawal right for this digital content.
          </span>
        </CheckoutAcknowledgement>
      </NoticeBody>
      <NoticeActions>
        <Button disabled={nativeBool(confirming)} onClick={onCancel}>Back</Button>
        <Button disabled={nativeBool(confirming || !acknowledged)} isTransaction onClick={onConfirm}>
          {confirming ? 'Opening Stripe...' : 'Checkout'}
        </Button>
      </NoticeActions>
    </Notice>
  );
};

const PurchaseStatus = ({
  accountDeploying,
  awaitingPaymentConfirmation,
  canResumeCheckout,
  onClear,
  onCustomize,
  onResumeCheckout,
  product,
  purchase
}) => {
  if (!purchase) return null;

  if (purchase.status === STARTER_PACK_STATUSES.PAID_PENDING_CUSTOMIZATION) {
    if (accountDeploying) {
      return (
        <Notice $finalizing>
          <span>Setting up your Influence account. Please wait...</span>
        </Notice>
      );
    }

    return (
      <Notice>
        <CheckIcon />
        <span>Payment confirmed for {product?.name}. Create your starter crew to finish provisioning.</span>
        <Button onClick={onCustomize}>Customize Crew</Button>
      </Notice>
    );
  }

  if (
    isStarterPackGrantPending(purchase.status) ||
    purchase.status === STARTER_PACK_STATUSES.GRANT_CONFIRMED
  ) {
    return (
      <Notice $finalizing>
        <span>Finalizing crewmate recruitment...</span>
      </Notice>
    );
  }

  if (purchase.status === STARTER_PACK_STATUSES.GRANT_FAILED) {
    return (
      <Notice warn>
        <WarningIcon />
        <span>{purchase.grantError || 'Starter pack grant failed. Please try submitting again.'}</span>
      </Notice>
    );
  }

  if (purchase.status === STARTER_PACK_STATUSES.CHECKOUT_CREATED) {
    if (awaitingPaymentConfirmation) {
      return (
        <Notice $finalizing>
          <span>Crewmate recruitment in progress. Please wait...</span>
        </Notice>
      );
    }

      return (
        <Notice>
          <CheckIcon />
          <span>Checkout created for {product?.name}. Complete payment to continue.</span>
          <NoticeActions>
            <Button onClick={onClear}>Clear</Button>
            <Button
              disabled={nativeBool(!canResumeCheckout)}
              isTransaction
              onClick={onResumeCheckout}>
              {canResumeCheckout ? 'Resume Checkout' : 'Loading Checkout...'}
            </Button>
          </NoticeActions>
        </Notice>
      );
  }

  return (
    <Notice>
      <CheckIcon />
      <span>Waiting for Stripe payment confirmation.</span>
      <Button onClick={onClear}>Clear</Button>
    </Notice>
  );
};

const getCrewmateReadiness = (crewmate) => (
  !!crewmate?.name?.trim() &&
  !!crewmate?.classId &&
  crewmate?.selectedTraits?.length === STARTER_PACK_CREWMATE_TRAIT_TALLY
);

const StarterPackCrewReview = ({ draft, isComplete, isMockPurchase, onEdit, onSubmit, submitting }) => {
  const crewmates = draft.crewmates.map(buildStarterPackCrewmate);

  return (
    <CrewReview>
      <CoverImage src={OwnedCrewImage} />
      <CrewReviewMain>
        <CrewReviewOverview>
          <CrewReviewCrew>
            <CrewReviewWrapper>
              <CrewmateCardFramed
                CrewmateCardProps={{ hideHeader: false, noWrapName: true, useExplicitAppearance: true }}
                crewmate={crewmates[0]}
                isCaptain
                onClick={() => onEdit(0)}
                width={180} />
              <CrewInfoContainer>
                <CrewReviewCrewmates>
                  {crewmates.slice(1).map((crewmate, index) => (
                    <CrewmateCardFramed
                      key={index + 1}
                      CrewmateCardProps={{ hideHeader: false, noWrapName: true, useExplicitAppearance: true }}
                      crewmate={crewmate}
                      noArrow
                      onClick={() => onEdit(index + 1)}
                      width={146} />
                  ))}
                </CrewReviewCrewmates>
                <TitleBar>Starter Crew</TitleBar>
              </CrewInfoContainer>
            </CrewReviewWrapper>
          </CrewReviewCrew>
          <CrewReviewSummary>
            <MyCrewStatement><CheckIcon /> Starter crew ready for submission.</MyCrewStatement>
            <CrewReviewStat label="Crewmates">{crewmates.length}</CrewReviewStat>
            <CrewReviewSummaryText>
              Select any crewmate to make adjustments before submitting the starter crew for provisioning.
            </CrewReviewSummaryText>
          </CrewReviewSummary>
        </CrewReviewOverview>
      </CrewReviewMain>
      <CrewReviewFooter>
        <Button onClick={() => onEdit(draft.crewmates.length - 1)}>Back</Button>
        <Button
          disabled={nativeBool(!isComplete || submitting)}
          onClick={onSubmit}>
          {submitting ? 'Submitting...' : (isMockPurchase ? 'Copy Grant Payload' : 'Submit Starter Crew')}
        </Button>
      </CrewReviewFooter>
    </CrewReview>
  );
};

const StarterPackCustomization = ({
  draft,
  isMockPurchase,
  onCrewmateChange,
  onSubmit,
  purchase,
  submitting
}) => {
  const isNameValid = useNameAvailability({ id: 0, label: Entity.IDS.CREWMATE });
  const [activeIndex, setActiveIndex] = useState(0);
  const [checkingName, setCheckingName] = useState(false);
  const [nameError, setNameError] = useState(null);
  const [reviewing, setReviewing] = useState(false);

  const requiredCrewmates = purchase?.requiredCrewmates || 0;
  const isComplete = isStarterPackCustomizationDraftComplete(draft, requiredCrewmates);
  const activeDraft = draft?.crewmates?.[activeIndex];
  const activeCrewmate = useMemo(() => (
    activeDraft ? buildStarterPackCrewmate(activeDraft, activeIndex) : null
  ), [activeDraft, activeIndex]);
  const activeCrewmateReady = getCrewmateReadiness(activeDraft);
  const hasActiveDraft = !!activeDraft;
  const activeName = activeDraft?.name || '';

  const updateActiveCrewmate = (update) => {
    onCrewmateChange(activeIndex, update);
  };

  const onUpdateClass = (classId) => {
    updateActiveCrewmate({ classId, selectedTraits: [] });
  };

  const onUpdateTraits = (selectedTraits) => {
    updateActiveCrewmate({ selectedTraits });
  };

  const onRerollTraits = () => {
    updateActiveCrewmate({
      selectedTraits: getRandomStarterPackTraits(activeDraft.classId, activeDraft.selectedTraits)
    });
  };

  const onRerollAppearance = () => {
    const appearanceOptions = [...(activeDraft.appearanceOptions || []), getRandomAdalianAppearance()];
    updateActiveCrewmate({
      appearanceOptions,
      appearanceSelection: appearanceOptions.length - 1
    });
  };

  const setAppearanceSelection = (appearanceSelection) => {
    updateActiveCrewmate({ appearanceSelection });
  };

  useEffect(() => {
    if (!hasActiveDraft) {
      setCheckingName(false);
      setNameError(null);
      return;
    }
    setNameError('');

    const testName = `${activeName}`;
    if (testName.length > 0) {
      const to = setTimeout(() => {
        setCheckingName(true);
        isNameValid(testName, 0, false, 'string').then((trueOrNameErr) => {
          setNameError(trueOrNameErr === true ? null : trueOrNameErr);
          setCheckingName(false);
        });
      }, 500);
      return () => {
        if (to) clearTimeout(to);
      };
    }

    setNameError('Enter Crewmate Name');
    setCheckingName(false);
  }, [activeIndex, activeName, hasActiveDraft, isNameValid]);

  useEffect(() => {
    if (!draft?.crewmates?.length) return;
    setActiveIndex((index) => Math.min(index, draft.crewmates.length - 1));
  }, [draft?.crewmates?.length]);

  const onNext = () => {
    if (activeIndex < draft.crewmates.length - 1) {
      setActiveIndex(activeIndex + 1);
      return;
    }

    setReviewing(true);
  };

  const onBack = () => {
    if (activeIndex > 0) {
      setActiveIndex(activeIndex - 1);
      return;
    }

    setReviewing(isComplete);
  };

  const onEdit = (index) => {
    setActiveIndex(index);
    setReviewing(false);
  };

  if (!purchase?.canCustomize || !draft || !activeDraft) return null;

  if (reviewing) {
    return (
      <StarterPackCrewReview
        draft={draft}
        isComplete={isComplete}
        isMockPurchase={isMockPurchase}
        onEdit={onEdit}
        onSubmit={onSubmit}
        submitting={submitting} />
    );
  }

  return (
    <DesignerWrapper>
      <CrewmateDesigner
        appearanceOptionsLength={activeDraft.appearanceOptions?.length || 1}
        appearanceSelection={activeDraft.appearanceSelection || 0}
        checkingName={checkingName}
        crewmate={activeCrewmate}
        disableChanges={submitting}
        finalizing={submitting}
        footer={(
          <DesignerFooter>
            <Button disabled={nativeBool((activeIndex === 0 && !isComplete) || submitting)} onClick={onBack}>
              {activeIndex === 0 && isComplete ? 'Back to Review' : 'Previous Crewmate'}
            </Button>
            <CrewCounter>
              Crewmate <b>{activeIndex + 1}</b> of <b>{draft.crewmates.length}</b>
            </CrewCounter>
            <Button
              disabled={nativeBool(!activeCrewmateReady || checkingName || nameError !== null || submitting)}
              onClick={onNext}>
              {activeIndex === draft.crewmates.length - 1 ? 'Review Crew' : 'Next Crewmate'}
            </Button>
          </DesignerFooter>
        )}
        name={activeDraft.name}
        nameError={nameError}
        nameInputKey={activeIndex}
        onNameChange={(name) => updateActiveCrewmate({ name })}
        onRerollAppearance={onRerollAppearance}
        onRerollTraits={onRerollTraits}
        onRollBackAppearance={() => setAppearanceSelection(Math.max(0, (activeDraft.appearanceSelection || 0) - 1))}
        onRollForwardAppearance={() => setAppearanceSelection(Math.min(
          (activeDraft.appearanceOptions?.length || 1) - 1,
          (activeDraft.appearanceSelection || 0) + 1
        ))}
        onUpdateClass={onUpdateClass}
        onUpdateTraits={onUpdateTraits}
        popoverZIndex={10001}
        promptingTransaction={submitting}
        selectedTraits={activeDraft.selectedTraits || []}
        traitTally={STARTER_PACK_CREWMATE_TRAIT_TALLY}
        traitsLocked={false} />
    </DesignerWrapper>
  );
};

const StarterPackDevTools = ({
  currentDraft,
  currentPurchase,
  onCopyGrantPayload,
  onForceCheckoutResume,
  onMockPurchase,
  onRandomizeDraft,
  onReset,
  onSeedDraft,
  products
}) => {
  const [checkoutSessionId, setCheckoutSessionId] = useState('');
  const [grantPayload, setGrantPayload] = useState('');
  const [open, setOpen] = useState(false);
  const [portalTarget, setPortalTarget] = useState();

  const currentIsMock = isDevStarterPackPurchase(currentPurchase);

  useEffect(() => {
    setPortalTarget(document.getElementById('launcher-dialog-top-right-slot'));
  }, []);

  const showGrantPayload = () => {
    if (!currentDraft) {
      setGrantPayload('');
      return;
    }
    const payload = JSON.stringify(buildStarterPackGrantRequest(currentDraft), null, 2);
    setGrantPayload(payload);
    onCopyGrantPayload(payload);
  };

  const content = (
    <FloatingDevTools>
      {!open && (
        <DevToggle onClick={() => setOpen(true)}>Starter Pack Test Tools</DevToggle>
      )}
      {open && (
        <DevPanel>
          <Actions style={{ marginTop: 0 }}>
            <Button onClick={() => setOpen(false)}>Collapse</Button>
          </Actions>
          <h3>Starter Pack Test Tools</h3>
          <p>Sandbox checkout still uses the real pack buttons. Mock controls are local-only and never submit a paid entitlement.</p>
          <DevControls>
            <input
              value={checkoutSessionId}
              onChange={(e) => setCheckoutSessionId(e.target.value)}
              placeholder="Stripe checkout session id" />
            <Button
              disabled={nativeBool(!checkoutSessionId.trim())}
              onClick={() => onForceCheckoutResume(checkoutSessionId.trim())}>
              Resume Checkout
            </Button>
            <Button onClick={onReset}>Reset Starter State</Button>
          </DevControls>

          <DevControls>
            {(products || []).map((product) => (
              <Button key={product.productId} onClick={() => onMockPurchase(product)}>
                Mock Paid {product.name}
              </Button>
            ))}
          </DevControls>

          {currentPurchase && (
            <DevControls>
              <Button onClick={() => onSeedDraft('Test Crewmate')}>Seed Draft</Button>
              <Button onClick={onRandomizeDraft}>Randomize Whole Crew</Button>
              <Button disabled={nativeBool(!currentDraft)} onClick={showGrantPayload}>Copy Grant Payload</Button>
              {currentIsMock && <span style={{ color: '#aaa', lineHeight: '36px' }}>Mock purchase active</span>}
            </DevControls>
          )}

          {grantPayload && <textarea readOnly value={grantPayload} />}
        </DevPanel>
      )}
    </FloatingDevTools>
  );

  return portalTarget ? createPortal(content, portalTarget) : content;
};

const StarterPackSKU = () => {
  const queryClient = useQueryClient();
  const { accountAddress, authenticated, isDeployed, login, walletCapabilities } = useSession();
  const { crew: selectedCrew, crews, loading: crewsLoading } = useCrewContext();
  const { deployAccount } = useContext(ChainTransactionContext);
  const createAlert = useStore(s => s.dispatchAlertLogged);
  const starterPackCheckout = useStore(s => s.starterPackCheckout);
  const starterPackCustomizationDrafts = useStore(s => s.starterPackCustomizationDrafts || {});
  const dispatchStarterPackCheckoutStarted = useStore(s => s.dispatchStarterPackCheckoutStarted);
  const dispatchStarterPackCheckoutUpdated = useStore(s => s.dispatchStarterPackCheckoutUpdated);
  const dispatchStarterPackCheckoutCleared = useStore(s => s.dispatchStarterPackCheckoutCleared);
  const dispatchStarterPackCustomizationDraftInitialized = useStore(s => s.dispatchStarterPackCustomizationDraftInitialized);
  const dispatchStarterPackCustomizationDraftUpdated = useStore(s => s.dispatchStarterPackCustomizationDraftUpdated);
  const dispatchStarterPackCustomizationCrewmateUpdated = useStore(s => s.dispatchStarterPackCustomizationCrewmateUpdated);
  const dispatchStarterPackCustomizationDraftCleared = useStore(s => s.dispatchStarterPackCustomizationDraftCleared);
  const dispatchStarterPackStateReset = useStore(s => s.dispatchStarterPackStateReset);
  const dispatchCrewSelected = useStore(s => s.dispatchCrewSelected);
  const dispatchHudMenuOpened = useStore(s => s.dispatchHudMenuOpened);
  const dispatchLauncherPage = useStore(s => s.dispatchLauncherPage);

  const [returnedCheckoutSessionId] = useState(getCheckoutSessionIdFromUrl);
  const [checkoutSessionId, setCheckoutSessionId] = useState(returnedCheckoutSessionId);
  const [checkoutClientSecret, setCheckoutClientSecret] = useState();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [awaitingPaymentConfirmation, setAwaitingPaymentConfirmation] = useState(false);
  const [returnCheckoutHandled, setReturnCheckoutHandled] = useState(false);
  const [checkoutProductId, setCheckoutProductId] = useState();
  const [devPurchase, setDevPurchase] = useState(null);
  const [customizationOpen, setCustomizationOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState();
  const [checkoutAcknowledged, setCheckoutAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deployingAccount, setDeployingAccount] = useState(false);
  const [provisionedCrewId, setProvisionedCrewId] = useState();
  const completedPurchaseRef = useRef();
  const accountSetupPurchaseRef = useRef();
  const accountSetupInFlightRef = useRef();

  const { data: products, isLoading: productsLoading } = useStarterPacks();
  const devToolsEnabled = !!appConfig.get('App.enableDevTools');
  const storedCheckoutSessionId = starterPackCheckout?.checkoutSessionId;
  const effectiveCheckoutSessionId = checkoutSessionId || storedCheckoutSessionId;

  useEffect(() => {
    if (returnedCheckoutSessionId) clearCheckoutSessionIdFromUrl();
  }, [returnedCheckoutSessionId]);

  const customizationPortalTarget = typeof document === 'undefined' ? null : document.body;

  const checkoutQuery = useQuery({
    queryKey: ['starterPackCheckout', effectiveCheckoutSessionId],
    queryFn: () => api.getStarterPackCheckout(effectiveCheckoutSessionId),
    enabled: !!authenticated && !!effectiveCheckoutSessionId,
    refetchInterval: (query) => isStarterPackCheckoutActive(query.state.data?.purchase?.status) ? checkoutPollMs : false
  });

  const pendingQuery = useQuery({
    queryKey: ['starterPackPending', accountAddress],
    queryFn: api.getPendingStarterPackPurchase,
    enabled: !!authenticated,
    refetchInterval: (query) => isStarterPackCheckoutActive(query.state.data?.purchase?.status) ? checkoutPollMs : false
  });

  const checkoutPurchase = checkoutQuery.data?.purchase || null;
  const pendingPurchase = pendingQuery.data?.purchase || null;
  const usablePendingPurchase = shouldUsePendingStarterPackPurchase(pendingPurchase, starterPackCheckout)
    ? pendingPurchase
    : null;
  const realPurchase = checkoutPurchase || usablePendingPurchase || null;
  const purchase = devToolsEnabled && devPurchase ? devPurchase : realPurchase;
  const grantedCrewId = purchase?.status === STARTER_PACK_STATUSES.GRANT_CONFIRMED && purchase.grantedCrew?.id
    ? Number(purchase.grantedCrew?.id)
    : null;
  const ownedCrewsQueryKey = useMemo(
    () => entitiesCacheKey(Entity.IDS.CREW, { owner: accountAddress }),
    [accountAddress]
  );
  const grantedCrewQuery = useQuery({
    queryKey: ['entity', Entity.IDS.CREW, grantedCrewId],
    queryFn: () => api.getEntityById({ label: Entity.IDS.CREW, id: grantedCrewId }),
    enabled: !!authenticated && !!grantedCrewId,
    refetchInterval: (query) => query.state.data?.StarterPack ? false : grantedCrewPollMs
  });
  const isMockPurchase = isDevStarterPackPurchase(purchase);
  const selectedProduct = useMemo(() => (
    products?.find((product) => product.productId === selectedProductId)
  ), [products, selectedProductId]);
  const purchaseProduct = useMemo(() => (
    products?.find((product) => (
      product.productId === purchase?.productId ||
      product.productId === checkoutProductId
    ))
  ), [checkoutProductId, products, purchase?.productId]);
  const draft = purchase?.id ? starterPackCustomizationDrafts[purchase.id] : null;
  const displayedProduct = purchaseProduct || selectedProduct;
  const visibleProducts = displayedProduct ? [displayedProduct] : (products || []);

  useEffect(() => {
    setCheckoutAcknowledged(false);
  }, [selectedProductId]);

  useEffect(() => {
    if (checkoutQuery.data?.clientSecret) {
      setCheckoutClientSecret(checkoutQuery.data.clientSecret);
    }
  }, [checkoutQuery.data?.clientSecret]);

  useEffect(() => {
    if (!checkoutQuery.error) return;
    createAlert({
      type: 'GenericAlert',
      level: 'warning',
      data: {
        content: checkoutQuery.error?.response?.data?.error ||
          checkoutQuery.error.message ||
          'Unable to load Stripe checkout.'
      },
      duration: 10000
    });
  }, [checkoutQuery.error, createAlert]);

  useEffect(() => {
    if (
      returnCheckoutHandled ||
      !returnedCheckoutSessionId ||
      returnedCheckoutSessionId !== effectiveCheckoutSessionId ||
      !checkoutQuery.data
    ) return;

    setReturnCheckoutHandled(true);
    if (
      checkoutQuery.data.purchase?.status === STARTER_PACK_STATUSES.CHECKOUT_CREATED &&
      checkoutQuery.data.clientSecret
    ) {
      setCheckoutOpen(true);
    } else if (
      checkoutQuery.data.purchase?.status === STARTER_PACK_STATUSES.CHECKOUT_CREATED &&
      !checkoutQuery.data.clientSecret
    ) {
      createAlert({
        type: 'GenericAlert',
        level: 'warning',
        data: { content: 'Stripe checkout could not be resumed because the server response was incomplete.' },
        duration: 10000
      });
    }
  }, [
    checkoutQuery.data,
    createAlert,
    effectiveCheckoutSessionId,
    returnCheckoutHandled,
    returnedCheckoutSessionId
  ]);

  useEffect(() => {
    if (!purchase) return;
    setSelectedProductId(undefined);
    setCheckoutAcknowledged(false);
    if (!isMockPurchase) dispatchStarterPackCheckoutUpdated(purchase);
    if (purchase.canCustomize) dispatchStarterPackCustomizationDraftInitialized(purchase);
  }, [
    dispatchStarterPackCheckoutUpdated,
    dispatchStarterPackCustomizationDraftInitialized,
    purchase?.id,
    purchase?.status,
    purchase?.canCustomize,
    purchase?.requiredCrewmates,
    purchase,
    isMockPurchase
  ]);

  useEffect(() => {
    if (!purchase?.id || accountSetupPurchaseRef.current === purchase.id) return;
    accountSetupPurchaseRef.current = undefined;
    accountSetupInFlightRef.current = undefined;
  }, [purchase?.id]);

  useEffect(() => {
    if (!purchase?.canCustomize || !draft) return;

    if (
      isMockPurchase ||
      isDeployed ||
      !walletCapabilities.requiresSponsoredTransactions ||
      accountSetupPurchaseRef.current === purchase.id ||
      accountSetupInFlightRef.current === purchase.id
    ) {
      if (accountSetupInFlightRef.current !== purchase.id) setCustomizationOpen(true);
      return;
    }

    let cancelled = false;
    accountSetupInFlightRef.current = purchase.id;
    setDeployingAccount(true);

    deployAccount()
      .then((result) => {
        if (result?.deployed) accountSetupPurchaseRef.current = purchase.id;
        if (!cancelled && result?.deployed) setCustomizationOpen(true);
      })
      .catch((e) => {
        accountSetupPurchaseRef.current = undefined;
        if (!cancelled) {
          createAlert({
            type: 'GenericAlert',
            level: 'warning',
            data: { content: e?.userMessage || e.message || 'Unable to set up your Influence account.' },
            duration: 10000
          });
        }
      })
      .finally(() => {
        if (accountSetupInFlightRef.current === purchase.id) accountSetupInFlightRef.current = undefined;
        if (!cancelled) setDeployingAccount(false);
      });

    return () => { cancelled = true; };
  }, [
    createAlert,
    deployAccount,
    draft,
    isDeployed,
    isMockPurchase,
    purchase?.canCustomize,
    purchase?.id,
    walletCapabilities.requiresSponsoredTransactions
  ]);

  useEffect(() => {
    if (purchase?.status && purchase.status !== STARTER_PACK_STATUSES.CHECKOUT_CREATED) {
      setCheckoutOpen(false);
      setAwaitingPaymentConfirmation(false);
    }
  }, [purchase?.status]);

  useEffect(() => {
    const grantedCrew = grantedCrewQuery.data;
    if (
      !purchase?.id ||
      !grantedCrewId ||
      grantedCrew?.id !== grantedCrewId ||
      !grantedCrew?.StarterPack ||
      completedPurchaseRef.current === purchase.id
    ) return;

    completedPurchaseRef.current = purchase.id;
    setProvisionedCrewId(grantedCrewId);
    queryClient.setQueryData(ownedCrewsQueryKey, (current = []) => {
      if (current.some((crew) => crew.id === grantedCrewId)) {
        return current.map((crew) => crew.id === grantedCrewId ? grantedCrew : crew);
      }
      return [...current, grantedCrew];
    });
    queryClient.invalidateQueries({ queryKey: ['entities', Entity.IDS.CREWMATE] });

    queryClient.setQueryData(['starterPackPending', accountAddress], { purchase: null });
    if (effectiveCheckoutSessionId) {
      queryClient.removeQueries({
        exact: true,
        queryKey: ['starterPackCheckout', effectiveCheckoutSessionId]
      });
    }
    setCheckoutSessionId(null);
    setCheckoutClientSecret(undefined);
    setCheckoutOpen(false);
    setAwaitingPaymentConfirmation(false);
    setCustomizationOpen(false);
    setSelectedProductId(undefined);
    setDevPurchase(null);

    dispatchStarterPackCustomizationDraftCleared(purchase.id);
    dispatchStarterPackCheckoutCleared();
  }, [
    accountAddress,
    dispatchStarterPackCheckoutCleared,
    dispatchStarterPackCustomizationDraftCleared,
    effectiveCheckoutSessionId,
    grantedCrewId,
    grantedCrewQuery.data,
    ownedCrewsQueryKey,
    purchase?.id,
    queryClient
  ]);

  useEffect(() => {
    if (!provisionedCrewId || crewsLoading) return;

    const provisionedCrew = crews?.find((crew) => crew.id === provisionedCrewId);
    const roster = provisionedCrew?.Crew?.roster || [];
    const rosterReady = roster.length > 0 && roster.every((crewmateId) => (
      provisionedCrew._crewmates?.some((crewmate) => crewmate.id === crewmateId)
    ));
    if (!rosterReady) return;

    if (selectedCrew?.id !== provisionedCrewId) {
      dispatchCrewSelected(provisionedCrewId);
      return;
    }

    setProvisionedCrewId(undefined);
    dispatchHudMenuOpened('MY_CREWS');
    dispatchLauncherPage('play');
    createAlert({
      type: 'GenericAlert',
      level: 'success',
      data: { content: 'Crewmate recruitment complete. See you in the belt captain!' },
      duration: 10000
    });
  }, [
    createAlert,
    crews,
    crewsLoading,
    dispatchCrewSelected,
    dispatchHudMenuOpened,
    dispatchLauncherPage,
    provisionedCrewId,
    selectedCrew?.id
  ]);

  const refreshPurchases = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['starterPackPending'] });
    if (effectiveCheckoutSessionId) {
      queryClient.invalidateQueries({ queryKey: ['starterPackCheckout', effectiveCheckoutSessionId] });
    }
  }, [effectiveCheckoutSessionId, queryClient]);

  const onCheckoutComplete = useCallback(() => {
    setCheckoutOpen(false);
    setAwaitingPaymentConfirmation(true);
    refreshPurchases();
  }, [refreshPurchases]);

  const onCheckout = useCallback(async (product) => {
    if (!authenticated) {
      login(getPrimaryNewPlayerLoginOptions());
      return;
    }

    if (!stripePromise) {
      createAlert({
        type: 'GenericAlert',
        level: 'warning',
        data: { content: 'Stripe Checkout is not configured for this environment.' },
        duration: 10000
      });
      return;
    }

    setCheckoutProductId(product.productId);
    setAwaitingPaymentConfirmation(false);
    try {
      const response = await api.createStarterPackCheckout({
        productId: product.productId,
        recipient: accountAddress,
        returnUrl: buildStarterPackReturnUrl()
      });

      if (!response.checkoutSessionId || !response.clientSecret || !response.purchase) {
        throw new Error('Stripe checkout response was incomplete.');
      }

      dispatchStarterPackCheckoutStarted(response.purchase, {
        checkoutSessionId: response.checkoutSessionId
      });
      setCheckoutSessionId(response.checkoutSessionId);
      setCheckoutClientSecret(response.clientSecret);
      setCheckoutOpen(true);
    } catch (e) {
      createAlert({
        type: 'GenericAlert',
        level: 'warning',
        data: { content: e?.response?.data?.error || e.message || 'Unable to create Stripe checkout.' },
        duration: 10000
      });
    } finally {
      setCheckoutProductId();
    }
  }, [accountAddress, authenticated, createAlert, dispatchStarterPackCheckoutStarted, login]);

  const onCrewmateChange = useCallback((index, update) => {
    dispatchStarterPackCustomizationCrewmateUpdated(purchase.id, index, update);
  }, [dispatchStarterPackCustomizationCrewmateUpdated, purchase?.id]);

  const copyGrantPayload = useCallback((payload) => {
    if (!payload && draft) payload = JSON.stringify(buildStarterPackGrantRequest(draft), null, 2);
    if (!payload) return;

    navigator.clipboard?.writeText(payload);
    createAlert({
      type: 'GenericAlert',
      level: 'info',
      data: { content: 'Starter pack grant payload copied.' },
      duration: 4000
    });
  }, [createAlert, draft]);

  const onSubmitCustomization = useCallback(async () => {
    if (!purchase || !draft) return;
    if (isMockPurchase) {
      copyGrantPayload();
      return;
    }

    setSubmitting(true);
    try {
      const response = await api.submitStarterPackCustomization({
        purchaseId: purchase.id,
        grantRequest: buildStarterPackGrantRequest(draft)
      });
      dispatchStarterPackCheckoutUpdated(response.purchase);
      refreshPurchases();
    } catch (e) {
      createAlert({
        type: 'GenericAlert',
        level: 'warning',
        data: { content: e?.response?.data?.error || e.message || 'Unable to submit starter crew.' },
        duration: 10000
      });
    } finally {
      setSubmitting(false);
    }
  }, [copyGrantPayload, createAlert, dispatchStarterPackCheckoutUpdated, draft, isMockPurchase, purchase, refreshPurchases]);

  const onClearCompleted = useCallback(() => {
    if (purchase?.id) dispatchStarterPackCustomizationDraftCleared(purchase.id);
    dispatchStarterPackCheckoutCleared();
    setDevPurchase(null);
    setCheckoutSessionId(null);
    setCheckoutClientSecret(undefined);
    setCheckoutOpen(false);
    setAwaitingPaymentConfirmation(false);
    setCustomizationOpen(false);
    setSelectedProductId(undefined);
    refreshPurchases();
  }, [
    dispatchStarterPackCheckoutCleared,
    dispatchStarterPackCustomizationDraftCleared,
    purchase?.id,
    refreshPurchases
  ]);

  const onResetDevState = useCallback(() => {
    setDevPurchase(null);
    setCheckoutSessionId(null);
    setCheckoutClientSecret(undefined);
    setCheckoutOpen(false);
    setAwaitingPaymentConfirmation(false);
    setCustomizationOpen(false);
    setSelectedProductId(undefined);
    dispatchStarterPackStateReset();
    refreshPurchases();
  }, [dispatchStarterPackStateReset, refreshPurchases]);

  const onMockPurchase = useCallback((product) => {
    const mockPurchase = createDevStarterPackPurchase(product, accountAddress || '0xdev');
    setCheckoutSessionId(null);
    setCheckoutClientSecret(undefined);
    setCheckoutOpen(false);
    setAwaitingPaymentConfirmation(false);
    setDevPurchase(mockPurchase);
    setCustomizationOpen(true);
    setSelectedProductId(undefined);
    dispatchStarterPackCheckoutCleared();
    dispatchStarterPackCustomizationDraftInitialized(mockPurchase);
  }, [
    accountAddress,
    dispatchStarterPackCheckoutCleared,
    dispatchStarterPackCustomizationDraftInitialized
  ]);

  const updateWholeDraft = useCallback((crewmates) => {
    if (!purchase?.id) return;
    dispatchStarterPackCustomizationDraftUpdated(purchase.id, {
      crewmates,
      updatedAt: Date.now()
    });
  }, [dispatchStarterPackCustomizationDraftUpdated, purchase?.id]);

  const onSeedDraft = useCallback((namePrefix) => {
    if (!purchase?.requiredCrewmates) return;
    updateWholeDraft(createSeededStarterPackCrewmates(purchase.requiredCrewmates, namePrefix));
  }, [purchase?.requiredCrewmates, updateWholeDraft]);

  const onRandomizeDraft = useCallback(() => {
    if (!draft?.crewmates?.length) return;
    updateWholeDraft(draft.crewmates.map((crewmate, index) => {
      const classId = crewmate.classId || Crewmate.CLASS_IDS.MINER;
      return {
        ...crewmate,
        name: crewmate.name || `Test Crewmate ${index + 1}`,
        selectedTraits: getRandomStarterPackTraits(classId),
        appearanceOptions: [getRandomAdalianAppearance()],
        appearanceSelection: 0
      };
    }));
  }, [draft?.crewmates, updateWholeDraft]);

  if (productsLoading) return <PageLoader message="Loading starter packs..." />;

  return (
    <StarterPackContent>
      <StarterPacksOuter $single={!!displayedProduct}>
        {visibleProducts.map((product, index) => (
          <ProductCard
            isRecommended={!displayedProduct && index === 1}
            key={product.productId}
            disabled={!!purchaseProduct || !product.enabled || isStarterPackCheckoutActive(purchase?.status)}
            expanded={!!displayedProduct}
            isPurchasing={checkoutProductId === product.productId}
            locked={!!purchaseProduct}
            onSelect={(selected) => setSelectedProductId(selected.productId)}
            product={product} />
        ))}
      </StarterPacksOuter>
      {products?.length === 0 && (
        <FlowPanel>
          <h3>No Starter Packs Available</h3>
          <p>Starter packs are not currently available for this environment.</p>
        </FlowPanel>
      )}
      {(selectedProduct || purchase) && (
        <StarterPackStatusSlot>
          {purchase
            ? (
              <PurchaseStatus
                accountDeploying={deployingAccount}
                awaitingPaymentConfirmation={awaitingPaymentConfirmation}
                canResumeCheckout={!!stripePromise && !!checkoutClientSecret}
                onClear={onClearCompleted}
                onCustomize={() => setCustomizationOpen(true)}
                onResumeCheckout={() => {
                  setAwaitingPaymentConfirmation(false);
                  setCheckoutOpen(true);
                }}
                product={purchaseProduct}
                purchase={purchase} />
            )
            : (
              <PackSelectionStatus
                confirming={checkoutProductId === selectedProduct.productId}
                acknowledged={checkoutAcknowledged}
                onAcknowledge={() => setCheckoutAcknowledged((current) => !current)}
                onCancel={() => {
                  setCheckoutAcknowledged(false);
                  setSelectedProductId(undefined);
                }}
                onConfirm={() => onCheckout(selectedProduct)}
                product={selectedProduct} />
            )}
        </StarterPackStatusSlot>
      )}
      {devToolsEnabled && (
        <StarterPackDevTools
          currentDraft={draft}
          currentPurchase={purchase}
          onCopyGrantPayload={copyGrantPayload}
          onForceCheckoutResume={(id) => {
            setDevPurchase(null);
            setCheckoutSessionId(id);
            setCheckoutClientSecret(undefined);
            setCheckoutOpen(false);
            setAwaitingPaymentConfirmation(false);
          }}
          onMockPurchase={onMockPurchase}
          onRandomizeDraft={onRandomizeDraft}
          onReset={onResetDevState}
          onSeedDraft={onSeedDraft}
          products={products} />
      )}
      {customizationOpen && purchase?.canCustomize && draft && customizationPortalTarget && createPortal(
        <Details
          edgeToEdge
          headerProps={{ background: 'true', v2: 'true' }}
          onClose={() => setCustomizationOpen(false)}
          contentInnerProps={{ style: { display: 'flex', flexDirection: 'column', height: '100%' } }}
          title="Create Starter Crew"
          wrapperProps={{ style: { zIndex: 10000 } }}
          width="1150px">
          <StarterPackCustomization
            draft={draft}
            isMockPurchase={isMockPurchase}
            onCrewmateChange={onCrewmateChange}
            onSubmit={onSubmitCustomization}
            purchase={purchase}
            submitting={submitting} />
        </Details>,
        customizationPortalTarget
      )}
      {checkoutOpen && checkoutClientSecret && stripePromise && (
        <StripeEmbeddedCheckout
          clientSecret={checkoutClientSecret}
          onClose={() => setCheckoutOpen(false)}
          onComplete={onCheckoutComplete} />
      )}
    </StarterPackContent>
  );
};

export default StarterPackSKU;
