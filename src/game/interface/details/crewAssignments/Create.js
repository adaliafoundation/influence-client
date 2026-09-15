import React, { Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import styled, { css, keyframes } from 'styled-components';
import { Crewmate, Entity, Name } from '@influenceth/sdk';
import { BiMinus as LockedIcon, BiRedo as RedoIcon, BiUndo as UndoIcon } from 'react-icons/bi';
import { VscTriangleLeft as LeftArrowIcon, VscTriangleRight as RightArrowIcon } from 'react-icons/vsc';
import LoadingAnimation from 'react-spinners/PuffLoader';
import { cloneDeep } from 'lodash';

import Collection1 from '~/assets/images/crew_collections/1.png';
import Collection2 from '~/assets/images/crew_collections/2.png';
import Collection3 from '~/assets/images/crew_collections/3.png';
import Collection4 from '~/assets/images/crew_collections/4.png';
import Button from '~/components/ButtonAlt';
import ConfirmationDialog from '~/components/ConfirmationDialog';
import CopyReferralLink from '~/components/CopyReferralLink';
import CrewmateCard from '~/components/CrewmateCard';
import CrewClassIcon from '~/components/CrewClassIcon';
import CrewTraitIcon from '~/components/CrewTraitIcon';
import Details from '~/components/DetailsModal';
import { CheckedIcon, CheckIcon, CloseIcon, LinkIcon, UncheckedIcon } from '~/components/Icons';
import { CheckboxButton } from '~/components/filters/components';
import IconButton from '~/components/IconButton';
import MouseoverInfoPane from '~/components/MouseoverInfoPane';
import TextInput from '~/components/TextInput';
import TriangleTip from '~/components/TriangleTip';
import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import FundingFlow from '~/game/launcher/store/FundingFlow';
import { getCrewmatePaymentMode } from '~/game/launcher/store/crewmatePayment';
import StripeEmbeddedCheckout, { stripePromise } from '~/game/launcher/store/components/StripeEmbeddedCheckout';
import useBookSession, { bookIds, getBookCompletionImage } from '~/hooks/useBookSession';
import useCrewManager from '~/hooks/actionManagers/useCrewManager';
import useCrewContext from '~/hooks/useCrewContext';
import useNameAvailability from '~/hooks/useNameAvailability';
import usePriceConstants from '~/hooks/usePriceConstants';
import usePriceHelper from '~/hooks/usePriceHelper';
import useSimulationEnabled from '~/hooks/useSimulationEnabled';
import useSession from '~/hooks/useSession';
import useStore from '~/hooks/useStore';
import { useUSDCBalance } from '~/hooks/useWalletTokenBalance';
import api from '~/lib/api';
import {
  CREWMATE_PURCHASE_STATUSES,
  buildCrewmatePurchaseGrantRequestFromCrewmate,
  buildCrewmatePurchaseReturnUrl,
  clearCrewmatePurchaseCheckoutSessionIdFromUrl,
  getCrewmatePurchaseCheckoutSessionIdFromUrl,
  isCrewmatePurchaseCheckoutActive,
  normalizeCrewmatePurchaseProducts
} from '~/lib/crewmatePurchases';
import { getRandomAdalianAppearance } from '~/lib/crewmateDesign';
import formatters from '~/lib/formatters';
import { getUsdcValue } from '~/lib/funding';
import { reactBool, safeBigInt } from '~/lib/utils';
import SIMULATION_CONFIG from '~/simulation/simulationConfig';
import theme from '~/theme';

const CollectionImages = {
  1: Collection1,
  2: Collection2,
  3: Collection3,
  4: Collection4,
};

const CloseButton = styled(IconButton)`
  position: absolute !important;
  top: 8px;
  right: 0px;
  z-index: 1;
  ${p => p.hasBackground ? 'background: rgba(0, 0, 0, 0.75);' : ''}

  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    right: 0;
  }
`;

const blinkingBackground = (p) => keyframes`
  0% {
    background-color: #000;
  }
  50% {
    background-color: rgba(${p.theme.colors.mainRGB}, 0.2);
  }
  100% {
    background-color: #000;
  }
`;

const slideOutTransition = keyframes`
  0% {
    color: transparent;
    transform: scaleX(0);
  }
  50% {
    color: transparent;
    transform: scaleX(1);
  }
  100% {
    transform: scaleX(1);
  }
`;

// TODO: (for mobile)
// const mobileSlideOutTransition = keyframes`
//   0% {
//     transform: scaleX(0);
//   }
//   50% {
//     transform: scaleX(1);
//   }
//   100% {
//     transform: scaleX(1);
//   }
// `;

const opacityTransition = keyframes`
  0% { opacity: 0; }
  75% { opacity: 0; }
  100% { opacity: 1; }
`;

const pulsingTransition = keyframes`
  0% { opacity: 0.75; }
  50% { opacity: 0.25; }
  100% { opacity: 0.75; }
`;

const TitleBox = styled.div`
  background: rgba(0, 0, 0, 0.8);
  margin: 25px 0;
  padding: 12px 0;
  position: relative;
  z-index: 1;
`;
const Title = styled.div`
  border: solid #444;
  border-width: 1px 0;
  color: white;
  display: flex;
  font-size: 32px;
  font-weight: light;
  line-height: 40px;
  justify-content: center;
  margin: 0 auto;
  overflow: visible;
  padding: 24px 0;
  text-transform: uppercase;
  text-align: center;
  white-space: nowrap;
  width: calc(100% - 180px);

  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    white-space: normal;
  }
`;

const ImageryContainer = styled.div`
  display: flex;
  flex: 0 1 calc(100% - 80px);
  overflow: auto;
  padding: 60px 0 0;
  position: relative;

  & > div:first-child {
    background-image: url(${p => p.src});
    background-repeat: no-repeat;
    background-position: center center;
    background-size: cover;
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 1;
    opacity: 0.5;
    mask-image: linear-gradient(to bottom, transparent 0%, black 10%, rgba(0,0,0,0.7) 50%, transparent 100%);
    transition: opacity 750ms ease-out, background-image 750ms ease-out;
  }

  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    padding-top: 15px;
  }
`;

const borderColor = '#333';
const cardWidth = 320;
const centerWidth = 375;
const traitHeight = 100;
const traitHeight_big = 112;
const traitTriangleWidth = 30;
const traitBackground = 'rgba(25,25,25,0.95)';
const traitBorder = '#444';

const MainContent = styled.div`
  height: 100%;
  position: relative;
  width: 100%;
`;

const CenterColumn = styled.div`
  background: black;
  border: solid ${borderColor};
  border-width: 0 1px;
  display: flex;
  flex-direction: column;
  height: 100%;
  margin: 0 auto;
  padding: 15px 0 30px;
  position: relative;
  width: ${centerWidth}px;
  z-index: 200;
`;

const CardWrapper = styled.div`
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  padding: 10px 15px 15px;
  justify-content: center;
  width: 100%;
  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    padding: 20px 0;
  }
`;

const CardContainer = styled.div`
  background: black;
  z-index: 3;
  & > div {
    border: 1px solid ${borderColor};
    padding: 10px;
    width: ${cardWidth}px;
    @media (min-width: 1024px) {
      max-width: 22vw;
    }
  }
`;

const Traits = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;

  z-index: 2;

  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    display: none;
  }
`;

const TipIcon = styled.div`
  position: absolute;
  ${p => p.side}: -16px;
  margin-top: 8px;
  & > * { display: none; }
`;
const ClickableIcon = styled.div``;
const AtRiskIcon = styled.div`color: ${p => p.theme.colors.error};`;
const UnclickableIcon = styled.div`color: #777;`;
const TipHolder = styled.div`
  position: absolute;
  top: 0;
  & > svg {
    height: ${traitTriangleWidth}px;
    width: ${traitHeight - 1}px;
    & > polygon {
      fill: ${traitBackground};

      transition: 250ms ease-out;
      transition-property: fill;
    }
    & > path {
      stroke: ${traitBorder};

      transition: 250ms ease-out;
      transition-property: stroke;
    }
  }
`;

const attentionBackground = keyframes`
  0% { background-color: #005678; }
  50% { background-color: #14262d; }
  100% { background-color: #005678; }
`;
const attentionFill = keyframes`
  0% { fill: #005678; }
  50% { fill: #14262d; }
  100% { fill: #005678; }
`;

const Trait = styled.div`
  position: relative;
  border: solid ${traitBorder};
  border-width: 1px 0;
  flex: 1;
  display: flex;
  flex-direction: row;
  align-items: center;

  transition: 250ms ease-out;
  transition-property: background, border-color;

  & > *:first-child {
    ${p => p.side === 'right' && 'margin-left: 20px;'}
    font-size: 65px;
    line-height: 65px;
    position: relative;
    text-align: center;
    width: 75px;
    z-index: 3;
  }
  & > article {
    flex: 1;
    max-height: 100%;
    overflow: hidden;
    padding-bottom: 10px;
    padding-left: 10px;
    padding-top: 10px;
    ${p => p.side === 'left' && 'padding-right: 15px;'}
    & > h4 {
      font-size: 17px;
      margin: 0 0 4px;
    }
    & > div {
      color: ${p => p.type === 'impactful' ? p.theme.colors.main : '#888'};
    }
  }

  & ${TipHolder} {
    ${p => p.side}: 0;
    & > svg {
      transform-origin: top ${p => p.side};
    }
  }

  @media (max-width: 1500px) {
    & > *:first-child {
      width: 72px;
    }
    & > article {
      font-size: 90%;
    }
  }
  @media (min-width: 1024px) and (max-width: 1400px) {
    & > *:first-child {
      display: none;
    }
    & > article {
      padding-left: 20px;
    }
  }

  ${p => {
    if (p.isAtRisk && !p.isEmpty) {
      return `
        background: #4b1e1a;
        border-color: #444;
        & > article > h4 {
          color: ${p.theme.colors.error};
        }
        & ${TipHolder} {
          & > svg {
            & > polygon {
              fill: #4b1e1a;
            }
            & > path {
              stroke: #444;
            }
          }
          ${TipIcon} > ${AtRiskIcon} { display: block; }
        }
      `;
    } else if (p.isClickable && !p.isAtRisk) {
      const clickable = css`
        border-color: rgba(${p.theme.colors.mainRGB}, 0.5);
        cursor: ${p.theme.cursors.active};
        & ${TipHolder} {
          & > svg > path {
            stroke: rgba(${p.theme.colors.mainRGB}, 0.5);
          }
          ${TipIcon} > ${ClickableIcon} { display: block; }
        }
      `;
      const clickableHover = css`
        background: #005678;
        & ${TipHolder} > svg > polygon {
          fill: #005678;
        }
      `;
      if (p.isEmpty && !p.isToggling) {
        return css`
          ${clickable}
          animation: ${attentionBackground} 2000ms ease infinite;
          background: #005678;
          & > article > h4 {
            color: ${p.theme.colors.main} !important;
            font-size: 17px !important;
            margin: 0;
            padding: 0;
            text-transform: none;
          }
          & > article > div { display: none; }
          & ${TipHolder} > svg {
            & > polygon {
              animation: ${attentionFill} 2000ms ease infinite;
              fill: #005678;
            }
          }

          &:hover {
            ${clickableHover}
            animation: none;
            & ${TipHolder} > svg > polygon { animation: none; }
          }
        `;
      }
      return css`
        ${clickable}
        &:hover {
          ${clickableHover}
        }
        ${p => p.isToggling && `
          &:not(:hover) {
            background: #003447;
            & ${TipHolder} > svg > polygon {
              fill: #003447;
            }
          }
        `}
      `;
    }
    return `
      & ${TipHolder} ${TipIcon} > ${UnclickableIcon} { display: block; }
    `;
  }}
`;

const TraitSpacer = styled.div`
  border: solid ${traitBorder};
  border-width: 1px 0;
  max-width: 22vw;
  width: ${centerWidth}px; // (should match card width)
`;

const TraitRow = styled.div`
  background: ${traitBackground};
  display: flex;
  flex-direction: row;
  height: ${traitHeight}px;
  margin-bottom: 8px;
  overflow: visible;
  transform: scaleX(0);
  width: calc(85% - ${traitTriangleWidth * 2}px);

  &:nth-child(1) {
    animation: ${slideOutTransition} 1000ms normal forwards ease-out 500ms;
  }
  &:nth-child(2) {
    animation: ${slideOutTransition} 1000ms normal forwards ease-out 650ms;
  }
  &:nth-child(3) {
    animation: ${slideOutTransition} 1000ms normal forwards ease-out 800ms;
  }
  &:nth-child(4) {
    animation: ${slideOutTransition} 1000ms normal forwards ease-out 950ms;
  }
  &:nth-child(5) {
    animation: ${slideOutTransition} 1000ms normal forwards ease-out 1100ms;
  }

  ${p => p.big && `
    height: ${traitHeight_big}px;
    width: calc(97% - ${traitTriangleWidth * 2}px);
    ${TipHolder} {
      & > svg {
        width: ${traitHeight_big - 1}px;
      }
      ${TipIcon} {
        margin-top: 14px;
      }
    }
    margin-bottom: 60px;

    ${Trait} > article {
      text-transform: uppercase;
      & > h4 {
        color: #777;
        font-size: 15px;
      }
      & > div {
        color: white;
        font-size: 17px;
        font-weight: bold;
        opacity: 1;
      }
    }
  `}
`;

const NameSection = styled.div`
  align-items: center;
  animation: ${opacityTransition} 1000ms normal forwards ease-out 650ms;
  flex: 1;
  opacity: 0;
  display: flex;
  margin-top: 5px;
  flex-direction: column;
  & > input {
    &:not(:disabled) {
      animation: ${blinkingBackground} 750ms linear 2000ms 2;
    }
    background: #000;
    border: 1px solid rgba(${p => p.theme.colors.mainRGB}, 0.8);
    font-size: 20px;
    height: 40px;
    text-align: center;
    width: 275px;
  }
  & > label {
    color: ${p => p.theme.colors.main};
    display: block;
    font-size: 15px;
    font-weight: bold;
    margin-bottom: 8px;
    text-transform: uppercase;
  }
`;

const NameMessage = styled.div`
  align-items: center;
  display: flex;
  flex-direction: row;
  font-size: 15px;
  height: 32px;
  & > span {
    margin-left: 8px;
  }
`;
const NameError = styled(NameMessage)`
  color: ${p => p.theme.colors.error};
`;
const NameLoading = styled(NameMessage)`
  animation: ${pulsingTransition} 1000ms ease infinite;
  color: ${p => p.theme.colors.lightPurple};
`;
const NameSuccess = styled(NameMessage)`
  color: ${p => p.theme.colors.success};
`;

const NameMessageSlot = styled.div`
  flex: 0 0 32px;
  height: 32px;
`;

const NameValidationMessage = ({ checkingName, nameError }) => (
  <NameMessageSlot>
    {checkingName && <NameLoading>Checking availability...</NameLoading>}
    {!checkingName && nameError && <NameError><CloseIcon /> <span>{nameError}</span></NameError>}
    {!checkingName && nameError === null && <NameSuccess><CheckIcon /> <span>Name is available</span></NameSuccess>}
  </NameMessageSlot>
);

const RandomizeControls = styled(IconButton)`
  margin-right: 0;
  border: 0;
`;

const RandomizeButton = styled(Button)`
  margin: 0 8px;
`;

const RerollContainer = styled.div`
  align-items: center;
  display: flex;
  flex-direction: row;
  margin-top: 10px;
`;

const PromptBody = styled.div`
  border: solid #333;
  border-width: 1px 0;
  color: ${p => p.highlight ? p.theme.colors.main : '#AAA'};
  line-height: 20px;
  padding: 16px 24px;
  & b {
    color: white;
    font-weight: normal;
  }
  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    padding: 12px;
  }

  & h4 {
    color: ${p => p.theme.colors.success};
    font-weight: normal;
    margin-bottom: 0;
    text-align: right;
  }
`;

const PurchaseAcknowledgement = styled.div`
  align-items: flex-start;
  color: #ddd;
  cursor: ${p => p.theme.cursors.active};
  display: flex;
  font-size: 12px;
  gap: 10px;
  line-height: 1.35;
  margin-top: 18px;

  & ${CheckboxButton} {
    color: ${p => p.$checked ? p.theme.colors.main : '#aaa'};
    flex: 0 0 auto;
    margin-right: 0;
    opacity: ${p => p.$checked ? 1 : 0.65};
  }
`;
const Rule = styled.div`
  height: 0;
  border-bottom: 1px solid #333;
`;

const Footer = styled.div`
  background: black;
  padding: 0 35px;
  height: 80px;
`;

const RecruitTally = styled.div`
  color: ${p => p.theme.colors.main};
  margin-right: 16px;
  & b {
    color: white;
    font-weight: normal;
  }
`;

const CollectionImage = styled.div`
  align-items: center;
  display: flex;
  height: 1em;
  justify-content: center;
  overflow: visible;
  width: 1em;
  &:before {
    content: "";
    display: block;
    background-image: url(${p => CollectionImages[p.coll]});
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center center;
    position: absolute;
    height: ${p => p.coll === 4 ? '175%' : '130%'};
    width: ${p => p.coll === 4 ? '175%' : '130%'};
  }
`;

const MouseoverContent = styled.div`
  padding: 15px;
`;
const MouseoverTitle = styled.div`
  border-bottom: 1px solid #333;
  color: white;
  font-size: 18px;
  margin: 0 0 8px;
  padding: 0 0 8px;
`;
const MouseoverSubtitle = styled.div`
  color: white;
  font-size: 14px;
  margin: 15px 0 5px;
  text-transform: uppercase;
`;
const MouseoverHighlightTitle = styled(MouseoverTitle)`
  color: ${p => p.theme.colors.main};
  font-size: 15px;
  font-weight: bold;
  text-transform: uppercase;
`;
const MouseoverDescription = styled.div`
  color: #999;
  font-size: 85%;
`;

const TraitSelectionArea = styled.div`
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
`;

const SelectableTrait = styled.div`
  align-items: center;
  border: 1px solid transparent;
  color: white;
  cursor: ${p => p.theme.cursors.active};
  display: flex;
  justify-content: center;
  font-size: 54px;
  height: 58px;
  margin: 1px;
  width: 58px;
  ${p => p.isSelected && `
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.1);
  `}

  &:hover {
    background: rgba(${p => p.theme.colors.mainRGB}, 0.3);
    border-color: rgba(${p => p.theme.colors.mainRGB}, 0.2);
  }
`;

const ClassSelectionArea = styled(TraitSelectionArea)``;
const SelectableClass = styled(SelectableTrait)`
  font-size: 48px;
`;

const mouseoverPaneProps = (visible, isEditor, zIndex) => ({
  css: css`
    padding: 0;
    pointer-events: ${visible ? 'auto' : 'none'};
    width: 400px;
    ${isEditor ? `border-color: rgba(${theme.colors.mainRGB}, 0.5);` : ''}
  `,
  placement: 'top',
  visible,
  zIndex
});

const onCloseDestination = `/crew`;

const crewmatePurchaseCheckoutPollMs = 5000;
const noop = () => {};

const PopperWrapper = (props) => {
  const [refEl, setRefEl] = useState();
  return props.children(refEl, setRefEl);
}

const MouseoverInfoContent = ({ title, description }) => (
  <MouseoverContent>
    <MouseoverTitle>{title}</MouseoverTitle>
    <MouseoverDescription>{description}</MouseoverDescription>
  </MouseoverContent>
);

const ClassSelector = ({ classObjects, crewmate, onUpdateClass, onClose }) => {
  const [hovered, setHovered] = useState();

  const classDisplay = useMemo(() => classObjects[hovered || crewmate?.Crewmate?.class], [hovered, crewmate?.Crewmate?.class])

  return (
    <MouseoverContent>
      <MouseoverHighlightTitle>
        Select Class
        <CloseButton onClick={onClose} hasBackground={false} borderless><CloseIcon /></CloseButton>
      </MouseoverHighlightTitle>
      <ClassSelectionArea>
        {Object.values(Crewmate.CLASS_IDS).map((classId) => (
          <SelectableClass
            key={classId}
            isSelected={crewmate?.Crewmate?.class === classId}
            onClick={() => onUpdateClass(classId)}
            onMouseEnter={() => setHovered(classId)}
            onMouseLeave={() => setHovered()}>
            <CrewClassIcon crewClass={classId} />
          </SelectableClass>
        ))}
      </ClassSelectionArea>

      <div style={{ height: 180, marginTop: 15, overflow: 'hidden' }}>
        <MouseoverTitle>{classDisplay?.name || '‎'}</MouseoverTitle>
        <MouseoverDescription>{classDisplay?.description || '(Select a class above)'}</MouseoverDescription>

        {classDisplay && (
          <>
            <MouseoverSubtitle>{classDisplay?.name} Bonuses</MouseoverSubtitle>
            <MouseoverDescription>{classDisplay?.abilities}</MouseoverDescription>
          </>
        )}
      </div>
    </MouseoverContent>
  );
};

const TraitSelector = ({ crewmate, currentTraits, onUpdateTraits, onClose, traitIndex }) => {
  const changeTrait = currentTraits[traitIndex];
  const priorTraits = currentTraits.slice(0, traitIndex).map((t) => t.id);
  const options = useMemo(() => {
    return Crewmate.nextTraits(
      crewmate.Crewmate.coll,
      crewmate.Crewmate.class,
      priorTraits
    ).sort((a, b) => Crewmate.TRAITS[a].name < Crewmate.TRAITS[b].name ? -1 : 1);
  }, [priorTraits]);

  const [hovered, setHovered] = useState();

  const onSelect = useCallback((newTrait) => {
    onUpdateTraits(changeTrait?.id === newTrait ? currentTraits.map((t) => t.id) : [...priorTraits, newTrait]);
  }, [changeTrait, priorTraits]);

  const traitDisplay = useMemo(() => Crewmate.TRAITS[hovered || changeTrait?.id], [hovered, changeTrait])

  return (
    <MouseoverContent>
      <MouseoverHighlightTitle>
        Available Traits
        <CloseButton onClick={onClose} hasBackground={false} borderless><CloseIcon /></CloseButton>
      </MouseoverHighlightTitle>
      <TraitSelectionArea>
        {options.map((t) => (
          <SelectableTrait
            key={t}
            isSelected={changeTrait?.id === t}
            onClick={() => onSelect(t)}
            onMouseEnter={() => setHovered(t)}
            onMouseLeave={() => setHovered()}>
            <CrewTraitIcon trait={t} />
          </SelectableTrait>
        ))}
      </TraitSelectionArea>

      <div style={{ height: 105, marginTop: 15, overflow: 'hidden' }}>
        <MouseoverTitle>{traitDisplay?.name || '‎'}</MouseoverTitle>
        <MouseoverDescription>{traitDisplay?.description || '(Select a trait above)'}</MouseoverDescription>
      </div>
    </MouseoverContent>
  );
};

export const CrewmateDesigner = ({
  appearanceOptionsLength = 1,
  appearanceSelection = 0,
  checkingName,
  coverImage,
  crewmate,
  disableChanges,
  finalizing,
  footer,
  name,
  nameError,
  nameInputKey,
  namePrepopped,
  onNameChange,
  onRerollAppearance,
  onRerollTraits,
  onRollBackAppearance,
  onRollForwardAppearance,
  onUnlockTraits,
  onUpdateClass,
  onUpdateTraits,
  pendingCrewmate,
  popoverZIndex,
  promptingTransaction,
  selectedTraits,
  traitTally,
  traitsLocked
}) => {
  const hasCrewmate = !!crewmate;
  const [animationComplete, setAnimationComplete] = useState();
  const [hovered, setHovered] = useState();
  const [toggling, setToggling] = useState();

  useEffect(() => {
    if (hasCrewmate) {
      const to = setTimeout(() => {
        setAnimationComplete(true);
      }, 2500);
      return () => {
        if (to) clearTimeout(to);
      }
    }
  }, [hasCrewmate]);

  const traitObjects = useMemo(() => {
    return (selectedTraits || []).map((id) => ({ id, ...Crewmate.TRAITS[id] }));
  }, [selectedTraits]);

  const classObjects = useMemo(() => {
    return Object.values(Crewmate.CLASS_IDS).reduce((acc, id) => ({
      ...acc,
      [id]: {
        id,
        abilities: Object.values(Crewmate.ABILITY_TYPES)
          .filter((a) => a.class === id)
          .map((a) => <div key={a.name}>- {a.name}</div>),
        ...Crewmate.getClass(id),
      }
    }), {});
  }, []);

  const handleUpdateClass = useCallback((newClass) => {
    onUpdateClass(newClass);
    setToggling();
  }, [onUpdateClass]);

  const handleUpdateTraits = useCallback((newTraits) => {
    onUpdateTraits(newTraits);
    setToggling();
  }, [onUpdateTraits]);

  if (!crewmate) return null;

  return (
    <>
      <ImageryContainer src={coverImage}>
        <div />
        <MainContent>
          <CenterColumn>
            <CardWrapper>
              <CardContainer>
                <div>
                  <CrewmateCard
                    crewmate={crewmate}
                    fontSize="25px"
                    hideFooter
                    hideIfNoName
                    hideMask
                    noWrapName
                    useExplicitAppearance={reactBool(crewmate?.Crewmate?.coll === Crewmate.COLLECTION_IDS.ADALIAN)} />
                </div>
              </CardContainer>
            </CardWrapper>

            {!pendingCrewmate && (
              <NameSection>
                {crewmate._canRename && (
                  <>
                    <label>Name</label>
                    <TextInput
                      autoFocus
                      disabled={promptingTransaction || finalizing}
                      initialValue={name}
                      key={nameInputKey}
                      minlength={Name.TYPES[Entity.IDS.CREWMATE].min}
                      maxlength={Name.TYPES[Entity.IDS.CREWMATE].max}
                      pattern={Name.getTypeRegex(Entity.IDS.CREWMATE)}
                      onChange={onNameChange}
                      resetOnChange={namePrepopped}
                      placeholder="Crewmate Name" />

                    <NameValidationMessage checkingName={checkingName} nameError={nameError} />
                  </>
                )}

                <div style={{ flex: 1 }} />

                {crewmate._canRerollAppearance && (
                  <RerollContainer>
                    <RandomizeControls
                      onClick={onRollBackAppearance}
                      disabled={promptingTransaction || finalizing || appearanceSelection === 0}
                      style={{ opacity: appearanceOptionsLength > 1 ? 1 : 0 }}>
                      <UndoIcon />
                    </RandomizeControls>

                    <RandomizeButton
                      disabled={promptingTransaction || finalizing}
                      lessTransparent
                      onClick={onRerollAppearance}
                      style={{ width: 275 }}>
                      Randomize Appearance
                    </RandomizeButton>

                    <RandomizeControls
                      onClick={onRollForwardAppearance}
                      disabled={promptingTransaction || finalizing || appearanceSelection === appearanceOptionsLength - 1}
                      style={{ opacity: appearanceOptionsLength > 1 ? 1 : 0 }}>
                      <RedoIcon />
                    </RandomizeControls>
                  </RerollContainer>
                )}

                <RerollContainer>
                  {traitsLocked
                    ? (
                      <RandomizeButton
                        disabled={promptingTransaction || finalizing}
                        lessTransparent
                        onClick={onUnlockTraits}
                        style={{ width: 275 }}>
                        Unlock Traits
                      </RandomizeButton>
                    )
                    : (
                      <RandomizeButton
                        disabled={promptingTransaction || finalizing}
                        lessTransparent
                        onClick={onRerollTraits}
                        style={{ width: 275 }}>
                        Randomize Traits
                      </RandomizeButton>
                    )
                  }
                </RerollContainer>
              </NameSection>
            )}
          </CenterColumn>

          <Traits>
            <TraitRow big>
              <Trait side="left">
                <div>
                  <CollectionImage coll={crewmate.Crewmate.coll} />
                </div>
                <article>
                  <h4>Collection</h4>
                  <div>{Crewmate.getCollection(crewmate.Crewmate.coll)?.name}</div>
                  <div style={{color: theme.colors.secondaryText}}>{Crewmate.getTitle(crewmate.Crewmate.title)?.name}</div>
                </article>
                <TipHolder>
                  <TriangleTip strokeWidth="1" rotate="90" />
                  <TipIcon side="left">
                    <UnclickableIcon><LockedIcon /></UnclickableIcon>
                  </TipIcon>
                </TipHolder>
              </Trait>

              <TraitSpacer />

              <PopperWrapper>
                {(refEl, setRefEl) => (
                  <>
                    <Trait
                      ref={animationComplete ? setRefEl : noop}
                      onClick={(disableChanges || !crewmate._canReclass) ? noop : () => setToggling('class')}
                      onMouseEnter={animationComplete ? () => setHovered('class') : noop}
                      onMouseLeave={() => setHovered()}
                      side="right"
                      isClickable={!disableChanges && crewmate._canReclass}
                      isToggling={toggling === 'class'}
                      isEmpty={!crewmate.Crewmate.class}>
                      <div>
                        <CrewClassIcon crewClass={crewmate.Crewmate.class} />
                      </div>
                      <article>
                        <h4>{crewmate.Crewmate.class ? 'Class' : 'Select Class'}</h4>
                        <div>{classObjects[crewmate.Crewmate.class]?.name}</div>
                      </article>
                      <TipHolder>
                        <TriangleTip strokeWidth="1" rotate="-90" />
                        <TipIcon side="right">
                          <ClickableIcon><RightArrowIcon /></ClickableIcon>
                          <UnclickableIcon><LockedIcon /></UnclickableIcon>
                        </TipIcon>
                      </TipHolder>
                    </Trait>

                    <MouseoverInfoPane referenceEl={refEl} {...mouseoverPaneProps(hovered === 'class' && crewmate.Crewmate.class && !toggling, false, popoverZIndex)}>
                      <MouseoverInfoContent
                        title={classObjects[crewmate.Crewmate.class]?.name}
                        description={(
                          <>
                            {classObjects[crewmate.Crewmate.class]?.description}

                            <MouseoverSubtitle>{classObjects[crewmate.Crewmate.class]?.name} Bonuses</MouseoverSubtitle>
                            {classObjects[crewmate.Crewmate.class]?.abilities}
                          </>
                        )}
                      />
                    </MouseoverInfoPane>

                    <MouseoverInfoPane
                      referenceEl={refEl}
                      {...mouseoverPaneProps(toggling === 'class', true, popoverZIndex)}>
                      <ClassSelector
                        onClose={setToggling}
                        classObjects={classObjects}
                        crewmate={crewmate}
                        onUpdateClass={handleUpdateClass} />
                    </MouseoverInfoPane>
                  </>
                )}
              </PopperWrapper>
            </TraitRow>

            {Array.from(Array(Math.ceil(traitTally / 2))).map((_, i) => {
              return (
                <TraitRow key={i}>
                  {Array.from(Array(2)).map((_, j) => {
                    const traitIndex = 2 * i + j;
                    const hoverKey = traitIndex;
                    const trait = traitObjects[traitIndex];
                    const side = j === 0 ? 'left' : 'right';
                    return (
                      <Fragment key={j}>
                        <PopperWrapper>
                          {(refEl, setRefEl) => (
                            <>
                              <Trait
                                ref={animationComplete ? setRefEl : noop}
                                onClick={(disableChanges || !crewmate.Crewmate.class || traitIndex > selectedTraits?.length) ? noop : () => setToggling(hoverKey)}
                                onMouseEnter={animationComplete ? () => setHovered(hoverKey) : noop}
                                onMouseLeave={() => setHovered()}
                                side={side}
                                type={trait?.type}
                                isClickable={!disableChanges && crewmate.Crewmate.class && traitIndex <= selectedTraits?.length}
                                isEmpty={!trait}
                                isToggling={toggling === hoverKey}
                                isAtRisk={toggling === 'class' || toggling < traitIndex}>
                                <div>
                                  <CrewTraitIcon trait={trait?.id} type={trait?.type} hideFallback opaque />
                                </div>
                                <article>
                                  <h4>{trait?.name}</h4>
                                  {!trait?.name && crewmate.Crewmate.class && traitIndex === selectedTraits?.length && <h4>Select Trait</h4>}
                                  <div>{trait?.type && (trait?.type === 'impactful' ? 'Impactful' : 'Cosmetic')}</div>
                                </article>
                                <TipHolder>
                                  <TriangleTip strokeWidth="1" rotate={side === 'left' ? 90 : -90} />
                                  <TipIcon side={side}>
                                    <ClickableIcon>{side === 'left' ? <LeftArrowIcon /> : <RightArrowIcon />}</ClickableIcon>
                                    <UnclickableIcon><LockedIcon /></UnclickableIcon>
                                    <AtRiskIcon><CloseIcon /></AtRiskIcon>
                                  </TipIcon>
                                </TipHolder>
                              </Trait>

                              <MouseoverInfoPane referenceEl={refEl} {...mouseoverPaneProps(hovered === hoverKey && trait && !toggling, false, popoverZIndex)}>
                                <MouseoverInfoContent title={trait?.name} description={formatters.crewmateTraitDescription(trait?.description)} />
                              </MouseoverInfoPane>

                              <MouseoverInfoPane
                                referenceEl={refEl}
                                {...mouseoverPaneProps(toggling === hoverKey, true, popoverZIndex)}>
                                <TraitSelector
                                  onClose={setToggling}
                                  crewmate={crewmate}
                                  currentTraits={traitObjects}
                                  traitIndex={traitIndex}
                                  onUpdateTraits={handleUpdateTraits} />
                              </MouseoverInfoPane>
                            </>
                          )}
                        </PopperWrapper>
                        {side === 'left' && <TraitSpacer />}
                      </Fragment>
                    );
                  })}
                </TraitRow>
              );
            })}
          </Traits>
        </MainContent>
      </ImageryContainer>
      {footer}
    </>
  );
};

const CrewAssignmentCreate = ({ backLocation, bookSession, coverImage, crewId, crewmateId, locationId, pendingCrewmate }) => {
  const history = useHistory();
  const queryClient = useQueryClient();
  const { accountAddress, authenticated, login } = useSession();

  const simulationEnabled = useSimulationEnabled();
  const dispatchSimulationState = useStore((s) => s.dispatchSimulationState);
  const dispatchCrewAssignmentRestart = useStore((s) => s.dispatchCrewAssignmentRestart);
  const createAlert = useStore((s) => s.dispatchAlertLogged);

  const isNameValid = useNameAvailability({ id: crewmateId, label: Entity.IDS.CREWMATE });
  const { purchaseAndOrInitializeCrewmate } = useCrewManager();
  const { crew, crewmateMap, adalianRecruits, arvadianRecruits } = useCrewContext();
  const { promptingTransaction } = useContext(ChainTransactionContext);
  const { data: priceConstants } = usePriceConstants();
  const priceHelper = usePriceHelper();
  const { data: usdcBalance = 0n } = useUSDCBalance();

  const [confirming, setConfirming] = useState();
  const [confirmingUnlock, setConfirmingUnlock] = useState();
  const [isFunding, setIsFunding] = useState();
  const [hovered, setHovered] = useState();
  const [purchaseAcknowledged, setPurchaseAcknowledged] = useState(false);
  const [returnedStripeCheckoutSessionId] = useState(getCrewmatePurchaseCheckoutSessionIdFromUrl);
  const [stripeCheckoutSessionId, setStripeCheckoutSessionId] = useState(returnedStripeCheckoutSessionId);
  const [stripeClientSecret, setStripeClientSecret] = useState();
  const [stripeCheckoutOpen, setStripeCheckoutOpen] = useState(false);
  const [stripeSubmitting, setStripeSubmitting] = useState(false);
  const [awaitingStripePayment, setAwaitingStripePayment] = useState(false);
  const submittedStripePurchaseRef = useRef();

  const [appearanceOptions, setAppearanceOptions] = useState([]);
  const [appearanceSelection, setAppearanceSelection] = useState();

  const [toggling, setToggling] = useState();

  // TODO: should these be defaulted at all? should the default also include crewmate? pendingCrewmate?
  const [selectedClass, setSelectedClass] = useState(
    pendingCrewmate?.Crewmate?.class
    || bookSession?.crewmate?.Crewmate?.class
    || bookSession?.selectedClass
  );
  const [selectedTraits, setSelectedTraits] = useState(bookSession?.selectedTraits || []);
  const [traitsLocked, setTraitsLocked] = useState(!!bookSession?.isComplete);

  const [finalizing, setFinalizing] = useState();
  const [name, setName] = useState('');

  const mappedCrewmate = useMemo(() => crewmateMap?.[crewmateId] || null, [crewmateMap, crewmateId]);

  const finalized = useMemo(() => mappedCrewmate?.Crewmate?.status > 0, [mappedCrewmate]);

  useEffect(() => {
    if (!bookSession && !pendingCrewmate && !mappedCrewmate) {
      history.push(onCloseDestination);
    }
  }, [bookSession, pendingCrewmate, mappedCrewmate]);

  // derive crewmate-structured crewmate based on selections
  const crewmate = useMemo(() => {
    // if already finalized, return final version
    if (finalized) return mappedCrewmate;

    // if already pending, format from pending tx
    if (pendingCrewmate) {
      const { name, hair_color, caller_crew, crewmate, ...crewmateVars } = pendingCrewmate.vars;
      crewmateVars.coll = pendingCrewmate.key === 'RecruitAdalian'
        ? Crewmate.COLLECTION_IDS.ADALIAN
        : arvadianRecruits.find((r) => r.id === crewmateVars.id)?.Crewmate?.coll;
      crewmateVars.hairColor = hair_color;
      crewmateVars.appearance = Crewmate.packAppearance(crewmateVars);
      return {
        ...crewmate, // (id, label)
        Control: {
          controller: {
            id: caller_crew,
            label: Entity.IDS.CREW,
          }
        },
        Crewmate: {
          ...crewmateVars
        },
        Name: { name },
        _finalizing: true
      };
    }

    // if get here, there must be a bookSession...
    if (!bookSession) return null;

    // default from bookSession crewmate (arvadian) or from empty adalian
    const c = cloneDeep(bookSession.crewmate) || {
      id: 0,
      label: Entity.IDS.CREWMATE,
      Crewmate: {
        coll: Crewmate.COLLECTION_IDS.ADALIAN
      }
    };

    if (c.id === 0 && adalianRecruits?.length > 0) {
      console.warn('OVERRIDING ID -- should only happen if starter pack was purchased in creation flow');
      c.id = adalianRecruits?.[0]?.id || 0;
    }

    // force control to the specified crew
    // TODO: should we validate this?
    c.Control = {
      controller: {
        id: crewId,
        label: Entity.IDS.CREW,
      }
    }

    // initialize things if not set
    if (!c.Crewmate.coll) {
      console.warn('OVERRIDING COLL -- This should not happen');
      c.Crewmate.coll = bookSession.bookId === bookIds.ADALIAN_RECRUITMENT ? Crewmate.COLLECTION_IDS.ADALIAN : Crewmate.COLLECTION_IDS.ARVAD_CITIZEN;
    }
    if (!c.Crewmate.class) {
      c.Crewmate.class = selectedClass;
      c._canReclass = true;
    }

    // Allow renaming if not yet set, otherwise set to the name set on L1
    if (!c.Name?.name) {
      c.Name = { name };
      c._canRename = true;
    } else {
      setName(c.Name.name);
    }

    // split traits selected
    if (selectedTraits) {
      c.Crewmate.cosmetic = selectedTraits.filter((t) => Crewmate.TRAITS[t]?.type === Crewmate.TRAIT_TYPES.COSMETIC);
      c.Crewmate.impactful = selectedTraits.filter((t) => Crewmate.TRAITS[t]?.type === Crewmate.TRAIT_TYPES.IMPACTFUL);
    }

    // get appearance
    if (safeBigInt(c.Crewmate.appearance || 0n) === 0n) {
      if (appearanceOptions.length) {
        const { clothesOffset, ...appearance } = appearanceOptions[appearanceSelection];
        c.Crewmate.appearance = Crewmate.packAppearance({
          ...appearance,
          clothes: c.Crewmate.class ? (c.Crewmate.class - 1) * 2 + clothesOffset : 18
        });
      }
      c._canRerollAppearance = true;
    }

    // if crew is 0, use location; else, use crew location
    if (crewId === 0) {
      c.Location = { id: locationId, label: Entity.IDS.BUILDING };
    } else if (crew?._location) {
      c.Location = { id: crew._location.buildingId, label: Entity.IDS.BUILDING };
    }

    return c;
  }, [
    adalianRecruits?.length,
    appearanceOptions,
    appearanceSelection,
    crewId,
    crew?._location,
    finalized,
    locationId,
    mappedCrewmate,
    name,
    pendingCrewmate,
    selectedClass,
    selectedTraits,
    bookSession
  ]);

  const traitTally = useMemo(() => {
    if (crewmate?.Crewmate?.coll === Crewmate.COLLECTION_IDS.ADALIAN) return 4;
    if (crewmate?.Crewmate?.coll) return 8;
    return 0;
  }, [crewmate?.Crewmate?.coll]);

  // init appearance options as desired
  const originalSimulationState = useStore(s => s.simulation);
  const [namePrepopped, setNamePrepopped] = useState();
  useEffect(() => {
    if (crewmate && safeBigInt(crewmate.Crewmate?.appearance || 0n) === 0n && appearanceOptions?.length === 0) {
      if (originalSimulationState?.crewmate?.appearance) {
        const { clothes, ...unpacked } = Crewmate.unpackAppearance(originalSimulationState?.crewmate?.appearance);
        unpacked.clothesOffset = 31 + Math.ceil(Math.random() * 2);
        setAppearanceOptions([unpacked]);
      } else {
        setAppearanceOptions([getRandomAdalianAppearance()]);
      }
      setAppearanceSelection(0);
    }
  }, [!!crewmate, appearanceOptions?.length, originalSimulationState]);

  useEffect(() => {
    if (crewmate && !crewmate.Name?.name) {
      if (originalSimulationState?.crewmate?.name) {
        setName(originalSimulationState.crewmate.name);
        setNamePrepopped(true);
        // console.log('nameInput.current', nameInput.current);
        // nameInput.current.value = `${originalSimulationState.crewmate.name}`;
      }
    }
  }, [!!crewmate, originalSimulationState]);

  // handle finalizing
  useEffect(() => {
    if (crewmate?._finalizing || crewmate?.Crewmate?.status > 0) setFinalizing(true);
  }, [crewmate?._finalizing, crewmate?.Crewmate?.status]);

  // handle finalized
  useEffect(() => {
    if (finalized) {
      setFinalizing(false);

      // clear session data (for finalized crewmate and/or 0 if just created)
      dispatchCrewAssignmentRestart(mappedCrewmate?.Control?.controller?.id, mappedCrewmate?.id);

      // TODO (enhancement): after timeout, show error
    }
  }, [ crewmateId, finalized, mappedCrewmate ]);

  // const shareOnTwitter = useCallback(() => {
  //   // TODO: ...
  //   const params = new URLSearchParams({
  //     text: [
  //       `I just minted an Adalian Citizen.`,
  //       `Be one of the first to join @influenceth and explore Adalia today!`,
  //       `Join Now:`,
  //     ].join('\n\n'),
  //     hashtags: 'PlayToEarn,NFTGaming',
  //     url: `${document.location.origin}/play/crew-assignment/?r=${account}`,
  //     //via: 'influenceth'
  //   });
  //   window.open(`https://twitter.com/intent/tweet?${params.toString()}`, '_blank');
  // }, [account]);

  // const handleFinish = useCallback(() => {
  //   history.push(onCloseDestination);
  // }, [history]);

  const handleNameChange = useCallback((newName) => {
    setName(newName);
  }, []);

  const rerollAppearance = useCallback(async () => {
    setAppearanceOptions((prevValue) => {
      setAppearanceSelection((prevValue || []).length);
      return [...(prevValue || []), getRandomAdalianAppearance()]
    });
  }, []);

  const rollBackAppearance = useCallback(() => {
    setAppearanceSelection(Math.max(0, appearanceSelection - 1));
  }, [appearanceSelection]);

  const rollForwardAppearance = useCallback(() => {
    setAppearanceSelection(Math.min(appearanceOptions.length - 1, appearanceSelection + 1));
  }, [appearanceOptions.length, appearanceSelection]);

  const rerollTraits = useCallback(async () => {
    const c = cloneDeep(crewmate);
    if (!c?.Crewmate?.coll) return;

    // get random class if one is not yet selected
    if (!c.Crewmate.class) {
      const validClassIds = Object.values(Crewmate.CLASS_IDS).filter((id) => id > 0);
      c.Crewmate.class = validClassIds[Math.floor(Math.random() * validClassIds.length)];
      setSelectedClass(c.Crewmate.class);
    }

    // if full, clear and randomize (else, fill in from current state)
    const traits = (selectedTraits?.length === traitTally ? [] : [...selectedTraits]);
    let possibleTraits = Crewmate.nextTraits(c.Crewmate.coll, c.Crewmate.class, traits);
    let randomIndex;
    while (possibleTraits.length > 0 && traits.length < 12) {
      randomIndex = Math.floor(Math.random() * possibleTraits.length);
      traits.push(possibleTraits[randomIndex]);
      possibleTraits = Crewmate.nextTraits(c.Crewmate.coll, c.Crewmate.class, traits);
    }

    // set new traits
    setSelectedTraits(traits);
  }, [crewmate?.Crewmate?.class, selectedTraits, traitTally]);

  const finalize = useCallback(() => {
    setPurchaseAcknowledged(false);
    setConfirming(false);
    purchaseAndOrInitializeCrewmate({ crewmate });
  }, [crewmate, purchaseAndOrInitializeCrewmate]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmFinalize = useCallback(async () => {
    if (simulationEnabled) {
      dispatchSimulationState('crewmate', { id: SIMULATION_CONFIG.crewmateId, name, appearance: crewmate?.Crewmate?.appearance });
      history.push('/');
      return;
    }

    // don't check name validity if could not rename (i.e. some names are to be grandfathered
    //  in from L1 since user cannot change them at this point anyway)
    if (!crewmate?._canRename || await isNameValid(name || crewmate?.Name?.name, crewmate?.id)) {
      if (crewmate?.id) {
        finalize();
        return;
      }
      setPurchaseAcknowledged(false);
      setConfirming(true);
    }
  }, [finalize, isNameValid, name, crewmate?.id, crewmate?._canRename, crewmate?.Crewmate?.appearance, crewmate?.Name?.name, simulationEnabled]);

  const handleBack = useCallback(() => {
    history.push(simulationEnabled ? '/' : backLocation);
  }, [backLocation, simulationEnabled]);

  // // show "complete" page (instead of "create") for non-recruitment assignments
  // useEffect(() => {
  //   if (bookSession && !bookSession.isMintingStory) {
  //     history.push(`/crew-assignment/${crewmateId}/complete`);
  //   }
  // }, [!!bookSession]); // eslint-disable-line react-hooks/exhaustive-deps

  // place mouseovers after animation complete
  const [animationComplete, setAnimationComplete] = useState();
  useEffect(() => {
    if (!!crewmate) {
      const to = setTimeout(() => {
        setAnimationComplete(true);
      }, 2500);
      return () => {
        if (to) clearTimeout(to);
      }
    }
  }, [!!crewmate]);

  const onUpdateClass = useCallback((newClass) => {
    if (selectedClass !== newClass) {
      setSelectedTraits([]);
    }
    setSelectedClass(newClass);
    setToggling();
  }, [selectedClass]);

  const onUpdateTraits = useCallback((newTraits) => {
    setSelectedTraits(newTraits);
    setToggling();
  }, []);

  const traitObjects = useMemo(() => {
    return (selectedTraits || []).map((id) => ({ id, ...Crewmate.TRAITS[id] }));
  }, [selectedTraits]);

  const classObjects = useMemo(() => {
    return Object.values(Crewmate.CLASS_IDS).reduce((acc, id) => ({
      ...acc,
      [id]: {
        id,
        abilities: Object.values(Crewmate.ABILITY_TYPES)
          .filter((a) => a.class === id)
          .map((a) => <div key={a.name}>- {a.name}</div>),
        ...Crewmate.getClass(id),
      }
    }), {});
  }, []);

  const recruitTally = useMemo(() => {
    if (crewmate?.Crewmate?.coll === Crewmate.COLLECTION_IDS.ADALIAN) return adalianRecruits?.length || 0;
    return 0;
  }, [adalianRecruits, crewmate?.Crewmate?.coll]);

  const disableChanges = pendingCrewmate || traitsLocked || promptingTransaction;

  const [checkingName, setCheckingName] = useState(false);
  const [nameError, setNameError] = useState(null);
  useEffect(() => {
    if (!crewmate?._canRename) return;  // only check for name validity if can rename

    setNameError('');

    const testName = `${name}`;
    if (testName.length > 0) {
      // (to throttle)
      let to = setTimeout(() => {
        setCheckingName(true);
        isNameValid(testName, crewmate?.id, false, 'string').then((trueOrNameErr) => {
          setNameError(trueOrNameErr === true ? null : trueOrNameErr);
          setCheckingName(false);
        });
      }, 500);
      return () => {
        if (to) clearTimeout(to);
      }
    } else {
      setNameError('Enter Crewmate Name');
    }
  }, [name, crewmate?.id, crewmate?._canRename, isNameValid]);

  const readyForSubmission = useMemo(() => {
    if (!name) return false;
    if (simulationEnabled) return true;
    if (!selectedClass) return false;
    if (selectedTraits?.length < traitTally) return false;
    return true;
  }, [name, selectedClass, selectedTraits?.length, traitTally, simulationEnabled]);

  useEffect(() => {
    if (returnedStripeCheckoutSessionId) clearCrewmatePurchaseCheckoutSessionIdFromUrl();
  }, [returnedStripeCheckoutSessionId]);

  const { data: crewmatePurchaseProducts } = useQuery({
    queryKey: ['crewmatePurchaseProducts'],
    queryFn: async () => normalizeCrewmatePurchaseProducts((await api.getCrewmatePurchaseProducts()).products || []),
    enabled: !!stripePromise
  });

  const crewmatePurchaseProduct = useMemo(() => crewmatePurchaseProducts?.[0] || null, [crewmatePurchaseProducts]);

  const crewmatePurchaseCheckoutQuery = useQuery({
    queryKey: ['crewmatePurchaseCheckout', stripeCheckoutSessionId],
    queryFn: () => api.getCrewmatePurchaseCheckout(stripeCheckoutSessionId),
    enabled: !!stripePromise && !!authenticated && !!stripeCheckoutSessionId,
    refetchInterval: (query) => isCrewmatePurchaseCheckoutActive(query.state.data?.purchase?.status) ? crewmatePurchaseCheckoutPollMs : false
  });

  const stripePurchase = crewmatePurchaseCheckoutQuery.data?.purchase || null;

  useEffect(() => {
    if (crewmatePurchaseCheckoutQuery.data?.clientSecret) {
      setStripeClientSecret(crewmatePurchaseCheckoutQuery.data.clientSecret);
    }
  }, [crewmatePurchaseCheckoutQuery.data?.clientSecret]);

  useEffect(() => {
    if (
      stripePurchase?.status === CREWMATE_PURCHASE_STATUSES.CHECKOUT_CREATED &&
      returnedStripeCheckoutSessionId === stripeCheckoutSessionId &&
      crewmatePurchaseCheckoutQuery.data?.clientSecret &&
      !stripeCheckoutOpen &&
      !awaitingStripePayment
    ) {
      setStripeCheckoutOpen(true);
    }
  }, [
    awaitingStripePayment,
    crewmatePurchaseCheckoutQuery.data?.clientSecret,
    returnedStripeCheckoutSessionId,
    stripeCheckoutSessionId,
    stripeCheckoutOpen,
    stripePurchase?.status
  ]);

  useEffect(() => {
    if (!stripePurchase?.id || !crewmate || submittedStripePurchaseRef.current === stripePurchase.id) return;
    if (
      stripePurchase.status !== CREWMATE_PURCHASE_STATUSES.PAID_PENDING_CUSTOMIZATION &&
      !stripePurchase.canCustomize
    ) return;

    submittedStripePurchaseRef.current = stripePurchase.id;
    setStripeSubmitting(true);
    api.submitCrewmatePurchaseCustomization({
      purchaseId: stripePurchase.id,
      grantRequest: buildCrewmatePurchaseGrantRequestFromCrewmate(crewmate)
    })
      .then((response) => {
        queryClient.setQueryData(['crewmatePurchaseCheckout', stripeCheckoutSessionId], (current = {}) => ({
          ...current,
          purchase: response.purchase
        }));
        queryClient.invalidateQueries({ queryKey: ['crewmatePurchaseCheckout', stripeCheckoutSessionId] });
      })
      .catch((e) => {
        submittedStripePurchaseRef.current = undefined;
        createAlert({
          type: 'GenericAlert',
          level: 'warning',
          data: { content: e?.response?.data?.error || e.message || 'Unable to submit crewmate customization.' },
          duration: 10000
        });
      })
      .finally(() => {
        setStripeSubmitting(false);
      });
  }, [
    createAlert,
    crewmate,
    queryClient,
    stripeCheckoutSessionId,
    stripePurchase?.canCustomize,
    stripePurchase?.id,
    stripePurchase?.status
  ]);

  useEffect(() => {
    if (!stripePurchase?.id || stripePurchase.status !== CREWMATE_PURCHASE_STATUSES.GRANT_CONFIRMED) return;

    queryClient.invalidateQueries({ queryKey: ['entities', Entity.IDS.CREWMATE] });
    queryClient.invalidateQueries({ queryKey: ['entity', Entity.IDS.CREW, crewId] });
    setStripeCheckoutOpen(false);
    setStripeClientSecret(undefined);
    setStripeCheckoutSessionId(null);
    setAwaitingStripePayment(false);
    setConfirming(false);
    createAlert({
      type: 'GenericAlert',
      level: 'success',
      data: { content: 'Crewmate recruitment complete.' },
      duration: 10000
    });
    history.push(`/crew/${stripePurchase.grantedCrew?.id || crewId}`);
  }, [
    createAlert,
    crewId,
    history,
    queryClient,
    stripePurchase?.grantedCrew?.id,
    stripePurchase?.id,
    stripePurchase?.status
  ]);

  const onStripeCheckout = useCallback(async () => {
    if (!authenticated) {
      login();
      return;
    }

    if (!accountAddress) {
      createAlert({
        type: 'GenericAlert',
        level: 'warning',
        data: { content: 'Wallet connection is not ready yet. Please try again in a moment.' },
        duration: 5000
      });
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

    if (!crewmatePurchaseProduct) {
      createAlert({
        type: 'GenericAlert',
        level: 'warning',
        data: { content: 'Card checkout is temporarily unavailable.' },
        duration: 10000
      });
      return;
    }

    setStripeSubmitting(true);
    try {
      const response = await api.createCrewmatePurchaseCheckout({
        productId: crewmatePurchaseProduct.productId,
        recipient: accountAddress,
        returnUrl: buildCrewmatePurchaseReturnUrl()
      });

      if (!response.checkoutSessionId || !response.clientSecret || !response.purchase) {
        throw new Error('Stripe checkout response was incomplete.');
      }

      setStripeCheckoutSessionId(response.checkoutSessionId);
      setStripeClientSecret(response.clientSecret);
      setAwaitingStripePayment(false);
      setStripeCheckoutOpen(true);
    } catch (e) {
      createAlert({
        type: 'GenericAlert',
        level: 'warning',
        data: { content: e?.response?.data?.error || e.message || 'Unable to create Stripe checkout.' },
        duration: 10000
      });
    } finally {
      setStripeSubmitting(false);
    }
  }, [
    accountAddress,
    authenticated,
    createAlert,
    crewmatePurchaseProduct,
    login
  ]);

  const openAdvancedFunding = useCallback((price) => {
    setPurchaseAcknowledged(false);
    setConfirming(false);
    setIsFunding({
      totalPrice: price,
      onClose: () => setIsFunding(),
      onFunded: () => finalize(),
    });
  }, [finalize]);

  const onStripeCheckoutComplete = useCallback(() => {
    setStripeCheckoutOpen(false);
    setAwaitingStripePayment(true);
    if (stripeCheckoutSessionId) {
      queryClient.invalidateQueries({ queryKey: ['crewmatePurchaseCheckout', stripeCheckoutSessionId] });
    }
  }, [queryClient, stripeCheckoutSessionId]);

  const confirmationProps = useMemo(() => {
    if (!priceConstants?.ADALIAN_PURCHASE_PRICE || !priceConstants?.ADALIAN_PURCHASE_TOKEN) return;
    const price = priceHelper.from(priceConstants.ADALIAN_PURCHASE_PRICE, priceConstants.ADALIAN_PURCHASE_TOKEN);
    const targetUsdcValue = getUsdcValue(price);
    const currentUsdcBalance = Number(usdcBalance || 0n);
    const pendingStripePurchase = (
      stripeSubmitting ||
      awaitingStripePayment ||
      [
        CREWMATE_PURCHASE_STATUSES.GRANT_SUBMITTING,
        CREWMATE_PURCHASE_STATUSES.GRANT_SUBMITTED
      ].includes(stripePurchase?.status)
    );

    const paymentMode = getCrewmatePaymentMode({
      priceUsdc: targetUsdcValue,
      balanceUsdc: currentUsdcBalance,
      stripeEnabled: !!stripePromise
    });

    if (paymentMode === 'fund') {
      return {
        disabled: !purchaseAcknowledged,
        mode: 'fund',
        onConfirm: () => openAdvancedFunding(price),
        confirmText: 'Fund Wallet'
      };
    }

    if (paymentMode === 'stripe') {
      return {
        confirmButtonProps: { loading: pendingStripePurchase },
        disabled: !purchaseAcknowledged || pendingStripePurchase,
        mode: 'stripe',
        onAdvancedFunding: () => openAdvancedFunding(price),
        onConfirm: onStripeCheckout,
        confirmText: pendingStripePurchase ? 'Processing...' : 'Checkout',
        rejectButtonProps: { disabled: pendingStripePurchase }
      }
    }

    return {
      confirmButtonProps: { loading: promptingTransaction },
      disabled: !purchaseAcknowledged || promptingTransaction,
      mode: 'crypto',
      onConfirm: finalize,
      rejectButtonProps: { disabled: promptingTransaction },
      confirmText: (
        <>
          {promptingTransaction ? 'Submitting...' : 'Purchase Crewmate'}
          <span style={{ color: 'white', flex: 1, fontSize: '90%', textAlign: 'right', marginLeft: 15 }}>
            $5.00
          </span>
        </>
      )
    };
  }, [
    crewmate,
    finalize,
    onStripeCheckout,
    openAdvancedFunding,
    priceConstants,
    priceHelper,
    promptingTransaction,
    purchaseAcknowledged,
    awaitingStripePayment,
    stripeSubmitting,
    stripePurchase?.status,
    usdcBalance
  ]);

  if (!crewmate) return null;
  return (
    <>
      <ImageryContainer src={coverImage}>
        <div />
        <MainContent>
          {!finalized && (
            <>
              <CenterColumn>
                <CardWrapper>
                  <CardContainer>
                    <div>
                      <CrewmateCard
                        crewmate={crewmate}
                        fontSize="25px"
                        hideFooter
                        hideIfNoName
                        hideMask
                        noWrapName
                        useExplicitAppearance={reactBool(crewmate?.Crewmate?.coll === Crewmate.COLLECTION_IDS.ADALIAN)} />
                    </div>
                  </CardContainer>
                </CardWrapper>

                {!pendingCrewmate && (
                  <>
                    <NameSection>
                      {crewmate._canRename && (
                        <>
                          <label>Name</label>
                          <TextInput
                            autoFocus
                            disabled={promptingTransaction || finalizing}
                            initialValue={name}
                            minlength={Name.TYPES[Entity.IDS.CREWMATE].min}
                            maxlength={Name.TYPES[Entity.IDS.CREWMATE].max}
                            pattern={Name.getTypeRegex(Entity.IDS.CREWMATE)}
                            onChange={handleNameChange}
                            resetOnChange={namePrepopped}
                            placeholder="Crewmate Name" />

                          <NameValidationMessage checkingName={checkingName} nameError={nameError} />
                        </>
                      )}

                      <div style={{ flex: 1 }} />

                      {/* TODO: all "randomization" actions **and selection** actions
                        should be disabled when wallet is prompting for transaction to
                        avoid confusion... see transaction button for reference */}

                      {crewmate._canRerollAppearance && (
                        <RerollContainer>
                          <RandomizeControls
                            onClick={rollBackAppearance}
                            disabled={promptingTransaction || finalizing || appearanceSelection === 0}
                            style={{ opacity: appearanceOptions.length > 1 ? 1 : 0 }}>
                            <UndoIcon />
                          </RandomizeControls>

                          <RandomizeButton
                            disabled={promptingTransaction || finalizing}
                            lessTransparent
                            onClick={rerollAppearance}
                            style={{ width: 275 }}>
                            Randomize Appearance
                          </RandomizeButton>

                          <RandomizeControls
                            onClick={rollForwardAppearance}
                            disabled={promptingTransaction || finalizing || appearanceSelection === appearanceOptions.length - 1}
                            style={{ opacity: appearanceOptions.length > 1 ? 1 : 0 }}>
                            <RedoIcon />
                          </RandomizeControls>
                        </RerollContainer>
                      )}

                      {!simulationEnabled && (
                        <RerollContainer>
                          {traitsLocked
                            ? (
                              <RandomizeButton
                                disabled={promptingTransaction || finalizing}
                                lessTransparent
                                onClick={() => setConfirmingUnlock(true)}
                                style={{ width: 275 }}>
                                Unlock Traits
                              </RandomizeButton>
                            )
                            : (
                              <>
                                <RandomizeButton
                                  disabled={promptingTransaction || finalizing}
                                  lessTransparent
                                  onClick={rerollTraits}
                                  style={{ width: 275 }}>
                                  Randomize Traits
                                </RandomizeButton>
                              </>
                            )
                          }
                        </RerollContainer>
                      )}

                    </NameSection>
                  </>
                )}
              </CenterColumn>

              {!simulationEnabled && (
                <Traits>
                  <TraitRow big>
                    <Trait side="left">
                      <div>
                        <CollectionImage coll={crewmate.Crewmate.coll} />
                      </div>
                      <article>
                        <h4>Collection</h4>
                        <div>{Crewmate.getCollection(crewmate.Crewmate.coll)?.name}</div>
                        <div style={{color: theme.colors.secondaryText}}>{Crewmate.getTitle(crewmate.Crewmate.title)?.name}</div>
                      </article>
                      <TipHolder>
                        <TriangleTip strokeWidth="1" rotate="90" />
                        <TipIcon side="left">
                          <UnclickableIcon><LockedIcon /></UnclickableIcon>
                        </TipIcon>
                      </TipHolder>
                    </Trait>

                    <TraitSpacer />

                    <PopperWrapper>
                      {(refEl, setRefEl) => (
                        <>
                          <Trait
                            ref={animationComplete ? setRefEl : noop}
                            onClick={(disableChanges || !crewmate._canReclass) ? noop : () => setToggling('class')}
                            onMouseEnter={animationComplete ? () => setHovered('class') : noop}
                            onMouseLeave={() => setHovered()}
                            side="right"
                            isClickable={!disableChanges && crewmate._canReclass}
                            isToggling={toggling === 'class'}
                            isEmpty={!crewmate.Crewmate.class}>
                            <div>
                              <CrewClassIcon crewClass={crewmate.Crewmate.class} />
                            </div>
                            <article>
                              <h4>{crewmate.Crewmate.class ? 'Class' : 'Select Class'}</h4>
                              <div>{classObjects[crewmate.Crewmate.class]?.name}</div>
                            </article>
                            <TipHolder>
                              <TriangleTip strokeWidth="1" rotate="-90" />
                              <TipIcon side="right">
                                <ClickableIcon><RightArrowIcon /></ClickableIcon>
                                <UnclickableIcon><LockedIcon /></UnclickableIcon>
                              </TipIcon>
                            </TipHolder>
                          </Trait>

                          <MouseoverInfoPane referenceEl={refEl} {...mouseoverPaneProps(hovered === 'class' && crewmate.Crewmate.class && !toggling)}>
                            <MouseoverInfoContent
                              title={classObjects[crewmate.Crewmate.class]?.name}
                              description={(
                                <>
                                  {classObjects[crewmate.Crewmate.class]?.description}

                                  <MouseoverSubtitle>{classObjects[crewmate.Crewmate.class]?.name} Bonuses</MouseoverSubtitle>
                                  {classObjects[crewmate.Crewmate.class]?.abilities}
                                </>
                              )}
                            />
                          </MouseoverInfoPane>

                          <MouseoverInfoPane
                            referenceEl={refEl}
                            {...mouseoverPaneProps(toggling === 'class', true)}>
                            <ClassSelector
                              onClose={setToggling}
                              classObjects={classObjects}
                              crewmate={crewmate}
                              onUpdateClass={onUpdateClass} />
                          </MouseoverInfoPane>
                        </>
                      )}
                    </PopperWrapper>
                  </TraitRow>

                  {Array.from(Array(Math.ceil(traitTally / 2))).map((_, i) => {
                    return (
                      <TraitRow key={i}>
                        {Array.from(Array(2)).map((_, j) => {
                          const traitIndex = 2 * i + j;
                          const hoverKey = traitIndex;
                          const trait = traitObjects[traitIndex];
                          const side = j === 0 ? 'left' : 'right';
                          return (
                            <Fragment key={j}>
                              <PopperWrapper>
                                {(refEl, setRefEl) => (
                                  <>
                                    <Trait
                                      ref={animationComplete ? setRefEl : noop}
                                      onClick={(disableChanges || !crewmate.Crewmate.class || traitIndex > selectedTraits?.length) ? noop : () => setToggling(hoverKey)}
                                      onMouseEnter={animationComplete ? () => setHovered(hoverKey) : noop}
                                      onMouseLeave={() => setHovered()}
                                      side={side}
                                      type={trait?.type}
                                      isClickable={!disableChanges && crewmate.Crewmate.class && traitIndex <= selectedTraits?.length}
                                      isEmpty={!trait}
                                      isToggling={toggling === hoverKey}
                                      isAtRisk={toggling === 'class' || toggling < traitIndex}>
                                      <div>
                                        <CrewTraitIcon trait={trait?.id} type={trait?.type} hideFallback opaque />
                                      </div>
                                      <article>
                                        <h4>{trait?.name}</h4>
                                        {!trait?.name && crewmate.Crewmate.class && traitIndex === selectedTraits?.length && <h4>Select Trait</h4>}
                                        <div>{trait?.type && (trait?.type === 'impactful' ? 'Impactful' : 'Cosmetic')}</div>
                                      </article>
                                      <TipHolder>
                                        <TriangleTip strokeWidth="1" rotate={side === 'left' ? 90 : -90} />
                                        <TipIcon side={side}>
                                          <ClickableIcon>{side === 'left' ? <LeftArrowIcon /> : <RightArrowIcon />}</ClickableIcon>
                                          <UnclickableIcon><LockedIcon /></UnclickableIcon>
                                          <AtRiskIcon><CloseIcon /></AtRiskIcon>
                                        </TipIcon>
                                      </TipHolder>
                                    </Trait>

                                    <MouseoverInfoPane referenceEl={refEl} {...mouseoverPaneProps(hovered === hoverKey && trait && !toggling)}>
                                      <MouseoverInfoContent title={trait?.name} description={formatters.crewmateTraitDescription(trait?.description)} />
                                    </MouseoverInfoPane>

                                    <MouseoverInfoPane
                                      referenceEl={refEl}
                                      {...mouseoverPaneProps(toggling === hoverKey, true)}>
                                      <TraitSelector
                                        onClose={setToggling}
                                        crewmate={crewmate}
                                        currentTraits={traitObjects}
                                        traitIndex={traitIndex}
                                        onUpdateTraits={onUpdateTraits} />
                                    </MouseoverInfoPane>
                                  </>
                                )}
                              </PopperWrapper>
                              {side === 'left' && <TraitSpacer />}
                            </Fragment>
                          );
                        })}

                      </TraitRow>
                    );
                  })}
                </Traits>
              )}
            </>
          )}

          {finalized && (
            <>
              <TitleBox>
                <Title>Crewmate Recruited</Title>
              </TitleBox>
              <div>
                <CardWrapper>
                  <CardContainer>
                    <div>
                      <CrewmateCard
                        crewmate={crewmate}
                        fontSize="25px"
                        noWrapName
                        showClassInHeader />
                    </div>
                  </CardContainer>
                </CardWrapper>
              </div>
            </>
          )}
        </MainContent>
      </ImageryContainer>

      <Footer>
        <Rule />
        <div style={{ alignItems: 'center', display: 'flex', height: 'calc(100% - 1px)', width: '100%' }}>
          {finalized && (
            <>
              <CopyReferralLink>
                <Button><LinkIcon /> <span style={{ marginLeft: 4 }}>Copy Referral Link</span></Button>
              </CopyReferralLink>

              <div style={{ flex: 1 }} />
              <Button onClick={() => history.push(`/crew/${mappedCrewmate?.Control?.controller?.id}`)}>Go to Crew</Button>
            </>
          )}
          {!finalized && (
            <>
              <Button disabled={!!pendingCrewmate} onClick={handleBack}>Back</Button>
              <div style={{ flex: 1 }} />
              <div style={{ alignItems: 'center', display: 'flex', flexDirection: 'row' }}>
                {recruitTally > 0 && <RecruitTally>Credits Remaining: <b>{recruitTally}</b></RecruitTally>}
                <Button
                  disabled={!readyForSubmission || !!pendingCrewmate || nameError !== null || (crewId !== 0 && crew?.Crew?.roster?.length >= 5)}
                  loading={!!pendingCrewmate}
                  isTransaction
                  onClick={confirmFinalize}>Recruit</Button>
              </div>
            </>
          )}
        </div>
      </Footer>
      {confirmingUnlock && (
        <ConfirmationDialog
          title="Unlock Traits"
          body={(
            <PromptBody>
              You are about to change <b>Crewmate Traits</b> that were determined by the choices you made in Story Mode.
              <br/><br/>
              Are you sure you want to continue?
            </PromptBody>
          )}
          onConfirm={() => { setTraitsLocked(false); setConfirmingUnlock(false); }}
          onReject={() => setConfirmingUnlock(false)}
        />
      )}
      {confirming && (
        <ConfirmationDialog
          title={`Confirm Crewmate Creation`}
          body={(
            <PromptBody highlight>
              {!crewmate.id && confirmationProps?.mode === 'crypto' && (
                <>
                  Crewmate recruitment is <b>5.00 USDC</b>. To continue, you are authorizing your wallet to submit
                  the purchase transaction for <b>5.00 USDC</b>.
                </>
              )}
              {!crewmate.id && confirmationProps?.mode === 'fund' && (
                <>Crewmate recruitment is <b>5.00 USDC</b>. Add funds to your wallet to complete the purchase with crypto.</>
              )}
              {!crewmate.id && confirmationProps?.mode === 'stripe' && (
                <>
                  Crewmate recruitment is <b>$5.00</b>. Please continue to secure Stripe Checkout to complete crewmate
                  recruitment.
                </>
              )}
              <PurchaseAcknowledgement
                $checked={purchaseAcknowledged}
                aria-checked={purchaseAcknowledged}
                onClick={() => setPurchaseAcknowledged((current) => !current)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setPurchaseAcknowledged((current) => !current);
                  }
                }}
                role="checkbox"
                tabIndex={0}>
                <CheckboxButton
                  checked={purchaseAcknowledged}
                  tabIndex={-1}
                  type="button">
                  {purchaseAcknowledged ? <CheckedIcon /> : <UncheckedIcon />}
                </CheckboxButton>
                <span>
                  I understand that fulfillment begins when I submit this crewmate recruitment, and once
                  fulfillment begins I may lose any statutory withdrawal right for this digital content.
                </span>
              </PurchaseAcknowledgement>
              {(awaitingStripePayment || stripeSubmitting || stripePurchase?.status === CREWMATE_PURCHASE_STATUSES.GRANT_SUBMITTED) && (
                <>
                  Finalizing crewmate recruitment...
                </>
              )}
            </PromptBody>
          )}
          {...confirmationProps}
          disabled={confirmationProps?.disabled || stripeSubmitting}
          onReject={() => {
            setPurchaseAcknowledged(false);
            setConfirming(false);
          }}
          isTransaction
        />
      )}
      {isFunding && <FundingFlow {...isFunding} />}
      {stripeCheckoutOpen && stripeClientSecret && stripePromise && (
        <StripeEmbeddedCheckout
          clientSecret={stripeClientSecret}
          onClose={() => setStripeCheckoutOpen(false)}
          onComplete={onStripeCheckoutComplete} />
      )}
    </>
  );
};

// TODO: for recruit to 0, clears story session (and name?) when finalized,
//  how can it match back to the new crewmate? need to set something permanent
//  for page-state so doesn't reload

const Wrapper = ({ backLocation, crewId, crewmateId, locationId }) => {
  const { book, bookSession, bookError } = useBookSession(crewId, crewmateId || 0);
  const { crews, crewmateMap, loading: crewIsLoading } = useCrewContext();
  const { getPendingCrewmate } = useCrewManager();
  const history = useHistory();

  const dispatchCrewAssignmentRestart = useStore((s) => s.dispatchCrewAssignmentRestart);

  const coverImage = useMemo(() => getBookCompletionImage(book), [book]);

  // for recruit of crewmateId 0, things get weird when completed
  const finalizing = useRef();
  const pendingCrewmate = useMemo(() => getPendingCrewmate(), [getPendingCrewmate]);
  useEffect(() => {
    if (pendingCrewmate) finalizing.current = true;
      // TODO (enhancement): set a timeout? what if crewmateMap is already updated?
  }, [ pendingCrewmate ]);

  useEffect(() => {
    if (finalizing.current) {
      if (crewId === 0 || crewmateId === 0) {
        if (crews && crewmateMap) {
          // TODO: should newCrewId instead just come from the newCrewmate's controller?
          //  (this technically should work, but feels a little hacky)
          const newCrewId = crewId || crews.reduce((acc, c) => Math.max(acc, Number(c.id)), 0);
          const newCrewmateId = crewmateId || Object.keys(crewmateMap || {}).reduce((acc, id) => Math.max(acc, Number(id)), 0);

          // make sure clearing out the 0-keyed sessions here
          dispatchCrewAssignmentRestart(crewId, crewmateId);

          history.replace(`/recruit/${newCrewId}/${locationId}/${newCrewmateId}/create`);
        }
      }
    }
  }, [crewmateMap]);

  const bookSessionIsLoading = !(bookSession || bookError);

  return (
    <Details
      edgeToEdge
      headerProps={{ background: 'true', v2: 'true' }}
      onCloseDestination={onCloseDestination}
      contentInnerProps={{ style: { display: 'flex', flexDirection: 'column', height: '100%' } }}
      title="Crewmate Recruitment"
      width="1150px">
      {(bookSessionIsLoading || crewIsLoading) && (
        <div style={{ position: 'absolute', left: 'calc(50% - 30px)', top: 'calc(50% - 30px)' }}>
          <LoadingAnimation color="white" />
        </div>
      )}
      {!(bookSessionIsLoading || crewIsLoading) && (
        <CrewAssignmentCreate
          backLocation={backLocation}
          coverImage={coverImage}
          crewId={crewId}
          crewmateId={crewmateId}
          locationId={locationId}
          bookSession={bookSession}
          pendingCrewmate={pendingCrewmate} />
      )}
    </Details>
  );
}

export default Wrapper;
