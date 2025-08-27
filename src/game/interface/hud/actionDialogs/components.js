import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled, { css, keyframes } from 'styled-components';
import { createPortal } from 'react-dom';
import { Tooltip } from 'react-tooltip';
import { TbBellRingingFilled as AlertIcon } from 'react-icons/tb';
import { BarLoader } from 'react-spinners';
import {
  Asteroid,
  Building,
  Crewmate,
  Dock,
  Entity,
  Inventory,
  Lot,
  Order,
  Permission,
  Process,
  Product,
  Ship,
  Station,
  Time
} from '@influenceth/sdk';
import numeral from 'numeral';
import { List } from 'react-virtualized';

import AsteroidRendering from '~/components/AsteroidRendering';
import Button from '~/components/ButtonAlt';
import ClipCorner from '~/components/ClipCorner';
import CrewmateCardFramed, { CrewCaptainCardFramed } from '~/components/CrewmateCardFramed';
import CrewIndicator from '~/components/CrewIndicator';
import CrewLocationLabel from '~/components/CrewLocationLabel';
import Dialog from '~/components/Dialog';
import IconButton from '~/components/IconButton';
import {
  ChevronRightIcon,
  CloseIcon,
  CrewIcon,
  DeltaVIcon,
  FastForwardIcon,
  LocationIcon,
  PlusIcon,
  WarningOutlineIcon,
  SurfaceTransferIcon,
  TransferToSiteIcon,
  GasIcon,
  SwayIcon,
  RadioCheckedIcon,
  RadioUncheckedIcon,
  MyAssetIcon,
  CaptainIcon,
  EmergencyModeEnterIcon,
  TargetIcon,
  ProductionIcon,
  WarningIcon,
  CoreSampleIcon,
  ResourceIcon,
  CheckedIcon,
  UncheckedIcon,
  ScheduleFullIcon,
  CheckSmallIcon,
  MarketBuyIcon,
  InventoryIcon,
  CaretIcon,
  ShipIcon,
  BuildingIcon,
  ConstructIcon,
  InfoIcon
} from '~/components/Icons';
import LiveTimer from '~/components/LiveTimer';
import MouseoverInfoPane from '~/components/MouseoverInfoPane';
import ResourceColorIcon from '~/components/ResourceColorIcon';
import ResourceThumbnail, { ResourceThumbnailWrapper, ResourceImage, ResourceProgress } from '~/components/ResourceThumbnail';
import ResourceRequirement from '~/components/ResourceRequirement';
import ResourceSelection from '~/components/ResourceSelection';
import SliderInput from '~/components/SliderInput';
import TextInput from '~/components/TextInputUncontrolled';
import useAsteroidBuildings from '~/hooks/useAsteroidBuildings';
import useAccessibleAsteroidInventories from '~/hooks/useAccessibleAsteroidInventories';
import useAsteroidLotData from '~/hooks/useAsteroidLotData';
import useSyncedTime from '~/hooks/useSyncedTime';
import useCrewContext from '~/hooks/useCrewContext';
import useHydratedLocation from '~/hooks/useHydratedLocation';
import useShip from '~/hooks/useShip';
import { reactBool, formatFixed, formatTimer, nativeBool, locationsArrToObj, keyify, formatPrice, getCrewAbilityBonuses, ordersToFills } from '~/lib/utils';
import actionStage from '~/lib/actionStages';
import constants from '~/lib/constants';
import { getBuildingIcon, getLotShipIcon, getShipIcon } from '~/lib/assetUtils';
import formatters from '~/lib/formatters';
import theme, { hexToRGB } from '~/theme';
import { theming } from '../ActionDialog';
import ThumbnailWithData from '~/components/AssetThumbnailWithData';
import AssetBlock, { assetBlockCornerSize } from '~/components/AssetBlock';
import LiveReadyStatus from '~/components/LiveReadyStatus';
import useConstructionManager from '~/hooks/actionManagers/useConstructionManager';
import EntityName from '~/components/EntityName';
import DataTableComponent from '~/components/DataTable';
import Autocomplete, { StaticAutocomplete } from '~/components/Autocomplete';
import useScreenSize from '~/hooks/useScreenSize';
import useStore from '~/hooks/useStore';
import { COACHMARK_IDS } from '~/contexts/CoachmarkContext';
import useSimulationEnabled from '~/hooks/useSimulationEnabled';
import useCoachmarkRefSetter from '~/hooks/useCoachmarkRefSetter';
import useShoppingListData from '~/hooks/useShoppingListData';
import useInterval from '~/hooks/useInterval';
import { TOKEN, TOKEN_SCALE } from '~/lib/priceUtils';
import { useSwayBalance } from '~/hooks/useWalletTokenBalance';
import PageLoader from '~/components/PageLoader';
import Monospace from '~/components/Monospace';
import { OrderAlert, TotalSway } from './MarketplaceOrder';
import { ProductMarketSummary } from './ShoppingList';
import ThumbnailBottomBanner from '~/components/ThumbnailBottomBanner';
import ThumbnailIconBadge from '~/components/ThumbnailIconBadge';
import PurchaseButtonInner from '~/components/PurchaseButtonInner';
import useUser from '~/hooks/useUser';
import NotificationSettings from '~/components/NotificationSettings';
import GenericDialog from '~/components/GenericDialog';
import useCrew from '~/hooks/useCrew';

const SECTION_WIDTH = 780;

const borderColor = '#333';

const Spacer = styled.div`
  flex: 1;
`;
export const Section = styled.div`
  color: #777;
  margin-top: 15px;
  padding: 0 36px;
  width: ${SECTION_WIDTH}px;
`;

const Tabs = styled.div`
  border-bottom: 1px solid ${borderColor};
  display: flex;
  flex-direction: row;
  margin: 0 -18px 20px;
`;
const Tab = styled.div`
  align-items: center;
  border-bottom: 3px solid #555;
  border-radius: 6px 6px 0 0;
  display: flex;
  flex-direction: row;
  height: 35px;
  justify-content: center;
  margin-right: 12px;
  text-transform: uppercase;
  transition-property: background, border-color, color;
  transition-duration: 250ms;
  transition-timing-function: ease;
  width: 145px;
  ${p => p.isSelected
    ? `
      background: rgba(${p.theme.colors.mainRGB}, 0.5);
      border-color: ${p.theme.colors.main};
      color: white;
    `
    : `
      cursor: ${p.theme.cursors.active};
      &:hover {
        background: rgba(255, 255, 255, 0.1);
      }
    `
  }
`;
const TabIcon = styled.div`
  font-size: 30px;
  line-height: 1em;
  margin-right: 5px;
  margin-left: -5px;
`;

const FlexSectionInputContainer = styled.div`
  width: 50%;
`;

export const FlexSectionSpacer = styled.div`
  align-items: center;
  align-self: stretch;
  display: flex;
  font-size: 20px;
  justify-content: center;
  margin-top: 26px;
  width: 32px;
`;

export const FlexSectionInputBody = styled(AssetBlock)``;

export const sectionBodyCornerSize = assetBlockCornerSize;

const FlexSectionInputBodyInner = styled.div`
  height: 92px;
`;
const FlexSectionBlockInner = styled.div`
  height: 92px;
  padding: 8px 16px 8px 8px;
`;

export const FlexSection = styled(Section)`
  align-items: flex-start;
  display: flex;
`;

export const SectionTitle = styled.div`
  align-items: center;
  border-bottom: 1px solid ${borderColor};
  display: flex;
  flex-direction: row;
  font-size: 90%;
  line-height: 1.5em;
  margin-bottom: 8px;
  padding: 0 2px 4px;
  text-transform: uppercase;
  transition: border-color 250ms ease, margin-bottom 250ms ease;
  white-space: nowrap;
  & > svg {
    font-size: 150%;
    margin-left: -26px;
    transform: rotate(0);
    transition: transform 250ms ease;
  }

  ${p => p.isDetailsHeader && `
    border-color: transparent;
    color: white;
    cursor: ${p.theme.cursors.active};
    font-size: 18px;
    margin-bottom: 0;
    &:hover {
      opacity: 0.9;
    }

    ${p.isOpen && `
      border-color: ${borderColor};
      margin-bottom: 8px;
      & > svg { transform: rotate(90deg); }
    `}
  `}

  ${p => p.note && `
    &:after {
      content: "${p.note}";
      display: block;
      flex: 1;
      text-align: right;
      text-transform: none;
    }
  `}
`;
export const SectionTitleRight = styled.div`
  color: white;
  font-size: 19px;
  overflow: hidden;
  text-overflow: ellipsis;
  text-transform: none;
  white-space: nowrap;
  max-width: 240px;
`;
const SectionTitleRightTabs = styled.div`
  display: flex;
  flex-direction: row;
`;

const SectionTitleTab = styled.button`
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 3px;
  color: white;
  display: flex;
  font-size: 20px;
  height: 26px;
  justify-content: center;
  margin-left: 3px;
  margin-top: -1px;
  padding: 0;
  transition: background 250ms ease, color 250ms ease;
  width: 26px;
  ${p => p.isSelected
    ? `
      background: ${p.theme.colors.main};
      cursor: ${p.theme.cursors.default};
      color: black;
    `
    : `
      cursor: ${p.theme.cursors.active};
      &:hover {
        background: rgba(${p.theme.colors.mainRGB}, 0.3);
      }
    `
  }
`;

export const SectionBody = styled.div`
  align-items: center;
  display: flex;
  flex-direction: row;
  position: relative;
  transition: max-height 250ms ease;
  ${p => p.highlight && `
    background: rgba(${p.theme.colors.mainRGB}, 0.2);
    border-radius: 10px;
    margin: 10px 0;
    padding-left: 15px;
    padding-right: 15px;
  `}
  ${p => p.collapsible && `
    overflow: hidden;
    max-height: ${p.isOpen ? '400px' : '0'};
  `}
`;

const ActionBar = styled.div`
  align-items: center;
  background: ${p => p.overrideColor ? `rgba(${hexToRGB(p.overrideColor)}, 0.2)` : p.headerBackground};
  display: flex;
  flex: 0 0 62px;
  justify-content: space-between;
  padding: 0 15px 0 20px;
  position: relative;
  z-index: 1;
`;

const BarLoadingContainer = styled.div`
  height: 2px;
  left: 0;
  position: absolute;
  right: 0;
  top: 0;
  z-index: 2;
  & > span {
    display: block;
  }
`;

const ActionLocation = styled.div`
  border-left: 3px solid ${p => p.overrideColor || p.highlight};
  color: rgba(210, 210, 210, 0.7);
  display: flex;
  font-size: 20px;
  height: 36px;
  line-height: 36px;
  padding-left: 10px;
  white-space: nowrap;
  & > b {
    color: white;
    display: inline-block;
    height: 36px;
    margin-right: 6px;
    max-width: 350px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

export const SublabelBanner = styled.div`
  align-items: center;
  background: rgba(${p => hexToRGB(p.color)}, 0.3);
  color: white;
  ${p => p.theme.clipCorner(15)};
  display: flex;
  flex-direction: row;
  font-size: 26px;
  margin-top: 8px;
  padding: 10px 10px;
  width: 100%;

  b {
    color: rgba(${p => hexToRGB(p.color)}, 0.8);
    padding-right: 10px;
  }
`;

const IconAndLabel = styled.div`
  display: flex;
  flex: 1;
  align-items: center;
`;
const IconContainer = styled.div`
  font-size: 48px;
  padding: 0 10px;
`;
const pillColors = {
  crew: { bg: 'backgroundGray', color: 'secondaryText' },
  delay: { bg: 'sequence', color: 'sequenceLight' },
  total: { bg: 'successDark', color: 'success' },
};
const TimePillComponent = styled.div`
  align-items: center;
  background: rgba(${p => hexToRGB(p.theme.colors[pillColors[p.type].bg])}, 0.5);
  border-radius: 20px;
  color: white;
  display: flex;
  margin-top: 4px;
  padding: 3px 12px;
  text-transform: none;
  font-weight: 400;
  & > label {
    color: ${p => p.theme.colors[pillColors[p.type].color]};
    margin-right: 6px;
    flex: 1;
  }
  & > svg {
    color: ${p => p.theme.colors[pillColors[p.type].color]};
    margin-right: 4px;
  }
`;
const LabelContainer = styled.div`
  flex: 1;
  width: 75%;
  text-transform: uppercase;
  h1 {
    align-items: flex-end;
    color: white;
    display: flex;
    font-weight: normal;
    font-size: 36px;
    height: 48px;
    line-height: 36px;
    margin: 0;
  }
  & h2 {
    font-size: 18px;
    flex: 1;
    margin: 6px 0 0;
  }
  & > div {
    ${TimePillComponent} {
      margin-top: 3px;
    }
  }
`;
const Header = styled(Section)`
  align-items: center;
  display: flex;
  flex-direction: row;
  padding-bottom: 5px;
  padding-top: 5px;
  position: relative;
  ${p => p.theming?.highlight && !p.overrideHighlightColor && `
    ${IconContainer}, h2 {
      color: ${p.theming.highlight};
    }
  `}
  ${p => p.overrideHighlightColor && `
    ${IconContainer}, h2 {
      color: ${p.overrideHighlightColor};
    }
  `}
  ${p => p.wide && `width: 100%;`}
`;

export const ActionDialogBody = styled.div`
  flex: 1;
  overflow-x: hidden;
  overflow-y: auto;
`;

const StatRow = styled.div`
  align-items: center;
  display: flex;
  justify-content: space-between;
  padding: 5px 0;
  & > label {
    flex: 1;
  }
  & > span {
    color: ${p => {
      if (p.isTimeStat && p.direction < 0) return p.theme.colors.error;
      if (p.isTimeStat && p.direction > 0) return p.theme.colors.success;
      if (p.direction > 0) return p.theme.colors.success;
      if (p.direction < 0) return p.theme.colors.error;
      return 'white';
    }};
    font-weight: bold;
    white-space: nowrap;
    &:after {
      content: "${p => {
        if (!p.direction) return ' —';
        if ((p.isTimeStat ? -1 : 1) * p.direction > 0) return ' ▲';
        return ' ▼';
      }}";
      font-size: 50%;
      padding-left: 2px;
      vertical-align: middle;
    }
  }
`;
const StatSection = styled(Section)`
  min-height: 0;
  ${p => p.wide && `width: 100%;`}
  & ${SectionBody} {
    align-items: flex-start;
    display: flex;
    font-size: 15px;
    & > div {
      flex: 1;
      &:last-child {
        border-left: 1px solid ${borderColor};
        margin-left: 15px;
        padding-left: 15px;
      }
    }
  }
`;

const Footer = styled(Section)`
  margin-top: 8px;
  min-height: 0;
  & > div {
    border-top: 1px solid ${borderColor};
    display: flex;
    flex-direction: row;
    justify-content: flex-end;
    & > * {
      margin: 15px 5px;
    }
  }
  ${p => p.wide && `width: 100%;`}
`;

const EmptyThumbnail = styled.div`
  color: ${borderColor};
  font-size: 40px;
  & > svg {
    left: 50%;
    margin-left: -20px;
    margin-top: -20px;
    position: absolute;
    top: 50%;
  }
`;

const AsteroidThumbnailWrapper = styled(ResourceThumbnailWrapper)`
  background-color: rgba(0, 0, 0, 0.75);
`;
const BuildingThumbnailWrapper = styled(ResourceThumbnailWrapper)`
  height: 92px;
  width: 150px;
  & ${EmptyThumbnail} {
    font-size: 50px;
    & > svg {
      margin-left: -25px;
      margin-top: -25px;
    }
  }
`;
const ShipThumbnailWrapper = styled(ResourceThumbnailWrapper)`
  height: 92px;
  width: 150px;
`;
const ThumbnailBadge = styled.div`
  position: absolute;
  left: 5px;
  top: 5px;
`;
const ThumbnailOverlay = styled.div`
  align-items: center;
  color: ${p => p.color || p.theme.colors.main};
  display: flex;
  font-size: 40px;
  height: 100%;
  line-height: 30px;
  justify-content: center;
  position: absolute;
  width: 100%;
`;
const InventoryUtilization = styled(ResourceProgress)`
  bottom: 8px;
  ${p => p.horizontal && `right: 8px;`}
  ${p => p.second && `bottom: 3px;`}
  ${p => p.overloaded && `
    &:after {
      background: ${p.theme.colors.error};
    }
  `}
`;
const InventoryLabel = styled.div`
  color: ${p => p.overloaded ? p.theme.colors.error : 'white'};
  font-weight: bold;
  font-size: 13px;
  position: absolute;
  left: 8px;
  bottom: 14px;
`;

const SliderLabel = styled.div`
  flex: 1;
  height: 33px;
  margin-bottom: -4px;
  & > b {
    color: white;
    font-size: 175%;
    font-weight: normal;
  }
`;
const SliderInfo = styled.div`
  color: white;
  font-size: 22px;
  line-height: 1em;
  margin-right: 8px;
`;

const SliderTextInput = styled.input`
  background: transparent;
  border: 1px solid ${borderColor};
  color: white;
  font-family: inherit;
  font-size: 175%;
  height: 100%;
  text-align: right;
  width: 120px;
`;

const SliderWrapper = styled.div`
  flex: 1;
`;
const SliderInfoRow = styled.div`
  align-items: flex-end;
  display: flex;
  justify-content: space-between;
  & > button {
    padding: 5px 25px;
  }
  & > div:last-child {
    text-align: right;
  }
`;

const ProductWrapper = styled.div`
  display: flex;
  flex-direction: row;
  ${p => p.horizontalScroll && `
    overflow-x: auto;
    padding-bottom: 16px;
  `}
`;
const ProductGridWrapper = styled.div`
  column-gap: 5px;
  display: grid;
  grid-template-columns: repeat(3, 87px);
  row-gap: 5px;
`;
const ProductSelector = styled.div`
  padding: 4px;
  position: relative;
  ${p => p.input && `
    padding-bottom: 0;
    padding-top: 0;
  `}
  ${p => p.output && p.theme.clipCorner(10)};
  ${p => p.output && p.primary && `
    background: rgba(${p.theme.colors.mainRGB}, 0.2);
    border: 1px solid ${p.theme.colors.main};
    padding: 3px;
  `}
  ${p => p.onClick && !p.primary && `
    cursor: ${p.theme.cursors.active};
    &:hover {
      background: #171717;
    }
  `}
  & > label {
    align-items: center;
    color: ${p => p.primary ? p.theme.colors.brightMain : 'inherit'};
    display: flex;
    font-size: 14px;
    padding-top: 4px;
    justify-content: flex-start;
    text-transform: uppercase;
    & > svg:first-child {
      margin: 0 4px;
    }
  }
`;
const RecipeLabel = styled.div`
  color: white;
  font-size: 13px;
  line-height: 13px;
  margin-top: 2px;
  margin-left: 4px;
`;

const PropulsionTypeOption = styled.div`
  align-items: center;
  display: flex;
  flex-direction: row;
  font-size: 90%;
  height: 28px;
  ${p => p.onClick && `
    cursor: ${p.theme.cursors.active};
    opacity: 0.8;
    &:hover {
      opacity: 1;
    }
  `}

  ${p => p.disabled && `
    color: ${p.theme.colors.disabledButton};
  `}

  ${p => p.selected && `
    color: white;
    opacity: 1;
  `}

  & svg {
    color: ${p => p.theme.colors.main};
    ${p => p.disabled && `
      color: ${p.theme.colors.disabledButton};
    `}
    font-size: 22px;
    margin-right: 5px;
  }
  & label {
    text-transform: uppercase;
  }
`;

const TugWarning = styled.div`
  align-items: center;
  background: rgba(${p => hexToRGB(p.theme.colors.error)}, 0.2);
  color: ${p => p.theme.colors.error};
  display: flex;
  padding: 12px;
  white-space: pre-line;
  & svg {
    font-size: 32px;
    margin-right: 10px;
  }
`;

const IngredientsList = styled(FlexSectionInputBody)`
  ${p => p.theming === 'warning' && `
    background: rgba(${hexToRGB(p.theme.colors.lightOrange)}, 0.1);
  `}
  ${p => p.theming === 'success' && `
    background: rgba(${p.theme.colors.successRGB}, 0.1);
  `}
  column-gap: 5px;
  display: grid;
  grid-template-columns: repeat(${p => p.columns || 7}, 95px);
  padding: 5px;
  position: relative;
  row-gap: 5px;
  width: 100%;
  ${p => p.hasSummary && `padding-bottom: 36px;`}
  ${p => p.onClick && `
    ${ResourceThumbnailWrapper} {
      background: rgba(0, 0, 0, 0.5);
    }
  `}
`;

const DialogIngredientsList = styled(IngredientsList)`
  background: transparent;
  grid-template-columns: repeat(6, 95px);
  padding-bottom: 32px;
`;

const IngredientSummary = styled.div`
  display: flex;
  justify-content: center;
  pointer-events: none;
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  font-size: 14px;
  & > span:first-child {
    color:
      ${p => p.theming === 'error' && `rgba(${hexToRGB(p.theme.colors.error)}, 1)`}
      ${p => p.theming === 'warning' && `rgba(${hexToRGB(p.theme.colors.lightOrange)}, 1)`}
      ${p => p.theming === 'success' && `rgba(${p.theme.colors.successRGB},1)`}
      ${p => p.theming === 'none' && `rgba(${hexToRGB(p.theme.colors.secondaryText)}, 1)`}
      ${p => (!p.theming || p.theming === 'default') && `white`}
    ;
    padding: 5px 0;
  }
  & span:not(:first-child) {
    color: white;
    padding: 5px 5px;
  }
`;
const SelectionTableRow = styled.tr`
  ${p => p.disabledRow && `
    opacity: 0.33;
    pointer-events: none;
  `}
  ${p => p.selectedRow && `
    & > td,
    &:hover > td {
      background: rgba(${p.theme.colors.mainRGB}, 0.3) !important;
    }
  `}
`;
const SelectionTableWrapper = styled.div`
  border: solid ${borderColor};
  border-width: 1px 0;
  flex: 1;
  overflow: auto;
  & > table {
    border-spacing: 0;
    border-collapse: separate;
    width: 100%;

    & td, & th {
      white-space: nowrap;
    }

    & td {
      padding: 4px 8px 6px;
      text-align: right;
      vertical-align: middle;
      &:first-child {
        text-align: left;
      }
    }

    & thead {
      color: #aaa;
      font-size: 14px;
      & > tr > td {
        border-bottom: 1px solid ${borderColor};
      }
    }

    & tbody {
      color: white;
      font-size: 16px;
      & > tr {
        cursor: ${p => p.theme.cursors.active};
        &:hover > td {
          background: #222;
        }
      }
    }
  }
`;
const EmptyMessage = styled.div`
  background: rgba(255, 255, 255, 0.15);
  opacity: 0.7;
  padding: 20px;
  text-align: center;
`;
const InputOutputTableCell = styled.div`
  align-items: center;
  display: flex;
  & > label {
    flex: 0 0 24px;
    opacity: 0.5;
    margin-left: 0;
    padding-right: 8px;
  }
  & > div {
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    & > * {
      margin: 1px;
    }
  }
`;

const TextInputWithNote = styled.div`
  align-items: center;
  display: flex;
  flex-direction: row;
  margin-bottom: 10px;
`;
const TextInputNote = styled.div`
  align-items: center;
  align-self: stretch;
  background: ${p => p.error ? p.theme.colors.error : '#222'};
  color: ${p => p.error ? 'white' : '#aaa'};
  display: flex;
  font-size: 14px;
  justify-content: center;
  margin-left: 10px;
  padding: 0 20px;
  & > svg {
    font-size: 18px;
    margin-right: 6px;
  }
  transition: border-color 500ms ease, color 500ms ease;
`;

export const MouseoverContent = styled.div`
  & b {
    color: ${p => p.highlightColor || 'white'};
    white-space: nowrap;
  }
  color: #999;
  font-size: 90%;
  padding-bottom: 15px;
`;

const SelectionTitle = styled.div`
  align-items: center;
  border-bottom: 1px solid ${borderColor};
  display: flex;
  flex: 0 0 60px;
  justify-content: space-between;
  margin: 0 20px 0 20px;
  position: relative;
  z-index: 1;
  & > div {
    border-left: 2px solid ${p => p.theme.colors.main};
    font-size: 20px;
    height: 36px;
    line-height: 36px;
    padding-left: 10px;
    text-transform: uppercase;
    & > b {
      font-weight: normal;
      opacity: 0.5;
    }
  }
`;
const SelectionBody = styled.div`
  flex: 1;
  overflow: hidden auto;
  margin: 10px 0;
  padding: 0 20px;
`;

const SelectionButtons = styled.div`
  align-items: center;
  border-top: 1px solid ${borderColor};
  display: flex;
  flex-direction: row;
  flex: 0 0 60px;
  justify-content: flex-end;
  padding-right: 0px;
  margin: 0 20px 0 20px;
  & > button {
    margin-top: 0;
    margin-left: 10px;
    &:first-child {
      margin-left: 0;
    }
  }
`;

const selectionDialogCornerSize = 20;
const dialogCss = css`
  border: 1px solid ${borderColor};
  ${p => p.theme.clipCorner(selectionDialogCornerSize)};
  display: flex;
  flex-direction: column;
  max-height: 80%;
  max-width: ${SECTION_WIDTH - 60}px;
  overflow: hidden;
  position: relative;
`;

const SelectionGrid = styled.div`
  column-gap: 10px;
  display: grid;
  grid-template-columns: calc(50% - 5px) calc(50% - 5px);
  row-gap: 10px;
  width: 100%;
`;

const InvSelectionTableWrapper = styled.div`
  border-top: 1px solid #333;
  flex: 1;
  max-width: 100%;
  min-height: 250px;
  overflow: auto;
  & > table {
    width: 100%;
    th {
      color: white;
    }
  }
`;

export const MultiSourceWrapper = styled(AssetBlock)`
  align-items: center;
  align-self: stretch;
  border: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
  padding: 0 10px;
  width: 50%;
  & > button {
    width: 100%;
  }
  & > button > div {
    & > svg {
      font-size: 32px;
    }
    & > span {
      flex: 1;
    }
  }
`;


const gradientWidth = 23;
const gradientAngle = 135;
const gradientAngleSine = Math.sin(Math.PI * gradientAngle / 180);
const widthOverSine = gradientWidth / gradientAngleSine;
const actionProgressBarAnimation = keyframes`
  0% { background-position: ${widthOverSine}px 0; }
`;
const ActionProgress = styled.div.attrs((p) => ({
  style: {
    filter: p.progress >= 1 ? 'brightness(0.45)' : undefined,
    opacity: p.progress >= 1 ? '1' : undefined,
    width: `${100 * p.progress}%`
  }
}))`
  transition: all 250ms ease;
`;
const ActionProgressLabels = styled.div`
  align-items: center;
  display: flex;
  flex-direction: row;
  font-size: 18px;
  justify-content: space-between;
  padding: 0 12px;
  & > div:first-child {
    text-transform: uppercase;
  }
`;
const ActionProgressWrapper = styled.div`
  border: 1px solid ${borderColor};
  padding: 8px;
`;
export const ActionProgressContainer = styled.div`
  height: 34px;
  width: 100%;
  position: relative;
  z-index: 0;

  &:before, ${ActionProgress}, ${ActionProgressLabels} {
    height: 100%;
    left: 0;
    position: absolute;
    top: 0;
    width: 100%;
    z-index: -1;
  }

  &:before {
    content: "";
    ${p => p.animating && css`
      animation: ${actionProgressBarAnimation} 1s linear infinite ${p.reverseAnimation ? '' : 'reverse'};
    `}
    background: repeating-linear-gradient(
      ${gradientAngle}deg,
      ${p => p.color || '#ffffff'} 0,
      ${p => p.color || '#ffffff'} 16px,
      transparent 16px,
      transparent ${gradientWidth}px
    );
    background-size: ${widthOverSine}px 100%;
    opacity: 0.1;
  }

  ${ActionProgress} {
    background: ${p => p.color};
    opacity: 0.4;
  }
  ${ActionProgressLabels} {
    color: ${p => p.labelColor || p.color};
  }
`;

const barChartHeight = 22;
const barChartPadding = 3;
const barChartRounding = barChartHeight / 2;
const BarChartValue = styled.span.attrs((p) => ({
  style: {
    width: `calc(${100 * Math.max(0, Math.min(p.value, 1))}% - ${barChartPadding * 2}px)`,
  }
}))`
  bottom: ${barChartPadding}px;
  border-radius: ${barChartRounding - barChartPadding}px;
  position: absolute;
  left: ${barChartPadding}px;
  top: ${barChartPadding}px;
  transition: width 500ms ease;
  z-index: 1;
`;
const BarChartPostValue = styled(BarChartValue)`
  opacity: 0.7;
`;
const BarChartWrapper = styled.div`
  background: rgba(${p => hexToRGB(p.bgColor || p.color)}, 0.3);
  border-radius: ${barChartRounding}px;
  height: ${barChartHeight}px;
  margin: ${(28 - barChartHeight) / 2}px 0;
  position: relative;
  width: 100%;
  ${BarChartValue} {
    background: ${p => p.color};
  }
`;

const BarChart = ({ children, value, postValue, color, bgColor }) => (
  <BarChartWrapper color={color} bgColor={bgColor}>
    <BarChartValue value={value} />
    {children}
    {postValue !== undefined && <BarChartPostValue value={postValue} />}
  </BarChartWrapper>
);

const BarChartLimitLine = styled.div`
  border: solid ${p => p.theme.colors.red};
  border-width: 0 1px;
  top: 0;
  bottom: 0;
  position: absolute;
  left: calc(${barChartPadding + 1}px + ${p => p.position * 100}%);
  z-index: 3;
`;
const BarChartNotes = styled.div`
  color: ${p => p.color || 'inherit'};
  display: flex;
  flex-direction: row;
  font-size: 92%;
  font-weight: bold;
  line-height: 28px;
  justify-content: space-between;
  width: 100%;
  & b {
    color: white;
  }
  & > div:first-child, & > div:last-child {
    min-width: 150px;
  }
  & > div:last-child {
    text-align: right;
  }
`;

export const MiniBarChartSection = styled(FlexSectionInputBody)`
  background: transparent;
`;
const MiniBarWrapper = styled.div`
  margin-top: 15px;
  &:first-child {
    margin-top: 0;
  }
`;
const ChartLabels = styled.div`
  align-items: center;
  color: #999;
  display: flex;
  flex-direction: row;
  font-size: 14.5px;
  justify-content: space-between;
  & > label:last-child {
    color: ${p => p.warning ? p.theme.colors.error : 'white'};
  }
`;
const UnderChartLabels = styled(ChartLabels)``;
const miniBarChartHeight = 4;
const miniBarChartRounding = miniBarChartHeight / 2;
const DeltaIcon = styled.div`
  font-size: 120%;
  position: absolute;
  top: -0.4em;
  z-index: 1;
  ${p => p.negativeDelta
    ? `
      left: calc(${100 * p.value}% - 4px);
      transform: scaleX(-1);
    `
    : `
      left: calc(${100 * p.value}% - 12px);
    `
  }
`;
const MiniBar = styled.div`
  background: #333;
  border-radius: ${miniBarChartRounding}px;
  color: ${p => p.warning ? p.theme.colors.error : (p.deltaColor || p.color || p.theme.colors.brightMain)};
  height: ${miniBarChartHeight}px;
  margin: 4px 0;
  position: relative;
  width: 100%;
  &:before {
    content: "";
    background: ${p => p.warning ? p.theme.colors.error : (p.color || p.theme.colors.main)};
    bottom: 0px;
    border-radius: ${miniBarChartRounding}px;
    left: 0px;
    opacity: ${p => p.deltaValue ? 0.5 : 1};
    position: absolute;
    top: 0px;
    transition: width 500ms ease;
    width: ${p => 100 * p.value}%;
    z-index: 1;
  }
  ${p => p.deltaValue && `
    &:after {
      content: "";
      background: ${p.warning ? p.theme.colors.error : (p.deltaColor || p.color || p.theme.colors.brightMain)};
      bottom: 0px;
      border-radius: ${miniBarChartRounding}px;
      position: absolute;
      top: 0px;
      transition: width 500ms ease;
      width: ${Math.abs(100 * p.deltaValue)}%;
      z-index: 1;
      ${p.deltaValue < 0
        ? `right: ${100 * (1 - (p.value - p.deltaValue))}%;`
        : `left: ${100 * (p.value - p.deltaValue)}%;`
      }
    }
  `}
`;

export const ProgressBarNote = styled.div`
  color: ${p => p.color || p.theme.colors[p.themeColor] || 'inherit'};
  font-size: 92%;
  margin: 10px 0;
  text-align: center;
  & b {
    color: white;
    font-weight: normal;
  }
`;

const CrewmateCards = styled.div`
  display: flex;
  flex-direction: row;
  & > div {
    margin-right: 5px;
    &:last-child {
      margin-right: 0;
    }
  }
`;
const CrewmateCardPlaceholder = styled.div`
  width: ${p => p.width}px;
  &:before {
    content: "";
    background: rgba(${p => p.theme.colors.mainRGB}, 0.07);
    display: block;
    height: 0;
    padding-top: 128%;
  }
`;

const ShipStatus = styled.span`
  color: ${p => p.theme.colors.main};
  display: inline-block;
  margin-top: 4px;
  text-transform: uppercase;
  &:after {
    content: "${p => formatShipStatus(p.ship)}";
    color: ${p => p.theme.colors.main};
    text-transform: uppercase;
    ${p => {
      switch (p.status) {
        case 'IN_FLIGHT':
        case 'LAUNCHING':
        case 'LANDING':
          return `color: ${p.theme.colors.warning};`;
        case 'IN_ORBIT':
          return `color: ${p.theme.colors.main};`;
        case 'IN_PORT':
        case 'ON_SURFACE':
          return `color: ${p.theme.colors.purple};`;
      }
    }}
  }
`;

export const WarningAlert = styled.div`
  align-items: center;
  background: rgba(${p => hexToRGB(p.theme.colors[p.severity === 'warning' ? 'orange' : 'red'])}, 0.2);
  color: ${p => p.theme.colors[p.severity === 'warning' ? 'orange' : 'red']};
  display: flex;
  flex-direction: row;
  margin-top: 10px;
  padding: 10px;
  width: 100%;
  & > div:first-child {
    font-size: 30px;
    margin-right: 12px;
  }
  & > div:last-child {
    font-size: 96%;
    & > i {
      color: white;
      font-style: normal;
    }
  }
  &:first-child {
    margin-top: 0;
  }
`;

const SwayInputInstruction = styled.div`
  color: white;
  margin-top: -5px;
  margin-bottom: 10px;
`;
const SwayInputRow = styled.div`
  align-items: center;
  display: flex;
  flex-direction: row;
  & input {
    margin-bottom: 0;
  }
`;
const SwayInputIconWrapper = styled.div`
  color: white;
  font-size: 36px;
  line-height: 0;
`;
const SwayInputFieldWrapper = styled.div`
  flex: 1;
  position: relative;
  &:after {
    content: "${p => p.inputLabel}";
    color: ${p => p.theme.colors.main};
    font-size: 18px;
    margin-top: -10px;
    opacity: 0.5;
    pointer-events: none;
    position: absolute;
    right: 12px;
    top: 50%;
  }

  & input {
    background: rgba(${p => p.theme.colors.mainRGB}, 0.2);
    font-size: 18px;
    padding-right: 72px;
    width: 100%;
  }
`;
const SwayInputHelp = styled.div`
  font-size: 20px;
  margin-left: 10px;
`;
const QuestionIcon = styled.div`
  align-items: center;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 1.2em;
  color: white;
  display: flex;
  height: 1.2em;
  justify-content: center;
  width: 1.2em;
  &:after {
    content: "?";
  }
`;

export const TransferDistanceTitleDetails = styled.span`
  font-size: 15px;
  line-height: 15px;
  & label {
    color: ${p => p.theme.colors.main};
    font-weight: bold;
  }
`;
const FreeTransferNote = styled.div`
  color: #999;
  & > div:first-child {
    color: ${p => p.theme.colors.main};
    font-weight: bold;
    margin-bottom: 10px;
  }
`;

const ControlWarning = styled.div`
  align-items: center;
  color: ${p => p.theme.colors.error};
  display: flex;
  justify-content: center;
  padding: 20px 0 5px;
  & > svg {
    font-size: 125%;
    margin-right: 10px;
  }
`;

const getMarketplaceAlertColor = (p) => {
  if (p.scheme === 'success') return p.theme.colors.green;
  if (p.scheme === 'error') return p.theme.colors.red;
  if (p.scheme === 'empty') return '#999999';
  return p.theme.colors.main;
}
export const MarketplaceAlert = styled.div`
  ${p => p.theme.clipCorner(10)};
  background: rgba(${p => hexToRGB(getMarketplaceAlertColor(p))}, 0.2);
  padding: 4px;
  transition: background 150ms ease;
  width: 100%;
  & > div {
    ${p => p.theme.clipCorner(8)};

    background: rgba(${p => hexToRGB(getMarketplaceAlertColor(p))}, 0.2);
    color: rgba(255, 255, 255, 0.7);
    display: flex;
    padding: 15px 12px;
    transition: background 150ms ease, color 150ms ease;

    & label {
      color: ${p => getMarketplaceAlertColor(p)};
      display: block;
      font-size: 15px;
      text-transform: uppercase;
      transition: color 150ms ease;
    }
    & b {
      color: white;
      font-weight: normal;
    }

    & > div:first-child {
      flex: 1;
      & > div {
        font-size: 20px;
        & > span {
          margin-left: 6px;
          font-size: 14px;
        }
      }
    }

    & > div:last-child {
      align-items: center;
      display: flex;
      color: white;
      & > label {
        margin-top: 12px;
        margin-right: 2px;
      }
      & > span {
        font-size: 32px;
      }
    }

    &:not(:first-child) {
      align-items: flex-end;
      justify-content: space-between;
      padding: 8px 10px 0;
      & > svg {
        font-size: 24px;
        margin-right: 6px;
      }

      ${p => p.scheme && `
        color: ${getMarketplaceAlertColor(p)};
      `}
    }
  }
`;

export const SelectionDialog = ({ children, isCompletable, open, onClose, onComplete, style = {}, title }) => {
  if (!open) return null;
  return createPortal(
    <Dialog opaque dialogCss={dialogCss} dialogStyle={style}>
      <Tooltip id="selectionDialogTooltip" style={{ maxWidth: 500 }} />
      <SelectionTitle>
        <div>{title}</div>
        <IconButton backgroundColor={`rgba(0, 0, 0, 0.15)`} marginless onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </SelectionTitle>
      <SelectionBody>
        <div>{children}</div>
      </SelectionBody>
      <SelectionButtons style={{ position: 'relative' }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button disabled={!isCompletable} onClick={onComplete}>Done</Button>
      </SelectionButtons>
      <ClipCorner color={borderColor} dimension={selectionDialogCornerSize} />
    </Dialog>,
    document.body
  );
};

const ListWrapper = styled.div`
  min-height: 250px;
  overflow: hidden auto;
`;
export const CrewSelectionDialog = ({ crews, disabler, onClose, onSelected, open, title }) => {
  const { height: screenHeight } = useScreenSize();
  const [selection, setSelection] = useState();

  const onComplete = useCallback(() => {
    onSelected(selection?.id);
    onClose();
  }, [onClose, onSelected, selection]);

  const [firstNonEmptyCrew, firstEmptyCrew] = useMemo(
    () => [
      crews.find((c) => c.Crew.roster.length > 0),
      crews.find((c) => c.Crew.roster.length === 0),
    ],
    [crews]
  );
  const firstNonEmptyCrewLocation = useMemo(() => {
    return firstNonEmptyCrew
      ? locationsArrToObj(firstNonEmptyCrew.Location?.locations || [])
      : undefined;
  }, [firstNonEmptyCrew])
  const hydratedLocation = useHydratedLocation(firstNonEmptyCrewLocation);

  const listWrapper = useRef();
  const [listHeight, setListHeight] = useState(0);
  useEffect(() => {
    setListHeight(listWrapper.current?.clientHeight || 500);
  }, [crews?.length, screenHeight]);

  const getCrewRowHeight = useCallback(({ index }) => {
    if (!crews?.[index]) return 0;
    const crew = crews[index];
    const isFirstNonEmpty = crew.id === firstNonEmptyCrew?.id;
    const isFirstEmpty = crew.id === firstEmptyCrew?.id;
    return 152 + ((isFirstNonEmpty || isFirstEmpty) ? 26 : 0);
  }, [crews, firstNonEmptyCrew?.id, firstEmptyCrew?.id]);

  const renderCrewRow = useCallback(({ key, index, style }) => {
    if (!crews?.[index]) return null;
    const crew = crews[index];
    const disabled = disabler ? disabler(crew) : false;
    const isFirstNonEmpty = crew.id === firstNonEmptyCrew?.id;
    const isFirstEmpty = crew.id === firstEmptyCrew?.id;
    return (
      <div key={key} style={style}>
        <CrewInputBlock
          cardWidth={64}
          crew={crew}
          disabled={reactBool(disabled)}
          hideCrewmates={reactBool(!(crew.Crew.roster?.length > 0))}
          inlineDetails
          isSelected={crew.id === selection?.id}
          onClick={() => setSelection(crew)}
          title={
            isFirstNonEmpty
              ? <CrewLocationLabel hydratedLocation={hydratedLocation} />
              : (
                isFirstEmpty
                  ? <div style={{ marginTop: 8, textTransform: 'none' }}>Empty Crews</div>
                  : ''
              )
          }
          data-tooltip-content={disabled || null}
          data-tooltip-id="selectionDialogTooltip"
          style={{ marginBottom: 8, opacity: disabled ? 0.5 : 1, width: '100%' }} />
      </div>
    );
  }, [crews, disabler, firstNonEmptyCrew?.id, firstEmptyCrew?.id, hydratedLocation]);

  return (
    <SelectionDialog
      isCompletable={!!selection}
      onClose={onClose}
      onComplete={onComplete}
      open={open}
      title={title || 'Crew Selection'}>
      <ListWrapper ref={listWrapper}>
        <List
          width={372}
          height={listHeight}
          rowCount={crews?.length || 0}
          rowHeight={getCrewRowHeight}
          rowRenderer={renderCrewRow}
        />
      </ListWrapper>
    </SelectionDialog>
  );
};

export const CrewTypeaheadInputBlock = ({ setSelectedCrewId, selectedCrewId, stage, title }) => {
  const handleSelect = useCallback((crew) => {
    setSelectedCrewId(crew.id);
  }, [setSelectedCrewId]);

  const { data: selectedCrew, isLoading } = useCrew(selectedCrewId);
  if (selectedCrewId) {
    if (isLoading) {
      return (<div>Loading...</div>);
    }
    return (
      <CrewInputBlock
        title={title}
        crew={selectedCrew}
        select
        isSelected={stage === actionStage.NOT_STARTED}
        onClick={stage === actionStage.NOT_STARTED ? () => setSelectedCrewId() : undefined}
        subtle
      />
    );
  }
  return (
    <FlexSectionBlock title={title} bodyStyle={{ alignItems: 'center', background: `rgba(${theme.colors.mainRGB}, 0.15)`, display: 'flex' }}>
      <Autocomplete
        assetType="crews"
        onSelect={handleSelect}
        placeholder="Crew Name / ID..."
        inputHeight={44}
        width={336}
      />
    </FlexSectionBlock>
  );
};

export const SitePlanSelectionDialog = ({ initialSelection, onClose, onSelected, open }) => {
  const setCoachmarkRef = useCoachmarkRefSetter();
  const simulationEnabled = useSimulationEnabled();
  const coachmarks = useStore((s) => s.coachmarks);
  const simulationActions = useStore((s) => s.simulationActions);

  const [selection, setSelection] = useState(initialSelection);

  const onComplete = useCallback(() => {
    onSelected(selection);
    onClose();
  }, [onClose, onSelected, selection]);

  const isCompletable = useMemo(() => {
    if (simulationEnabled) {
      return simulationActions.includes(`SelectSitePlan:${selection}`);
    }
    return selection > 0;
  }, [selection, simulationActions, simulationEnabled]);
  return (
    <SelectionDialog
      isCompletable={isCompletable}
      onClose={onClose}
      onComplete={onComplete}
      open={open}
      title="Select Site Type">
      <SelectionGrid>
        {Object.keys(Building.TYPES).filter((c) => c > 0).map((buildingType) => {
          const coachmarked = coachmarks[COACHMARK_IDS.actionDialogPlanType] === Number(buildingType);
          return (
            <Fragment key={buildingType}>
              <FlexSectionInputBlock
                fullWidth
                image={<BuildingImage buildingType={buildingType} unfinished />}
                isSelected={buildingType === selection}
                label={Building.TYPES[buildingType].name}
                sublabel="Site"
                onClick={() => setSelection(buildingType)}
                setRef={coachmarked ? setCoachmarkRef(COACHMARK_IDS.actionDialogPlanType) : undefined}
                style={{ width: '100%' }}
              />
            </Fragment>
          );
        })}
      </SelectionGrid>
    </SelectionDialog>
  );
};

export const ResourceSelectionDialog = ({ abundances, lotId, initialSelection, onClose, onSelected, open }) => {
  const setCoachmarkRef = useCoachmarkRefSetter();
  const simulationEnabled = useSimulationEnabled();
  const coachmarks = useStore((s) => s.coachmarks);
  const simulationActions = useStore((s) => s.simulationActions);

  const [selection, setSelection] = useState(initialSelection);

  const onComplete = useCallback(() => {
    onSelected(selection);
    onClose();
  }, [onClose, onSelected, selection]);

  const isCompletable = useMemo(() => {
    if (simulationEnabled) {
      return simulationActions.includes(`SelectTargetResource:${selection}`);
    }
    return selection > 0;
  }, [selection, simulationActions, simulationEnabled]);

  const nonzeroAbundances = useMemo(() => Object.values(abundances).filter((x) => x > 0).length, [abundances]);
  return (
    <SelectionDialog
      isCompletable={isCompletable}
      onClose={onClose}
      onComplete={onComplete}
      open={open}
      title={formatters.lotName(lotId)}>
      {/* TODO: replace with DataTable? */}
      <SelectionTableWrapper>
        <table>
          <thead>
            <tr>
              <td>{(nonzeroAbundances || 0).toLocaleString()} Available Resource{nonzeroAbundances === 1 ? '' : 's'}</td>
              <td>Abundance at Lot</td>
            </tr>
          </thead>
          <tbody>
            {Object.keys(abundances)
              .sort((a, b) => abundances[b] - abundances[a])
              .map((resourceId) => {
                const coachmarked = coachmarks[COACHMARK_IDS.actionDialogTargetResource] === Number(resourceId);
                return (
                  <SelectionTableRow
                    key={`${resourceId}`}
                    disabledRow={abundances[resourceId] === 0}
                    onClick={() => setSelection(Number(resourceId))}
                    ref={coachmarked ? setCoachmarkRef(COACHMARK_IDS.actionDialogTargetResource) : null}
                    selectedRow={selection === Number(resourceId)}>
                    <td><ResourceColorIcon category={Product.TYPES[resourceId].category} /> {Product.TYPES[resourceId].name}</td>
                    <td>{(100 * abundances[resourceId]).toFixed(1)}%</td>
                  </SelectionTableRow>
                );
              })
            }
          </tbody>
        </table>
      </SelectionTableWrapper>
    </SelectionDialog>
  );
}

const SelectionTableToggles = styled.div`
  display: flex;
  flex-direction: row;
  height: 40px;
  margin-top: -10px;
`;
const SelectionTableToggle = styled.div`
  align-items: center;
  color: #777;
  cursor: ${p => p.theme.cursors.active};
  display: flex;
  font-size: 15px;
  margin-right: 20px;
  &:hover {
    color: #888;
  }

  & > svg {
    ${p => p.isOn ? `color: ${p.theme.colors.main};` : ``}
    font-size: 125%;
    margin-right: 4px;
  }
`;

export const CoreSampleSelectionDialog = ({ lotId, options, initialSelection, onClose, onSelected, open }) => {
  const { accountCrewIds, crew } = useCrewContext();
  const [selection, setSelection] = useState(initialSelection);
  const [showForSale, setShowForSale] = useState(true);
  const [showUsed, setShowUsed] = useState(true);

  useEffect(() => {
    setSelection(initialSelection);
  }, [initialSelection]);

  const onComplete = useCallback(() => {
    onSelected(selection);
    onClose();
  }, [onClose, onSelected, selection]);

  const [forSaleExist, usedExist] = useMemo(() => {
    return [
      !!options.find((s) => s.PrivateSale?.amount > 0),
      !!options.find((s) => s.Deposit.remainingYield !== s.Deposit.initialYield),
    ];
  }, [options])

  const samples = useMemo(() => {
    return options
      .filter((s) => (showForSale || !s.PrivateSale?.amount || accountCrewIds?.includes(s.Control?.controller?.id)) && (showUsed || (s.Deposit.remainingYield === s.Deposit.initialYield)))
      .sort((a, b) => {
        // sort mine above others'
        if (accountCrewIds?.includes(a.Control?.controller?.id) !== accountCrewIds?.includes(b.Control?.controller?.id)) {
          return accountCrewIds?.includes(a.Control?.controller?.id) ? -1 : 1;
        }

        // sort by deposit size
        return b.Deposit.remainingYield - a.Deposit.remainingYield;
      })
  }, [accountCrewIds, options, showForSale, showUsed]);

  return (
    <SelectionDialog
      isCompletable={selection?.id > 0}
      onClose={onClose}
      onComplete={onComplete}
      open={open}
      title={formatters.lotName(lotId)}
      style={{ minWidth: 700 }}>
      {(usedExist || forSaleExist) && (
        <SelectionTableToggles>
          {usedExist && (
            <SelectionTableToggle isOn={showUsed} onClick={() => setShowUsed((e) => !e)}>
              {showUsed ? <CheckedIcon /> : <UncheckedIcon />}
              Show Used Deposits
            </SelectionTableToggle>
          )}
          {forSaleExist && (
            <SelectionTableToggle isOn={showForSale} onClick={() => setShowForSale((e) => !e)}>
              {showForSale ? <CheckedIcon /> : <UncheckedIcon />}
              Show For-Sale Deposits
            </SelectionTableToggle>
          )}
        </SelectionTableToggles>
      )}
      <SelectionTableWrapper>
        <table>
          <thead>
            <tr>
              <td>Resource</td>
              <td>Deposit Size</td>
              <td>Used Status</td>
              <td>Owner</td>
              <td>Price</td>
            </tr>
          </thead>
          <tbody>
            {samples.map((sample) => (
              <SelectionTableRow
                key={sample.id}
                onClick={() => setSelection(sample)}
                selectedRow={selection?.id === sample.id}
                style={{ height: 36 }}>
                <td style={{ color: theme.colors.resources[keyify(Product.TYPES[sample.Deposit.resource]?.category)] }}>
                  <CoreSampleIcon style={{ fontSize: '22px' }} /> {Product.TYPES[sample.Deposit.resource]?.name}
                </td>
                <td style={{ color: theme.colors.depositSize }}>
                  <ResourceIcon style={{ fontSize: '22px' }} /> {formatSampleMass(sample.Deposit.remainingYield * Product.TYPES[sample.Deposit.resource]?.massPerUnit, 0)}t
                </td>
                <td>
                  {sample.Deposit.remainingYield !== sample.Deposit.initialYield ? <span style={{ opacity: 0.5 }}>Used</span> : <>Unused</>}
                </td>
                <td>
                  <EntityName {...sample.Control?.controller} />
                  {accountCrewIds?.includes(sample.Control?.controller?.id) ? <label style={{ color: theme.colors.main }}> (Me)</label> : null}
                </td>
                <td>
                  {!accountCrewIds?.includes(sample.Control?.controller?.id) && sample.PrivateSale?.amount > 0
                    ? <><SwayIcon /> {formatFixed(sample.PrivateSale?.amount / 1e6, 0)}</>
                    : <span style={{ opacity: 0.5 }}>N / A</span>
                  }
                </td>
              </SelectionTableRow>
            ))}
          </tbody>
        </table>
      </SelectionTableWrapper>
    </SelectionDialog>
  );
};

export const TransferSelectionDialog = ({
  sourceEntity,
  sourceContents,
  pendingTargetDeliveries,
  targetInventory,
  targetInventoryConstraints,
  initialSelection,
  inventoryBonuses,
  onClose,
  onSelected,
  open
}) => {
  const [selection, setSelection] = useState({});

  const pendingContents = useMemo(() => {
    if (!pendingTargetDeliveries) return {};
    return (pendingTargetDeliveries || [])
      .filter((d) => d.status !== 'FINISHED')
      .reduce((acc, d) => {
        d.action.contents.forEach((c) => {
          if (!acc[c.product]) acc[c.product] = 0;
          acc[c.product] += Number(c.amount);
        })
        return acc;
      }, {});
  }, [pendingTargetDeliveries]);

  const prevInitialSelection = useRef();
  useEffect(() => {
    if (!prevInitialSelection.current || JSON.stringify(prevInitialSelection.current) !== JSON.stringify(initialSelection)) {
      setSelection({ ...initialSelection });
      prevInitialSelection.current = initialSelection;
    }
  }, [initialSelection]);

  const onComplete = useCallback(() => {
    onSelected(selection);
    onClose();
  }, [onClose, onSelected, selection]);

  const onSelectItem = useCallback((resourceId) => (selectedAmount) => {
    setSelection((currentlySelected) => {
      const updated = { ...currentlySelected };
      if (selectedAmount > 0) {
        updated[resourceId] = Math.floor(selectedAmount);
      } else {
        delete updated[resourceId];
      }
      return updated;
    });
  }, []);

  const targetInvConfig = useMemo(
    () => targetInventory ? Inventory.getType(targetInventory?.inventoryType, inventoryBonuses) : null,
    [targetInventory?.inventoryType, inventoryBonuses]
  );

  const cells = useMemo(() => [...Array(6 * Math.max(2, Math.ceil(Object.keys(sourceContents).length / 6))).keys()], [sourceContents]);
  const items = useMemo(() => {
    const productConstraints = targetInventoryConstraints || (targetInvConfig ? targetInvConfig?.productConstraints : null);

    return sourceContents.map(({ product, amount }) => {
      let maxSelectable = amount;
      if (productConstraints) {

        // non-zero means "allowed" and capped at that amount
        // zero means "allowed" but not specifically capped (other than overall mass constraint)
        let productConstraint = productConstraints[`${product}`];
        if (productConstraint !== undefined) {
          const alreadyInTarget = targetInventory?.contents.find((c) => Number(c.product) === Number(product))?.amount || 0;
          const enrouteToTarget = pendingContents?.[Number(product)] || 0;
          if (targetInvConfig && productConstraint === 0) {
            productConstraint = Math.min(
              targetInvConfig.massConstraint / Product.TYPES[product].massPerUnit,
              targetInvConfig.volumeConstraint / Product.TYPES[product].volumePerUnit
            );
          }
          maxSelectable = Math.min(Math.max(0, productConstraint - alreadyInTarget - enrouteToTarget), amount);

          // not present means not allowed
        } else {
          maxSelectable = 0;
        }
      }
      return {
        selected: selection[product],
        available: amount,
        resource: Product.TYPES[product],
        maxSelectable
      }
    });
  }, [sourceContents, targetInventory, targetInventoryConstraints, targetInvConfig, selection]);

  const { tally, totalMass, totalVolume } = useMemo(() => {
    const initialMass = (targetInventory?.mass || 0) || (targetInventory?.reservedMass || 0);
    const initialVolume = (targetInventory?.volume || 0) || (targetInventory?.reservedVolume || 0);
    return items.reduce((acc, { selected, resource }) => {
      acc.tally += selected > 0 ? 1 : 0;
      acc.totalMass += (selected || 0) * resource.massPerUnit;
      acc.totalVolume += (selected || 0) * (resource.volumePerUnit || 0);
      return acc;
    }, { tally: 0, totalMass: initialMass, totalVolume: initialVolume });
  }, [items, targetInventory?.mass, targetInventory?.reservedMass, targetInventory?.volume, targetInventory?.reservedVolume]);

  // TODO: should title be inventory type name instead?

  const [title, subtitle] = useMemo(() => {
    let title = '';
    if (sourceEntity?.Ship) {
      title = Ship.TYPES[sourceEntity.Ship.shipType || 0]?.name;
    } else if (sourceEntity?.Building) {
      title = Building.TYPES[sourceEntity.Building.buildingType || 0]?.name;
    }
    return [title, formatters.lotName(locationsArrToObj(sourceEntity?.Location?.locations || []).lotId)];
  }, [sourceEntity]);

  const overcapacity = useMemo(() => {
    if (targetInvConfig?.massConstraint && totalMass > targetInvConfig.massConstraint) return 'mass';
    if (targetInvConfig?.volumeConstraint && totalVolume > targetInvConfig.volumeConstraint) return 'volume';
    return false;
  }, [targetInvConfig, totalMass, totalVolume]);

  return (
    <SelectionDialog
      isCompletable
      onClose={onClose}
      onComplete={onComplete}
      open={open}
      title={<>{title} Inventory <b>{'> '}{subtitle}</b></>}>
      <DialogIngredientsList>
        {cells.map((i) => (
          items[i]
            ? (
              <ResourceSelection
                key={i}
                item={items[i]}
                onSelectItem={onSelectItem(items[i].resource.i)} />
            )
            : (
              <EmptyResourceImage
                key={i}
                backgroundColor="#080808"
                outlineColor="#080808"
                noIcon />
            )
        ))}
        {overcapacity
          ? (
            <IngredientSummary theming="error">
              <span>
                OVER CAPACITY: {
                  overcapacity === 'mass'
                    ? `${formatMass(totalMass)} > ${formatMass(targetInvConfig.massConstraint)}`
                    : `${formatVolume(totalVolume)} > ${formatVolume(targetInvConfig.volumeConstraint)}`
                }
              </span>
            </IngredientSummary>
          )
          : (
            tally > 0
            ? (
              <IngredientSummary>
              <span>{tally} Items: {formatMass(totalMass)} | {formatVolume(totalVolume)}</span>
              </IngredientSummary>
            )
            : (
              <IngredientSummary theming="none">
              <span>None Selected</span>
              </IngredientSummary>
            )
          )
        }
      </DialogIngredientsList>
    </SelectionDialog>
  );
};

export const LandingSelectionDialog = ({ asteroid, deliveryMode, initialSelection, onClose, onSelected, open, originLotIndex, ship }) => {
  const [error, setError] = useState();
  const [selection, setSelection] = useState(initialSelection);
  const shipConfig = Ship.TYPES[ship?.Ship?.shipType];

  const { data: lotData } = useAsteroidLotData(asteroid?.id);
  const { data: unorderedSpaceports } = useAsteroidBuildings(asteroid?.id, 'Dock', Permission.IDS.DOCK_SHIP);
  const { crew } = useCrewContext();

  const spaceports = useMemo(
    () => unorderedSpaceports
      .map((a) => {
        const { lotIndex } = locationsArrToObj(a?.Location?.locations);
        return {
          ...a,
          _lotIndex: lotIndex,
          _distance: Math.round(Asteroid.getLotDistance(asteroid?.id, originLotIndex, lotIndex))
        };
      })
      .sort((a, b) => a._distance - b._distance),
    [asteroid?.id, originLotIndex, unorderedSpaceports]
  );

  const onComplete = useCallback(() => {
    onSelected(selection);
    onClose();
  }, [onClose, onSelected, selection]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      const lot = parseInt(e.target.value);
      if (lot && lotData[lot] !== undefined) {
        const buildingType = lotData[lot] >> 4;
        if (buildingType === 0 || buildingType === Building.IDS.SPACEPORT) {
          onSelected(lot);
          onClose();
          return;
        }
      }
      setError(true);
      setTimeout(() => {
        setError(false);
      }, 4000);
    }
  }, [lotData]);

  return (
    <SelectionDialog
      isCompletable={selection > 0}
      onClose={onClose}
      onComplete={onComplete}
      open={open}
      title={`${deliveryMode ? 'Delivery' : 'Landing'} Sites`}>
      {/* TODO: isLoading */}
      {/* TODO: replace with DataTable? */}
      <div style={{ minWidth: 500 }}></div>
      {shipConfig?.landing && (
        <TextInputWithNote>
          <TextInput
            onKeyDown={handleKeyDown}
            placeholder="Specify Lot by Index..."
            type="number" />
          <TextInputNote error={!!error}>
            <WarningOutlineIcon />
            This ship may {deliveryMode ? 'be delivered to' : 'land at'} a Spaceport or Empty Lot.
          </TextInputNote>
        </TextInputWithNote>
      )}
      {spaceports?.length > 0
        ? (
          <SelectionTableWrapper>
            <table>
              <thead>
                <tr>
                  <td>Building Name</td>
                  <td>Type</td>
                  <td>Lot Id</td>
                  <td>Ground Delay</td>
                  {deliveryMode && <td>Distance</td>}
                </tr>
              </thead>
              <tbody>
                {spaceports.map((entity) => (
                  <SelectionTableRow
                    key={entity._lotIndex}
                    onClick={() => setSelection(entity._lotIndex)}
                    selectedRow={entity._lotIndex === selection}>
                    <td>{formatters.buildingName(entity)}</td>
                    <td>{Building.TYPES[entity.Building?.buildingType].name}</td>
                    <td><LocationIcon /> {formatters.lotName(entity._lotIndex)}</td>
                    <td>{formatTimer(Time.toRealDuration(entity?.Dock ? Dock.Entity.getGroundDelay(entity) : 0, crew?._timeAcceleration))}</td>
                    {deliveryMode && <td>{entity._distance} km</td>}
                  </SelectionTableRow>
                ))}
              </tbody>
            </table>
          </SelectionTableWrapper>
        )
        : <EmptyMessage>There are no available spaceports.</EmptyMessage>
      }
    </SelectionDialog>
  );
};



const ProcessSelectorIconWrapper = styled.div`
  align-items: center;
  background: rgba(${p => p.theme.colors.mainRGB}, 0.3);
  ${p => p.theme.clipCorner(sectionBodyCornerSize * 0.6)};
  display: flex;
  font-size: 40px;
  height: 50px;
  justify-content: center;
  width: 50px;
`;
const ProcessSelectorInner = styled.div`
  align-items: center;
  color: white;
  display: flex;
  flex-direction: row;
  font-size: ${p => p.height ? Math.max(14, 0.36 * (p.height - 8)) : 18}px;
  & label {
    flex: 1;
    padding-left: 10px;
  }
  & > ${ProcessSelectorIconWrapper} {
    font-size: ${p => (p.height - 8) * 0.8}px;
    height: ${p => p.height - 8}px;
    width: ${p => p.height - 8}px;
  }
`;

export const ProcessSelectionBlock = ({ height, onClick, selectedProcess, width }) => (
  <FlexSectionInputBody
    isSelected={!!onClick}
    onClick={onClick}
    style={{ padding: 4, width }}>
    <ProcessSelectorInner height={height}>
      <ProcessSelectorIconWrapper>
        <ProductionIcon />
      </ProcessSelectorIconWrapper>
      <label>{selectedProcess?.name || `Select a Process...`}</label>
      {onClick && (
        <IconButton borderless style={{ marginRight: 0 }}>
          {selectedProcess ? <CloseIcon /> : <CaretIcon />}
        </IconButton>
      )}
    </ProcessSelectorInner>
    <ClipCorner dimension={sectionBodyCornerSize} />
  </FlexSectionInputBody>
);

export const ProcessSelectionDialog = ({ initialSelection, onClose, forceProcesses, processorType, onSelected, open }) => {
  const [selection, setSelection] = useState(initialSelection);
  const [processFilter, setProcessFilter] = useState();
  const [outputFilter, setOutputFilter] = useState();

  const simulationEnabled = useSimulationEnabled();
  const setCoachmarkRef = useCoachmarkRefSetter();
  const coachmarks = useStore((s) => s.coachmarks);
  const simulationActions = useStore((s) => s.simulationActions);

  const processes = useMemo(() => {
    const unSorted = forceProcesses || Object.values(Process.TYPES).filter((p) => processorType ? p.processorType === processorType : true);
    return unSorted
      .sort((a, b) => {
        if (a.i === coachmarks[COACHMARK_IDS.actionDialogTargetProcess]) return -1;
        if (b.i === coachmarks[COACHMARK_IDS.actionDialogTargetProcess]) return 1;
        return a.name > b.name ? 1 : -1;
      })
      .map((p) => {
        if (Object.keys(p.outputs || {}).length === 0) {
          if (p.name.includes(' Construction')) {
            return { ...p, buildingOutput: Object.values(Building.TYPES).find((t) => t.name === p.name.replace(' Construction', '')) };
          }
          if (p.name.includes(' Integration')) {
            return { ...p, shipOutput: Object.values(Ship.TYPES).find((t) => t.name === p.name.replace(' Integration', '')) };
          }
        }
        return p;
      })
  }, [coachmarks, forceProcesses, processorType])

  const onComplete = useCallback(() => {
    onSelected(selection);
    onClose();
  }, [onClose, onSelected, selection]);

  const applyProcessFilter = useCallback((process) => {
    if (!processFilter && !outputFilter) return true;

    if (processFilter) {
      if (!process.name.toLowerCase().includes(processFilter.toLowerCase())) return false;
    }

    if (outputFilter) {
      const includesFilter = Object.keys(process.outputs || {}).some((output) => {
        return Product.TYPES[output]?.name.toLowerCase().includes(outputFilter.toLowerCase());
      });

      if (!includesFilter) return false;
    }

    return true;
  }, [processFilter, outputFilter]);

  const isCompletable = useMemo(() => {
    if (simulationEnabled) {
      return simulationActions.includes(`SelectProcess:${selection}`);
    }
    return selection > 0;
  }, [selection, simulationActions, simulationEnabled]);

  return (
    <SelectionDialog
      isCompletable={isCompletable}
      onClose={onClose}
      onComplete={onComplete}
      open={open}
      title={`Select Process`}
      style={{ width: '1250px', maxWidth: '90vw', minHeight: '80%' }}>
      {/* TODO: isLoading */}
      {/* TODO: replace with DataTable? */}

      <TextInput
        onChange={(e) => setProcessFilter(e.target.value)}
        placeholder="Filter by Process..."
        value={processFilter || ''}
        width={185}
        style={{ marginBottom: '10px', marginRight: '10px' }} />
      <TextInput
        onChange={(e) => setOutputFilter(e.target.value)}
        placeholder="Filter by Output..."
        value={outputFilter || ''}
        width={185}
        style={{ marginBottom: '10px' }} />
      <SelectionTableWrapper>
        <table>
          <thead>
            <tr>
              <td></td>
              <td style={{ textAlign: 'left' }}>Process Name</td>
              <td style={{ textAlign: 'left', paddingLeft: 32 }}>Inputs</td>
              {processes[0]?.outputs && <td style={{ textAlign: 'left', paddingLeft: 24 }}>Outputs</td>}
            </tr>
          </thead>
          <tbody>
            {processes.filter(applyProcessFilter).map(({ i, name, inputs, outputs, buildingOutput, shipOutput }) => {
              const coachmarked = coachmarks[COACHMARK_IDS.actionDialogTargetProcess] === i;
              return (
                <SelectionTableRow
                  key={i}
                  onClick={() => setSelection(i)}
                  ref={coachmarked ? setCoachmarkRef(COACHMARK_IDS.actionDialogTargetProcess) : undefined}
                  selectedRow={i === selection}>
                  <td style={{ fontSize: 24 }}>
                    {!(buildingOutput || shipOutput) && <ProductionIcon />}
                    {buildingOutput && <ConstructIcon />}
                    {shipOutput && <ShipIcon />}
                  </td>
                  <td style={{ textAlign: 'left', width: 400, whiteSpace: 'wrap' }}>
                    {name}
                  </td>
                  <td>
                    <InputOutputTableCell>
                      <label>{Object.keys(inputs).length}</label>
                      <div>
                        {Object.keys(inputs).map((resourceId, i) => (
                          <Fragment key={resourceId}>
                            {i === 9 && <br />}
                            <ResourceThumbnail resource={Product.TYPES[resourceId]} size="45px" tooltipContainer="selectionDialogTooltip" />
                          </Fragment>
                        ))}
                      </div>
                    </InputOutputTableCell>
                  </td>
                  {outputs && (
                    <td>
                      <InputOutputTableCell>
                        {!(buildingOutput || shipOutput) && (
                          <>
                            <label>{Object.keys(outputs).length}</label>
                            <div>
                              {Object.keys(outputs).map((resourceId) => (
                                <ResourceThumbnail key={resourceId} resource={Product.TYPES[resourceId]} size="45px" tooltipContainer="selectionDialogTooltip" />
                              ))}
                            </div>
                          </>
                        )}
                        {buildingOutput && (
                          <>
                            <label>1</label>
                            <div>
                              <BuildingImage
                                buildingType={buildingOutput.i}
                                inventory={false}
                                style={{ height: 45, width: 73 }}
                                tooltipContainer="selectionDialogTooltip" />
                            </div>
                          </>
                        )}
                        {shipOutput && (
                          <>
                            <label>1</label>
                            <div>
                              <ShipImage
                                shipType={shipOutput.i}
                                style={{ height: 45, width: 73 }}
                                tooltipContainer="selectionDialogTooltip" />
                            </div>
                          </>
                        )}
                      </InputOutputTableCell>
                    </td>
                  )}
                </SelectionTableRow>
              );
            })}
          </tbody>
        </table>
      </SelectionTableWrapper>
    </SelectionDialog>
  );
};

// TODO: should this be in sdk?
const getInventorySublabel = (inventoryType) => {
  switch (Inventory.TYPES[inventoryType]?.category) {
    case Inventory.CATEGORIES.SITE:
      return 'Site';
    case Inventory.CATEGORIES.PROPELLANT:
      return 'Propellant';
    default:
      return '';
  }
}

const PermType = styled.span`
  color: white;
  &:before {
    content: "${p => p.type}";
    ${p => p.type === 'Permitted' && `color: ${p.theme.colors.main};`}
    ${p => p.type === 'Public' && `color: ${p.theme.colors.green};`}
  }
`;
const InvType = styled.span`
  color: ${p => p.isPropellant ? p.theme.colors.purple : p.theme.colors.orange};
  margin-left: 4px;
`;
const FilterRow = styled.div`
  display: flex;
  flex-direction: row;
  padding-bottom: 12px;
  & > *:not(:first-child) {
    margin-left: 15px;
  }
`;
const FilterRowLabel = styled.label`
  align-items: center;
  color: #ccc;
  cursor: ${p => p.theme.cursors.active};
  display: flex;
  transition: color 150ms ease;
  white-space: nowrap;
  & > svg {
    color: ${p => p.isOn ? p.theme.colors.main : '#777'};
    margin-right: 6px;
  }
  &:hover {
    color: white;
  }
`;
const ItemFilterRow = styled.div`
  &:before {
    content: "Available Inventories with: ";
    opacity: 0.5;
  }
  align-items: center;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  padding-bottom: 12px;
`;
const ItemFilterLabel = styled.div`
  align-items: center;
  color: ${p => p.isOn ? p.theme.colors.green : p.theme.colors.red};
  cursor: ${p => p.theme.cursors.active};
  display: flex;
  padding: 4px 8px;
  transition: color 150ms ease;
  & > svg {
    display: none;
    margin-right: 4px;
    width: 16px;
    ${p => p.isOn
      ? `&:nth-child(1) { display: inline-block; }`
      : `&:nth-child(2) { display: inline-block; }`
    }
  }
  &:hover {
    color: white;
    & > svg {
      display: inline-block;
      ${p => p.isOn
        ? `&:nth-child(1) { display: none; }`
        : `&:nth-child(2) { display: none; }`
      }
    }
  }
`;

const StyledFilterWrapper = styled.div`
  display: flex;
  opacity: 0.5;
  & > * {
    pointer-events: none;
    &:not(:first-child) {
      margin-left: 15px;
    }
  }
`;
const FilterWrapper = ({ children, isLimited }) => {
  if (isLimited) {
    return (
      <StyledFilterWrapper
        data-tooltip-content={
          `To transfer into an inventory that your crew does not already have access to, `
          + `your crew can only transfer from an inventory it explicitly controls.`
        }
        data-tooltip-id="selectionDialogTooltip"
        data-tooltip-place="left">
        {children}
      </StyledFilterWrapper>
    );
  }
  return <>{children}</>;
}

export const InventorySelectionDialog = ({
  asteroidId,
  excludeSites,
  otherEntity,
  otherInvSlot,
  isSourcing,
  itemIds,
  itemIdsRequireAllAllowed,
  initialSelection,
  limitToControlled,
  limitToPrimary,
  onClose,
  onSelected,
  open,
  requirePresenceOfItemIds
}) => {
  const { accountCrewIds, crew } = useCrewContext();

  const simulationEnabled = useSimulationEnabled();
  const setCoachmarkRef = useCoachmarkRefSetter();
  const coachmarks = useStore(s => s.coachmarks);
  const simulationActions = useStore((s) => s.simulationActions);

  const [filterItemIds, setFilterItemIds] = useState();
  const [filterValue, setFilterValue] = useState('');
  const [selection, setSelection] = useState(initialSelection);
  const [showPermittedInventories, setShowPermittedInventories] = useState(true);
  const [showPublicInventories, setShowPublicInventories] = useState(false);
  const [sort, setSort] = useState(['distance', 'asc']);

  const otherLocation = useMemo(() => {
    if (!otherEntity) return {};
    return locationsArrToObj(otherEntity.Location?.locations || []);
  }, [otherEntity]);

  // if off the surface, cannot access inventories on the surface...
  const { data: inventoryData } = useAccessibleAsteroidInventories(otherLocation.lotIndex === 0 ? null : asteroidId, isSourcing);
  const permission = isSourcing ? Permission.IDS.REMOVE_PRODUCTS : Permission.IDS.ADD_PRODUCTS;

  // ... but can access inventories on their crewed ship (assuming not sending things elsewhere)
  const { data: crewedShip } = useShip((otherLocation.lotIndex === 0 && crew?._location?.shipId === otherLocation.shipId) ? otherLocation.shipId : null);

  const inventories = useMemo(() => {
    const allInventoryEntities = [];

    if (limitToPrimary) {
      allInventoryEntities.push(limitToPrimary);
    } else {
      if (inventoryData) allInventoryEntities.push(...inventoryData);
      if (crewedShip) allInventoryEntities.push(crewedShip);
    }

    const display = [];
    allInventoryEntities.forEach((entity) => {
      if (!entity.Inventories) return;
      entity.Inventories.forEach((inv) => {
        // (can't send to same entity and slot)
        if (otherEntity) {
          if (entity.id === otherEntity.id && entity.label === otherEntity.label) {
            if (!otherInvSlot || otherInvSlot === inv.slot) return;
          }
        }

        // filter uncontrolled if limitToControlled
        if (limitToControlled && !accountCrewIds?.includes(entity.Control.controller.id)) return;

        // skip if locked (or inventory type is 0, which should not happen but has in staging b/c of dev bugs)
        if (inv.status !== Inventory.STATUSES.AVAILABLE || inv.inventoryType === 0) return;

        // skip if site and excludeSites is set
        if (excludeSites && Inventory.TYPES[inv.inventoryType].category === Inventory.CATEGORIES.SITE) return;

        // skip if itemIds are specified and cannot contain ANY (or if itemIdsRequireAllAllowed is specified and cannot contain ALL)
        if (itemIds && Inventory.TYPES[inv.inventoryType].productConstraints) {
          const allowedMaterials = Object.keys(Inventory.TYPES[inv.inventoryType].productConstraints).map((i) => Number(i));
          if (itemIdsRequireAllAllowed && itemIds.find((i) => !allowedMaterials.includes(Number(i)))) return;
          else if (!itemIds.find((i) => allowedMaterials.includes(Number(i)))) return;
        }

        const entityLotId = entity.Location.locations.find((l) => l.label === Entity.IDS.LOT)?.id;
        const entityLotIndex = Lot.toIndex(entityLotId);

        let itemTally = 0;
        if (itemIds?.length === 1) {
          itemTally = (inv.contents || []).find((p) => p.product === Number(itemIds[0]))?.amount || 0;
        } else if (itemIds?.length) {
          itemTally = itemIds.filter((itemId) => (inv.contents || []).find((p) => p.product === Number(itemId))?.amount > 0).length;
        }

        // skip if non-primary and no items
        const nonPrimaryType = getInventorySublabel(inv.inventoryType);
        if (isSourcing && nonPrimaryType && itemIds?.length && itemTally === 0) return;

        // build contents obj for more flexible filtering
        const contentsObj = (inv.contents || []).reduce((acc, p) => {
          if (p.amount > 0) acc[p.product] = p.amount;
          return acc;
        }, {});

        // disable if !available or does not contain itemId
        display.push({
          key: JSON.stringify({ id: entity.id, label: entity.label, lotId: entityLotId, asteroidId, lotIndex: entityLotIndex, slot: inv.slot }),

          entity,
          disabled: (requirePresenceOfItemIds && !itemTally) || (isSourcing && inv.mass === 0),
          distance: Asteroid.getLotDistance(asteroidId, entityLotIndex, otherLocation.lotIndex), // distance to source + distance to destination
          isControlled: accountCrewIds?.includes(entity.Control.controller.id),
          isPermitted: !(entity.PublicPolicies || []).find((p) => p.permission === permission),

          contentsObj,
          name: entity.Ship ? formatters.shipName(entity) : formatters.buildingName(entity),
          type: entity.Ship ? Ship.TYPES[entity.Ship?.shipType]?.name : Building.TYPES[entity.Building?.buildingType]?.name,
          slot: inv.slot,
          slotLabel: getInventorySublabel(inv.inventoryType),

          lotId: entityLotId,
          lotIndex: entityLotIndex,
        })
      });
    });

    return display;
  }, [crewedShip, inventoryData, itemIds, otherLocation, sort]);

  const onComplete = useCallback(() => {
    onSelected(selection ? JSON.parse(selection) : null);
    onClose();
  }, [onClose, onSelected, selection]);

  const specifiedItems = !!filterItemIds;
  const soloItem = itemIds?.length === 1 ? itemIds[0] : null;

  const columns = useMemo(() => {
    const useItemAmount = Object.values(filterItemIds || {}).filter((x) => !!x).length === 1
      ? Object.keys(filterItemIds).find((k) => filterItemIds[k])
      : false;
    return [
      {
        key: 'isMine',
        label: <span style={{ fontSize: '16px' }}><MyAssetIcon /></span>,
        selector: (row) => row.isControlled ? <MyAssetIcon /> : null,
        noMinWidth: true,
      },
      {
        key: 'name',
        label: 'Name',
        sortField: 'name',
        selector: (row) => <div style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</div>,
        noMinWidth: true,
      },
      (
        limitToPrimary
          ? null
          : {
            key: 'distance',
            label: 'Distance',
            sortField: 'distance',
            selector: (row) => formatSurfaceDistance(row.distance),
            noMinWidth: true,
          }
      ),
      {
        key: 'type',
        label: 'Type',
        sortField: 'type',
        selector: (row) => (
          <>
            {row.type} {row.slotLabel && <InvType isPropellant={row.slotLabel === 'Propellant'}>({row.slotLabel})</InvType>}
          </>
        ),
        noMinWidth: true,
      },
      {
        key: 'permission',
        label: 'Permission',
        sortField: 'isControlled',
        selector: (row) => <PermType type={row.isControlled ? 'Controller' : (row.isPermitted ? 'Permitted' : 'Public')}></PermType>,
        noMinWidth: true,
      },
      (
        isSourcing && specifiedItems
          ? {
            key: 'itemTally',
            label: <span style={{ fontSize: '16px' }}>{useItemAmount ? `#` : <CheckSmallIcon />}</span>,
            // sortField: 'itemTally',
            align: 'center',
            noMinWidth: true,
            selector: (row) => (
              useItemAmount
                ? formatResourceAmount(row.filteredItemAmount || 0, useItemAmount)
                : (
                  <div
                    data-tooltip-content={row.filteredItemString}
                    data-tooltip-id="selectionDialogTooltip"
                    data-tooltip-place="left">
                    {row.filteredItemTally.toLocaleString()}
                  </div>
                )
            ),
            noMinWidth: true,
          }
          : null
      ),
    ].filter((x) => !!x);
  }, [filterItemIds, isSourcing, limitToPrimary, specifiedItems]);

  const handleSort = useCallback((field) => () => {
    if (!field) return;

    let [updatedSortField, updatedSortDirection] = sort;
    if (field === sort[0]) {
      updatedSortDirection = sort[1] === 'desc' ? 'asc' : 'desc';
    } else {
      updatedSortField = field;
      updatedSortDirection = 'desc';
    }

    setSort([updatedSortField, updatedSortDirection]);
  }, [sort]);

  const getRowProps = useCallback((row) => {
    const coachmarked = coachmarks[COACHMARK_IDS.actionDialogTargetInventory] === `${row.entity.label}.${row.entity.id}.${row.slot}`;
    return {
      setRef: coachmarked ? setCoachmarkRef(COACHMARK_IDS.actionDialogTargetInventory) : null,
      disable: row.disabled,
      onClick: () => setSelection(row.key),
      isSelected: (selection === row.key),
    };
  }, [selection, coachmarks, setCoachmarkRef]);

  const handleFilterChange = useCallback((e) => {
    setFilterValue(e.target.value);
  }, []);

  useEffect(() => {
    setFilterItemIds(
      itemIds?.length
      ? itemIds
        .sort((a, b) => Product.TYPES[a].name < Product.TYPES[b].name ? -1 : 1)
        .reduce((acc, k) => ({ ...acc, [k]: true }), {})
      : null
    );
  }, [itemIds]);

  const toggleFilterItem = useCallback((itemId) => {
    setFilterItemIds((x) => ({ ...x, [itemId]: !x[itemId] }));
  }, []);

  const filteredInventories = useMemo(() => {
    const filterProductIds = isSourcing ? Object.keys(filterItemIds || {}).filter((k) => filterItemIds[k]) : [];
    return inventories
      .map((inv) => {
        const productIdsInInv = filterProductIds.filter((k) => !!inv.contentsObj[k]);
        return {
          ...inv,
          filteredItemAmount: filterProductIds?.length === 1
            ? (inv.contentsObj[filterProductIds[0]] || 0)
            : null,
          filteredItemTally: productIdsInInv.length,
          // TODO: this might be better as a mouseover that could show the full inventory
          //  just like the inventory contents appearance in the hud menu
          filteredItemString: (
            productIdsInInv
              .map((i) => `${Product.TYPES[i]?.name} (${formatResourceAmount(inv.contentsObj[i] || 0, i)})`)
              .sort()
              .join(', ')
          )
        };
      })
      .filter((inv) => {
        if (inv.disabled) return false;
        if (filterValue) {
          const lcFilterValue = (filterValue || '').toLowerCase();
          if (!inv.name.toLowerCase().includes(lcFilterValue)) return false;
        }
        if (!showPermittedInventories && !inv.isControlled && inv.isPermitted) return false;
        if (!showPublicInventories && !inv.isControlled && !inv.isPermitted) return false;
        if (filterProductIds?.length > 0 && inv.filteredItemTally === 0) return false;
        return true;
      })
      .sort((a, b) => (sort[1] === 'desc' ? -1 : 1) * (a[sort[0]] < b[sort[0]] ? -1 : 1));
  }, [filterItemIds, filterValue, inventories, isSourcing, showPermittedInventories, showPublicInventories, sort]);

  const isCompletable = useMemo(() => {
    if (selection && simulationEnabled) {
      const selObj = inventories.find((i) => i.key === selection);
      return simulationActions.includes(`SelectInventory:${selObj?.entity?.label}.${selObj?.entity?.id}.${selObj?.slot}`);
    }
    return !!selection;
  }, [selection, simulationEnabled, simulationActions])

  return (
    <SelectionDialog
      isCompletable={isCompletable}
      onClose={onClose}
      onComplete={onComplete}
      open={open}
      style={{ width: 820, maxWidth: 820 }}
      title={isSourcing && soloItem
        ? `Available ${Product.TYPES[soloItem].name}s`
        : 'Available Inventories'}>
      {/* TODO: isLoading */}
      <FilterRow>
        <div>
          <TextInput
            onChange={handleFilterChange}
            placeholder="Filter by Name..."
            value={filterValue || ''}
            width={185} />
        </div>

        {isSourcing && !itemIds && (
          <div>
            <StaticAutocomplete
              labelKey="name"
              footnoteKey="category"
              onSelect={(value) => {
                const itemId = value?.i;
                if (itemId) {
                  setFilterItemIds((x) => ({ ...x, [value?.i]: true }))
                }
              }}
              options={Object.values(Product.TYPES)}
              placeholder="Filter by Contents..."
              valueKey="i"
              width={185}
            />
          </div>
        )}

        <div style={{ flex: 1 }} />

        {!simulationEnabled && (
          <FilterWrapper isLimited={limitToControlled}>
            <FilterRowLabel isOn={!limitToControlled && showPermittedInventories} onClick={() => setShowPermittedInventories((p) => !p)}>
              {!limitToControlled && showPermittedInventories ? <CheckedIcon /> : <UncheckedIcon />}
              <span>Permitted Inventories</span>
            </FilterRowLabel>

            <FilterRowLabel isOn={!limitToControlled && showPublicInventories} onClick={() => setShowPublicInventories((p) => !p)}>
              {!limitToControlled && showPublicInventories ? <CheckedIcon /> : <UncheckedIcon />}
              <span>Public Inventories</span>
            </FilterRowLabel>
          </FilterWrapper>
        )}
      </FilterRow>

      {isSourcing && filterItemIds && (
        <ItemFilterRow>
          {Object.keys(filterItemIds)
            .sort((a, b) => Product.TYPES[a]?.name < Product.TYPES[b]?.name ? -1 : 1)
            .map((itemId) => (
            <ItemFilterLabel key={itemId} isOn={filterItemIds[itemId]} onClick={() => toggleFilterItem(itemId)}>
              <CheckSmallIcon />
              <CloseIcon />
              <span>{Product.TYPES[itemId].name}</span>
            </ItemFilterLabel>
          ))}
        </ItemFilterRow>
      )}

      {inventories.length > 0
        ? (
          <InvSelectionTableWrapper>
            <DataTableComponent
              columns={columns}
              data={filteredInventories}
              getRowProps={getRowProps}
              keyField="key"
              onClickColumn={handleSort}
              sortDirection={sort[1]}
              sortField={sort[0]}
            />
          </InvSelectionTableWrapper>
        )
        : (
          requirePresenceOfItemIds
          ? <EmptyMessage>You have no accessible inventories with these items on this asteroid.</EmptyMessage>
          : <EmptyMessage>You have no {otherEntity ? 'other ' : ''}available inventories on this asteroid.</EmptyMessage>
        )
      }
    </SelectionDialog>
  );
};

export const ShoppingListPriceField = styled.div`
  align-items: center;
  display: flex;
  & > div {
    align-items: center;
    display: flex;
    margin-right: 10px;
    min-width: 100px;
    & > div:last-child {
      flex: 1;
      font-family: 'Jetbrains Mono', sans-serif;
      text-align: right;
    }
  }
  & > small {
    opacity: 0.5;
  }
`;

const ShoppingListIconWrapper = styled.div`
  color: white;
  font-size: 22px;
  margin-right: 4px;
`;

const ShoppingListDataTableWrapper = styled.div`
  background: black;
  margin: 0px 10px 10px;
  max-height: 300px;
  overflow: auto;
  & > table {
    width: 100%;
  }
`;

export const LiquidityWarning = () => (
  <span style={{ color: theme.colors.warning, display: 'inline-block', marginLeft: 5, marginTop: -2 }}
    data-tooltip-content='Limited Supply'
    data-tooltip-id='actionDialogTooltip'
    data-tooltip-place='top'>
    <WarningIcon />
  </span>
);

const OrderSelectionTable = ({ orders, productId, onSelected, selected }) => {
  const [sort, setSort] = useState(['_adjUnitPrice', 'desc']);
  const [sortField, sortDirection] = sort;

  const getRowProps = useCallback((row) => ({
    onClick: () => {
      onSelected(row);
    },
    selectedColorRGB: `128, 128, 128`,
    isSelected: selected?._orderPath === row._orderPath,
    tableState: { resource: Product.TYPES[productId] }
  }), [onSelected, productId, selected]);

  const handleSort = useCallback((field) => () => {
    if (!field) return;

    let updatedSortField = sortField;
    let updatedSortDirection = sortDirection;
    if (field === sortField) {
      updatedSortDirection = sortDirection === 'desc' ? 'asc' : 'desc';
    } else {
      updatedSortField = field;
      updatedSortDirection = 'desc';
    }

    setSort([
      updatedSortField,
      updatedSortDirection
    ]);
  }, [sortDirection, sortField]);

  const sortedOrders = useMemo(() => {
    return (orders || [])
      .sort((a, b) => (sortDirection === 'asc' ? 1 : -1) * (a[sortField] < b[sortField] ? 1 : -1));
  }, [orders, sortField, sortDirection]);

  const columns = useMemo(() => ([
    {
      key: 'selector',
      label: <MarketBuyIcon />,
      selector: (row, { isSelected }) => (
        <span style={{ fontSize: '120%', lineHeight: '0' }}>
          {isSelected ? <CheckedIcon style={{ color: theme.colors.brightMain }} /> : <UncheckedIcon />}
        </span>
      ),
      align: 'center',
      isIconColumn: true,
      noMinWidth: true,
    },
    {
      key: 'marketplaceName',
      label: 'Marketplace',
      selector: (row, { tableState }) => (
        <span><EntityName {...row.entity} /></span>
      ),
      noMinWidth: true,
    },
    {
      key: 'distance',
      label: 'Distance',
      sortField: '_exchangeDistance',
      alignBody: 'right',
      selector: row => <Monospace>{formatFixed(row._exchangeDistance, 1, 1)} km</Monospace>,
      noMinWidth: true,
    },
    {
      key: 'amount',
      label: 'Amount',
      sortField: 'fillAmount',
      alignBody: 'right',
      selector: (row, { tableState }) => (
        <>
          <Monospace>{row.fillAmount.toLocaleString()}{tableState.resource.isAtomic ? '' : ' kg'}</Monospace>
          {row._isPartial && <LiquidityWarning />}
        </>
      ),
      noMinWidth: true,
    },
    {
      key: 'price',
      label: <><span>Unit Price</span> <small style={{ marginLeft: 4 }}>(incl. fees)</small></>,
      sortField: '_adjUnitPrice',
      alignBody: 'right',
      selector: (row, { tableState }) => (
        <ShoppingListPriceField>
          <div>
            <ShoppingListIconWrapper><SwayIcon /></ShoppingListIconWrapper>
            <div>{(row._adjUnitPrice / TOKEN_SCALE[TOKEN.SWAY]).toLocaleString(undefined, { maximumFractionDigits: 4, minimumFractionDigits: 4 })}</div>
          </div>
        </ShoppingListPriceField>
      ),
      noMinWidth: true,
    }
  ]), []);

  return (
    <ShoppingListDataTableWrapper>
      <DataTableComponent
        columns={columns}
        data={sortedOrders || []}
        getRowProps={getRowProps}
        keyField="orderPath"
        onClickColumn={handleSort}
        sortDirection={sortDirection}
        sortField={sortField}
      />
    </ShoppingListDataTableWrapper>
  );
};

export const OrderSelectionDialog = ({
  asteroidId,
  otherEntity,
  maxAmount,
  onClose,
  onCompleted,
  open,
  productId
}) => {
  const { crew } = useCrewContext();
  const { data: swayBalance } = useSwayBalance();

  const [selected, setSelected] = useState();
  const [targetAmount, setTargetAmount] = useState(maxAmount || 0);

  const destinationLocation = useMemo(() => {
    if (!otherEntity) return {};
    return locationsArrToObj(otherEntity.Location?.locations || []);
  }, [otherEntity]);
  const destLotId = destinationLocation?.lotId;

  const crewBonuses = useMemo(() => {
    if (!crew) return {};

    const abilities = getCrewAbilityBonuses([
      Crewmate.ABILITY_IDS.HOPPER_TRANSPORT_TIME,
      Crewmate.ABILITY_IDS.FREE_TRANSPORT_DISTANCE,
      Crewmate.ABILITY_IDS.MARKETPLACE_FEE_REDUCTION,
    ], crew);
    return {
      hopperTransport: abilities[Crewmate.ABILITY_IDS.HOPPER_TRANSPORT_TIME],
      freeTransport: abilities[Crewmate.ABILITY_IDS.FREE_TRANSPORT_DISTANCE],
      feeReduction: abilities[Crewmate.ABILITY_IDS.MARKETPLACE_FEE_REDUCTION],
    }
  }, [crew]);

  const {
    data: resourceMarketplaces,
    dataUpdatedAt: resourceMarketplacesUpdatedAt,
    isLoading: resourceMarketplacesLoading,
    refetch: refetchResourceMarketplaces
  } = useShoppingListData(asteroidId, destLotId, [productId]);
  const exchanges = useMemo(() => resourceMarketplaces?.[productId] || [], [resourceMarketplacesUpdatedAt]);

  useInterval(() => { refetchResourceMarketplaces(); }, 60e3); // keep things loosely fresh

  const orders = useMemo(() => {
    return exchanges.reduce((aggOrders, row) => {
      const exchangeDistance = Asteroid.getLotDistance(asteroidId, Lot.toIndex(row.lotId), Lot.toIndex(destLotId));
      const exchangeTravelTime = Time.toRealDuration(
        Asteroid.getLotTravelTime(
          asteroidId, Lot.toIndex(row.lotId), Lot.toIndex(destLotId), crewBonuses?.hopperTransport.totalBonus, crewBonuses?.freeTransport.totalBonus
        ),
        crew?._timeAcceleration
      );

      let largestExchangeFill = -1;
      row.orders
        .map((order) => {
          const fills = ordersToFills(
            'buy',
            [order],
            targetAmount,
            row.marketplace?.Exchange?.takerFee || 0,
            crewBonuses?.feeReduction?.totalBonus || 1,
            row.feeEnforcement || 1,
          );

          const fill = fills[0];
          fill.price = fill.price * TOKEN_SCALE[TOKEN.SWAY];
          return {
            _orderPath: `${fill.crew.uuid}.${fill.entity.uuid}.${fill.orderType}.${fill.product}.${fill.price}.${fill.storage.uuid}.${fill.storageSlot}`,
            _adjUnitPrice: fill.fillPaymentTotal / fill.fillAmount,
            _exchangeDistance: exchangeDistance,
            _exchangeTravelTime: exchangeTravelTime,
            _isPartial: fill.fillAmount < targetAmount,
            ...fill,
          };
        })

        .sort((a, b) => a._adjUnitPrice - b._adjUnitPrice)

        // only include orders that are larger or cheaper than what is in list
        // (since ordered from cheapest to most expensive, just include any that are larger than largest)
        .reduce((acc2, cur) => {
          if (cur.fillAmount > largestExchangeFill) {
            largestExchangeFill = cur.fillAmount;
            acc2.push(cur);
          }
          return acc2;
        }, [])

        .forEach((order) => {
          aggOrders.push(order);
        });
        
      return aggOrders;
    }, []);
  }, [asteroidId, crew?._timeAcceleration, crewBonuses, destLotId, exchanges, targetAmount]);

  useEffect(() => {
    setSelected();
  }, [targetAmount]);

  const insufficientSway = useMemo(() => selected?.fillPaymentTotal > swayBalance, [selected, swayBalance]);

  const isCompletable = useMemo(() => selected && !insufficientSway, [insufficientSway, selected]);

  const onSelected = useCallback((order) => {
    setSelected((old) => old?._orderPath === order._orderPath ? undefined : order);
  }, []);

  const onComplete = useCallback(() => {
    if (isCompletable) {
      onCompleted(selected);
      onClose();
    }
  }, [isCompletable, onClose, onCompleted, selected]);

  return (
    <SelectionDialog
      isCompletable={isCompletable}
      onClose={onClose}
      onComplete={onComplete}
      open={open}
      style={{ width: 820, maxWidth: 820 }}
      title="Available Sell Orders">
      {!resourceMarketplaces && (
        <div style={{ height: 250 }}><PageLoader /></div>
      )}
      {resourceMarketplaces && (
        <>
          {orders?.length > 0
            ? (
              <>
                <div style={{ padding: '0 5px 12px' }}>
                  <div style={{ fontSize: '90%', opacity: 0.5, marginBottom: 4, marginLeft: 4, textTransform: 'uppercase' }}>Target Purchase Amount</div>
                  <div style={{ background: '#181818', padding: '10px 15px' }}>
                    <ResourceAmountSlider
                      amount={targetAmount || 0}
                      min={1}
                      max={maxAmount}
                      resource={Product.TYPES[productId]}
                      setAmount={setTargetAmount} />
                  </div>
                </div>

                <OrderSelectionTable
                  onSelected={onSelected}
                  orders={orders}
                  productId={productId}
                  selected={selected}
                />

                <hr style={{ borderColor, borderStyle: 'solid', borderWidth: '1px 0 0' }} />

                <OrderAlert mode="buy" insufficientAssets={reactBool(insufficientSway)}>
                  <div>
                    <div style={{ flex: 1 }}>
                      <div><b>Market Buy</b></div>
                      <div>
                        {formatResourceMass(selected?.fillAmount || 0, productId)}
                        {' '}{Product.TYPES[productId].name}
                      </div>
                    </div>
                    <div style={{ alignItems: 'flex-end', display: 'flex' }}>
                      <b>Total</b>
                      <span style={{ display: 'inline-flex', fontSize: '36px', lineHeight: '36px' }}>
                        <SwayIcon /><TotalSway>-{formatFixed(selected?.fillPaymentTotal / TOKEN_SCALE[TOKEN.SWAY] || 0)}</TotalSway>
                      </span>
                    </div>
                  </div>
                </OrderAlert>
              </>
            )
            : (
              <EmptyMessage>There are no {Product.TYPES[productId].name} sell orders available to you on this asteroid.</EmptyMessage>
            )
          }
        </>
      )}
    </SelectionDialog>
  );
}

export const ExchangeSelectionDialog = ({
  asteroidId,
  otherEntity,
  isSourcing,
  initialSelection,
  maxAmount,
  onClose,
  onCompleted,
  open,
  productId,
  singleSelectionMode
}) => {
  const { crew } = useCrewContext();
  const { data: swayBalance } = useSwayBalance();

  const [selected, setSelected] = useState([]);
  const [targetAmount, setTargetAmount] = useState(maxAmount || 0);

  const destinationLocation = useMemo(() => {
    if (!otherEntity) return {};
    return locationsArrToObj(otherEntity.Location?.locations || []);
  }, [otherEntity]);
  const destLotId = destinationLocation?.lotId;

  const {
    data: resourceMarketplaces,
    dataUpdatedAt: resourceMarketplacesUpdatedAt,
    isLoading: resourceMarketplacesLoading,
    refetch: refetchResourceMarketplaces
  } = useShoppingListData(asteroidId, destLotId, [productId]);
  const exchanges = useMemo(() => resourceMarketplaces?.[productId] || [], [resourceMarketplacesUpdatedAt]);

  useInterval(() => { refetchResourceMarketplaces(); }, 60e3); // keep things loosely fresh

  const crewBonuses = useMemo(() => {
    if (!crew) return {};

    const abilities = getCrewAbilityBonuses([
      Crewmate.ABILITY_IDS.HOPPER_TRANSPORT_TIME,
      Crewmate.ABILITY_IDS.FREE_TRANSPORT_DISTANCE,
      Crewmate.ABILITY_IDS.MARKETPLACE_FEE_REDUCTION,
    ], crew);
    return {
      hopperTransport: abilities[Crewmate.ABILITY_IDS.HOPPER_TRANSPORT_TIME],
      freeTransport: abilities[Crewmate.ABILITY_IDS.FREE_TRANSPORT_DISTANCE],
      feeReduction: abilities[Crewmate.ABILITY_IDS.MARKETPLACE_FEE_REDUCTION],
    }
  }, [crew]);

  const selectionSummary = useMemo(() => {
    let needed = targetAmount;
    let totalPrice = 0;
    let maxTravelTime = 0;
    const allFills = [];
    const selectedAmounts = {};

    selected
      .map((buildingId) => resourceMarketplaces[productId].find((m) => m.buildingId === buildingId))
      .sort((a, b) => a.supply - b.supply)
      .forEach((row) => {
        selectedAmounts[row.buildingId] = 0;
        maxTravelTime = Math.max(
          maxTravelTime,
          Time.toRealDuration(
            Asteroid.getLotTravelTime(
              asteroidId, Lot.toIndex(row.lotId), Lot.toIndex(destLotId), crewBonuses?.hopperTransport.totalBonus, crewBonuses?.freeTransport.totalBonus
            ),
            crew?._timeAcceleration
          )
        );

        const fills = ordersToFills(
          'buy',
          row.orders,
          needed,
          row.marketplace?.Exchange?.takerFee || 0,
          crewBonuses?.feeReduction?.totalBonus || 1,
          row.feeEnforcement || 1,
        );

        fills.forEach((fill) => {
          selectedAmounts[row.buildingId] += fill.fillAmount;
          needed -= fill.fillAmount;
          totalPrice += fill.fillPaymentTotal;
        });

        allFills.push(...fills);
      });

    return {
      needed,
      maxTravelTime,
      totalPrice: totalPrice / TOKEN_SCALE[TOKEN.SWAY],
      totalFilled: targetAmount - needed,
      fills: allFills,
      amounts: selectedAmounts
    };
  }, [selected, targetAmount]);

  const insufficientSway = useMemo(() => selectionSummary.totalPrice * TOKEN_SCALE[TOKEN.SWAY] > swayBalance, [selectionSummary, swayBalance]);

  const isCompletable = useMemo(() => selectionSummary.totalFilled > 0 && !insufficientSway, [insufficientSway, selectionSummary]);

  const onSelected = useCallback((buildingId) => {
    if (singleSelectionMode) {
      setSelected((old) => old.includes(buildingId) ? [] : [buildingId]);
    } else {
      setSelected((old) => {
        // if already toggled, untoggle
        if (old.includes(buildingId)) {
          return old.filter((b) => b !== buildingId);

        // if already filled, clear all --> select this one
        } else if (selectionSummary.needed === 0) {
          return [buildingId];

        // else, add this one
        } else {
          return [...old, buildingId];
        }
      });
    }
  }, [selectionSummary, singleSelectionMode]);

  const onComplete = useCallback(() => {
    if (isCompletable) {
      onCompleted(selectionSummary);
      onClose();
    }
  }, [isCompletable, onClose, onCompleted, selectionSummary]);

  return (
    <SelectionDialog
      isCompletable={isCompletable}
      onClose={onClose}
      onComplete={onComplete}
      open={open}
      style={{ width: 820, maxWidth: 820 }}
      title="Available Marketplaces">
      {resourceMarketplacesLoading && (
        <div style={{ height: 250 }}><PageLoader /></div>
      )}
      {!resourceMarketplacesLoading && (
        <>
          {exchanges?.length > 0
            ? (
              <>
                <div style={{ padding: '0 5px 12px' }}>
                  <div style={{ fontSize: '90%', opacity: 0.5, marginBottom: 4, marginLeft: 4, textTransform: 'uppercase' }}>Purchase Amount</div>
                  <div style={{ background: '#181818', padding: '10px 15px' }}>
                    <ResourceAmountSlider
                      amount={targetAmount || 0}
                      min={1}
                      max={maxAmount}
                      resource={Product.TYPES[productId]}
                      setAmount={setTargetAmount} />
                  </div>
                </div>

                <ProductMarketSummary
                  crewBonuses={crewBonuses}
                  productId={productId}
                  resourceMarketplaces={exchanges}
                  selected={selected}
                  selectionSummary={selectionSummary}
                  onSelected={onSelected}
                  targetAmount={targetAmount}
                />

                <hr style={{ borderColor, borderStyle: 'solid', borderWidth: '1px 0 0' }} />

                <OrderAlert mode="buy" insufficientAssets={reactBool(insufficientSway)}>
                  <div>
                    <div style={{ flex: 1 }}>
                      <div><b>Market Buy</b></div>
                      <div>
                        {formatResourceMass(selectionSummary?.totalFilled || 0, productId)}
                        {' '}{Product.TYPES[productId].name}
                      </div>
                    </div>
                    <div style={{ alignItems: 'flex-end', display: 'flex' }}>
                      <b>Total</b>
                      <span style={{ display: 'inline-flex', fontSize: '36px', lineHeight: '36px' }}>
                        <SwayIcon /><TotalSway>-{formatFixed(selectionSummary?.totalPrice || 0)}</TotalSway>
                      </span>
                    </div>
                  </div>
                </OrderAlert>
              </>
            )
            : (
              <EmptyMessage>There are no {Product.TYPES[productId].name}-stocked marketplaces available to you on this asteroid.</EmptyMessage>
            )
          }
        </>
      )}
    </SelectionDialog>
  );
}

//
//  FORMATTERS
//

export const getCapacityStats = (inventory, inventoryBonuses) => {
  const capacity = {
    mass: { max: 0, used: 0, reserved: 0 },
    volume: { max: 0, used: 0, reserved: 0 },
  }
  if (inventory?.status === Inventory.STATUSES.AVAILABLE) {
    const { filledMass, filledVolume } = Inventory.getFilledCapacity(inventory.inventoryType, inventoryBonuses);
    const inventoryConfig = Inventory.getType(inventory.inventoryType, inventoryBonuses);
    capacity.mass.max = filledMass;
    capacity.mass.isSoftMax = inventoryConfig?.massConstraint === Infinity;
    capacity.volume.max = filledVolume;
    capacity.volume.isSoftMax = inventoryConfig?.volumeConstraint === Infinity;

    const { reservedMass, reservedVolume, mass, volume } = inventory || {};
    capacity.mass.used = (mass || 0);
    capacity.mass.reserved = (reservedMass || 0);
    capacity.volume.used = (volume || 0);
    capacity.volume.reserved = (reservedVolume || 0);
  }
  return capacity;
}

export const getCapacityUsage = (inventories, type, inventoryBonuses) => {
  return getCapacityStats((inventories || []).find((i) => i.inventoryType === type), inventoryBonuses);
}

export const getRecipeRequirements = (inputsObj, inventory = null, recipeTally = 1, deliveryActions = []) => {
  return Object.keys(inputsObj).map((productId) => {
    const totalRequired = inputsObj[productId] * recipeTally;
    const inInventory = (inventory?.contents || []).find((c) => Number(c.product) === Number(productId))?.amount || 0;
    const inTransit = deliveryActions
      .filter((d) => !['FINISHED','CANCELING','PACKAGED'].includes(d.status))
      .reduce((acc, d) => acc + ((d.action.contents.find((c) => Number(c.product) === Number(productId))?.amount) || 0), 0);
    return {
      i: productId,
      totalRequired,
      inInventory,
      inTransit,
      inNeed: Math.max(0, totalRequired - inInventory - inTransit)
    };
  })
}

export const getBuildingRequirements = (building, deliveryActions = []) => {
  return getRecipeRequirements(
    Building.CONSTRUCTION_TYPES[building?.Building?.buildingType]?.requirements || {},
    (building?.Inventories || []).find((i) => i.status === Inventory.STATUSES.AVAILABLE), // TODO: should this be slot?
    1,
    deliveryActions
  );
};

export const getBuildingRequirementsMet = (building, deliveryActions = []) => {
  return getBuildingRequirements(building, deliveryActions).reduce((acc, { inNeed }) => acc && (inNeed === 0), true);
};


//
// SUB-COMPONENTS
//

export const AsteroidImage = ({ asteroid, size }) => {
  return (
    <AsteroidThumbnailWrapper size={size}>
      <AsteroidRendering asteroid={asteroid} brightness={1.2} />
      <ClipCorner dimension={10} />
    </AsteroidThumbnailWrapper>
  )
}

export const ShipImage = ({ shipType, iconBadge, iconBadgeColor, iconOverlay, iconOverlayColor, inventories, inventoryBonuses, showInventoryStatusForType, simulated, size = 'w150', backgroundSize = 'cover', style = {} }) => {
  const shipAsset = Ship.TYPES[Math.abs(shipType)]; // abs for simulated ships
  if (!shipAsset) return null;

  const capacity = getCapacityUsage(inventories, showInventoryStatusForType, inventoryBonuses);
  return (
    <ShipThumbnailWrapper style={style}>
      <ResourceImage src={getShipIcon(shipAsset.i, size, simulated)} style={{ backgroundSize }} />
      {showInventoryStatusForType !== undefined && (
        <>
          <InventoryUtilization
            progress={capacity.volume.used / capacity.volume.max}
            secondaryProgress={(capacity.volume.reserved + capacity.volume.used) / capacity.volume.max}
          />
          <InventoryUtilization
            progress={capacity.mass.used / capacity.mass.max}
            secondaryProgress={(capacity.mass.reserved + capacity.mass.used) / capacity.mass.max}
          />
        </>
      )}
      {iconBadge && <ThumbnailBadge style={{ color: iconBadgeColor || 'white' }}>{iconBadge}</ThumbnailBadge>}
      {iconOverlay && <ThumbnailOverlay color={iconOverlayColor}>{iconOverlay}</ThumbnailOverlay>}
      <ClipCorner dimension={10} />
    </ShipThumbnailWrapper>
  );
};

export const LotShipImage = ({ shipType, iconBadge, iconBadgeColor, iconOverlay, iconOverlayColor, inventories, inventoryBonuses, showInventoryStatusForType, size = 'w150', backgroundSize = 'cover', style = {} }) => {
  const shipAsset = Ship.TYPES[Math.abs(shipType)]; // abs for simulated ships
  if (!shipAsset) return null;

  const capacity = getCapacityUsage(inventories, showInventoryStatusForType, inventoryBonuses);
  return (
    <ShipThumbnailWrapper style={style}>
      <ResourceImage src={getLotShipIcon(shipAsset.i, size)} style={{ backgroundSize }} />
      {showInventoryStatusForType !== undefined && (
        <>
          <InventoryUtilization
            progress={capacity.volume.used / capacity.volume.max}
            secondaryProgress={(capacity.volume.reserved + capacity.volume.used) / capacity.volume.max}
          />
          <InventoryUtilization
            progress={capacity.mass.used / capacity.mass.max}
            secondaryProgress={(capacity.mass.reserved + capacity.mass.used) / capacity.mass.max}
          />
        </>
      )}
      {iconBadge && <ThumbnailBadge style={{ color: iconBadgeColor || 'white' }}>{iconBadge}</ThumbnailBadge>}
      {iconOverlay && <ThumbnailOverlay color={iconOverlayColor}>{iconOverlay}</ThumbnailOverlay>}
      <ClipCorner dimension={10} />
    </ShipThumbnailWrapper>
  );
};

export const BuildingImage = ({
  bottomBanner,
  buildingType,
  error,
  iconBadge,
  iconBadgeCorner,
  iconOverlay,
  iconOverlayColor,
  iconBorderColor,
  inventory,
  inventoryBonuses,
  inventories,
  showInventoryStatusForType,
  style,
  unfinished
}) => {
  const buildingAsset = Building.TYPES[buildingType];
  if (!buildingAsset) return null;

  const capacity = inventory ? getCapacityStats(inventory, inventoryBonuses) : getCapacityUsage(inventories, showInventoryStatusForType, inventoryBonuses);
  const closerLimit = (capacity.volume.used + capacity.volume.reserved) / capacity.volume.max > (capacity.mass.used + capacity.mass.reserved) / capacity.mass.max ? 'volume' : 'mass';
  return (
    <BuildingThumbnailWrapper outlineColor={iconBorderColor} style={style}>
      <ResourceImage src={getBuildingIcon(buildingAsset.i, 'w150', unfinished)} />
      {inventory !== false && (capacity?.mass?.max || capacity?.mass?.volume) && (
        <>
          <InventoryLabel overloaded={error}>
            {formatFixed(100 * (capacity[closerLimit].reserved + capacity[closerLimit].used) / capacity[closerLimit].max, 1)}% {/*closerLimit === 'volume' ? `m³` : `t`*/}
          </InventoryLabel>
          <InventoryUtilization
            horizontal
            overloaded={error}
            progress={capacity[closerLimit].used / capacity[closerLimit].max}
            secondaryProgress={(capacity[closerLimit].reserved + capacity[closerLimit].used) / capacity[closerLimit].max} />
        </>
      )}
      {iconBadge !== undefined && <ThumbnailIconBadge iconBadgeCorner={iconBadgeCorner}>{iconBadge}</ThumbnailIconBadge>}
      {iconOverlay && <ThumbnailOverlay color={iconOverlayColor}>{iconOverlay}</ThumbnailOverlay>}
      {bottomBanner && <ThumbnailBottomBanner>{bottomBanner}</ThumbnailBottomBanner>}
      <ClipCorner dimension={10} color={iconBorderColor} />
    </BuildingThumbnailWrapper>
  );
};

export const EmptyBuildingImage = ({ iconOverride, iconStyle, ...props }) => (
  <BuildingThumbnailWrapper {...props}>
    <EmptyThumbnail style={iconStyle}>{iconOverride || <LocationIcon />}</EmptyThumbnail>
    <ClipCorner dimension={10} />
  </BuildingThumbnailWrapper>
);

export const EmptyResourceImage = ({ iconOverride, iconStyle, noIcon, ...props }) => (
  <ResourceThumbnailWrapper {...props}>
    <EmptyThumbnail style={iconStyle}>{noIcon ? null : (iconOverride || <PlusIcon />)}</EmptyThumbnail>
    <ClipCorner dimension={10} />
  </ResourceThumbnailWrapper>
);

export const MiniBarChart = ({ color, deltaColor, deltaValue, label, valueLabel, value, valueStyle, underLabels, warning }) => (
  <MiniBarWrapper>
    <ChartLabels warning={reactBool(warning)}>
      <label>{label}</label>
      <label style={valueStyle || {}}>{warning && <WarningOutlineIcon />} {valueLabel}</label>
    </ChartLabels>
    <MiniBar
      color={color}
      value={Math.max(0, Math.min(value, 1))}
      deltaColor={deltaColor}
      deltaValue={Math.max(-1, Math.min(deltaValue, 1))}
      warning={reactBool(warning)}>
      {deltaValue ? <DeltaIcon negativeDelta={deltaValue < 0} value={value}><FastForwardIcon /></DeltaIcon> : null}
    </MiniBar>
    {underLabels && <UnderChartLabels>{underLabels}</UnderChartLabels>}
  </MiniBarWrapper>
);

export const SwayInput = ({ inputLabel = "SWAY", onChange, value: defaultValue, ...props }) => {
  const [value, setValue] = useState(0);

  const internalOnChange = useCallback((e) => {
    let cleanValue = e.target?.value ? parseInt(e.target.value) : '';
    setValue(cleanValue);
    if (onChange) onChange(cleanValue);
  }, [onChange]);

  useEffect(() => {
    setValue(defaultValue || 0);
  }, [defaultValue]);

  return (
    <SwayInputRow>
      <SwayInputIconWrapper><SwayIcon /></SwayInputIconWrapper>
      <SwayInputFieldWrapper inputLabel={inputLabel}>
        <TextInput
          type="number"
          min={0}
          step={1}
          value={value || ''}
          onChange={internalOnChange}
          {...props} />
      </SwayInputFieldWrapper>
      <SwayInputHelp>{/* TODO: this doesn't do anything */}
        <QuestionIcon />
      </SwayInputHelp>
    </SwayInputRow>
  );
}

const MouseoverIcon = ({ children, icon, iconStyle = {}, themeColor }) => {
  const refEl = useRef();
  const [hovered, setHovered] = useState();
  return (
    <>
      <span
        ref={refEl}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={themeColor ? { ...iconStyle, color: themeColor } : iconStyle}>
        {icon}
      </span>
      <MouseoverInfoPane referenceEl={refEl.current} visible={hovered}>
        <MouseoverContent highlightColor={themeColor}>
          {children}
        </MouseoverContent>
      </MouseoverInfoPane>
    </>
  );
};

export const Mouseoverable = ({ children, tooltip, style = {}, themeColor }) => {
  const refEl = useRef();
  const [hovered, setHovered] = useState();
  return (
    <>
      <span
        ref={refEl}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={style}>
        {children}
      </span>
      <MouseoverInfoPane referenceEl={refEl.current} visible={hovered}>
        <MouseoverContent highlightColor={themeColor}>
          {tooltip}
        </MouseoverContent>
      </MouseoverInfoPane>
    </>
  );
}

//
// COMPONENTS
//

const ActionDialogActionBar = ({ location, onClose, overrideColor, stage }) => (
  <ActionBar {...theming[stage]} overrideColor={overrideColor}>
    {(stage === actionStage.STARTING || stage === actionStage.COMPLETING) && (
      <BarLoadingContainer>
        <BarLoader color={theme.colors.lightPurple} height="5px" speedMultiplier={0.5} width="100%" />
      </BarLoadingContainer>
    )}
    <ActionLocation {...theming[stage]} overrideColor={overrideColor}>
      <b>{formatters.asteroidName(location?.asteroid)}</b>
      <span>{location?.lot ? `> ${formatters.lotName(location.lot.id)}` : ''}</span>
      <span>{location?.ship && !location?.lot ? `> ${formatShipStatus(location.ship)}` : ''}</span>
    </ActionLocation>
    <IconButton backgroundColor={`rgba(0, 0, 0, 0.15)`} marginless onClick={onClose}>
      <CloseIcon />
    </IconButton>
  </ActionBar>
);


const mouseoverPaneProps = (visible) => ({
  css: css`
    padding: 10px;
    pointer-events: ${visible ? 'auto' : 'none'};
    width: 400px;
  `,
  placement: 'left',
  visible
});

const TimerInfoBody = styled.div`
  color: #999;
  font-size: 15px;
  & > b {
    color: white;
    font-weight: normal;
  }
`;

const TimerDetails = styled.div`
  border-top: 1px solid #333;
  margin-top: 15px;
  padding-top: 15px;
  & > div {
    display: flex;
    justify-content: space-between;
    margin-bottom: 5px;
    & > span {
      color: ${p => p.theme.colors.brightMain};
      font-weight: bold;
    }
    &:last-child {
      margin-bottom: 0;
    }
  }
`;

const TimePill = ({ children, type, details }) => {
  const [hovered, setHovered] = useState();
  const [refEl, setRefEl] = useState();
  return (
    <TimePillComponent
      ref={setRefEl}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered()}
      type={type}>
      {children}

      <MouseoverInfoPane referenceEl={refEl} {...mouseoverPaneProps(hovered)}>
        <TimerInfoBody>
          {type === 'delay' && (
            <>
              <b><ScheduleFullIcon /> Crew Delay: </b>
              This crew has other scheduled tasks, and must wait before starting this one.
              The delay period equals the sum of the all previously scheduled actions crew
              presence requirements. Crews may schedule additional actions as long as their
              total delay period does not exceed <b>24 hours</b>.
            </>
          )}
          {type === 'crew' && (
            <>
              <b><CrewIcon /> Crew Ready In: </b>Time until this crew becomes available again, 
              after performing all actions on their schedule including this one. Some actions 
              cannot be scheduled and require a fully idle crew to start.
            </>
          )}
          {type === 'total' && (
            <>
              <b><AlertIcon /> Action Finishes In: </b>Time until this action's outcome is 
              ready to be finalized. Process actions require a crew to be present for <b>1/8th </b>
              of the process duration, so the acting crew will often return to station and become 
              available before the action itself finishes.
            </>
          )}
          {details?.length > 0 && (
            <TimerDetails>
              {details.filter((row) => !!row).map(([time, label]) => (
                <div key={label}>
                  <label>{label}</label>
                  {time === undefined
                    ? <span style={{ color: '#444' }}>TBD</span>
                    : <span>{formatTimer(time)}</span>
                  }
                </div>
              ))}
            </TimerDetails>
          )}
        </TimerInfoBody>
      </MouseoverInfoPane>
    </TimePillComponent>
  );
};

const PillTime = styled(Monospace)`
  font-size: 85%;
  line-height: 18px;
`;
export const ActionDialogHeader = ({ action, actionCrew, crewAvailableTime, delayUntil, location, onClose, overrideColor, stage, taskCompleteTime, wide }) => {
  const simulationEnabled = useSimulationEnabled();
  return (
    <>
      <ActionDialogActionBar
        location={location}
        onClose={onClose}
        overrideColor={overrideColor}
        stage={stage}
      />
      <Header theming={theming[stage]} overrideHighlightColor={overrideColor} wide={wide}>
        {actionCrew?._crewmates?.[0] && (
          <CrewmateCardFramed
            crewmate={actionCrew?._crewmates?.[0]}
            isCaptain
            CrewmateCardProps={simulationEnabled ? { useExplicitAppearance: true } : {}}
            width={75} />
        )}
        <IconAndLabel>
          <IconContainer>{action.icon}</IconContainer>
          <LabelContainer>
            <h1>{action.label}</h1>
            <h2>{action.status || theming[stage]?.label}</h2>
          </LabelContainer>
          <div>
            {delayUntil !== undefined && (
              <LiveTimer target={delayUntil} maxPrecision={2}>
                {(formattedTime, isTimer) => {
                  const pills = [];
                  const delayDuration = isTimer ? (delayUntil - Math.floor(Date.now() / 1000)) : 0;
                  if (isTimer) {
                    pills.push(
                      <TimePill key="delay" type="delay">
                        <ScheduleFullIcon /><label>Delay</label> <PillTime>{formattedTime}</PillTime>
                      </TimePill>
                    );
                  }
                  if (crewAvailableTime?.total > 0) {
                    pills.push(
                      <TimePill key="crew" type="crew" details={isTimer && crewAvailableTime.details ? [[delayDuration, 'Crew Unavailable'], ...crewAvailableTime.details] : crewAvailableTime.details}>
                        <CrewIcon isPaused /><label>Crew</label> <PillTime>{formatTimer(delayDuration + crewAvailableTime.total, 2)}</PillTime>
                      </TimePill>
                    );
                  }
                  if (taskCompleteTime?.total > 0) {
                    pills.push(
                      <TimePill key="total" type="total" details={isTimer && taskCompleteTime.details ? [[delayDuration, 'Crew Unavailable'], ...taskCompleteTime.details] : taskCompleteTime.details}>
                        <AlertIcon /><label>Action</label> <PillTime>{formatTimer(delayDuration + taskCompleteTime.total, 2)}</PillTime>
                      </TimePill>
                    )
                  }
                  return pills;
                }}
              </LiveTimer>
            )}
            {delayUntil === undefined && crewAvailableTime?.total > 0 && (
              <TimePill type="crew" details={crewAvailableTime.details}>
                <CrewIcon isPaused /><label>Crew</label> {formatTimer(crewAvailableTime.total, 2)}
              </TimePill>
            )}
            {delayUntil === undefined && taskCompleteTime?.total > 0 && (
              <TimePill type="total" details={taskCompleteTime.details}>
                <AlertIcon /><label>Action</label> {formatTimer(taskCompleteTime.total, 2)}
              </TimePill>
            )}
          </div>
        </IconAndLabel>
      </Header>
    </>
  );
};

export const LeaseDetailsLabel = styled.div`
  color: ${p => p.theme.colors.success};
  font-size: 14px;
  text-transform: uppercase;
  &:before {
    content: "Leasing";
  }
`;

export const BuyingDetailsLabel = styled(LeaseDetailsLabel)`
  color: ${p => p.theme.colors.brightMain};
  &:before {
    content: "Buying";
  }
`;

export const AssetSellerIndicator = ({ crewId, ...props }) => {
  return (
    <div style={{ position: 'absolute', top: 5, right: 5, zIndex: 1 }} {...props}>
      <CrewCaptainCardFramed
        borderColor={`rgba(${theme.colors.mainRGB}, 0.5)`}
        crewId={crewId}
        lessPadding
        width={36} />
    </div>
  );
}

export const LeaseInfoIcon = () => (
  <div style={{ position: 'absolute', top: 5, right: 5, fontSize: 24, opacity: 0.5 }}>
    <InfoIcon />
  </div>
);

export const FlexSectionInputBlock = ({
  addChildren,
  bodyStyle,
  children,
  disabled,
  image,
  innerBodyStyle,
  isSelected,
  label,
  onClick,
  setRef,
  style = {},
  sublabel,
  title,
  titleDetails,
  tooltip,
  ...props
}) => {
  const refEl = useRef();

  const [hovered, setHovered] = useState();
  return (
    <>
      {tooltip && (
        <MouseoverInfoPane referenceEl={refEl.current} visible={hovered}>
          <MouseoverContent highlightColor={theme.colors.lightOrange}>
            {tooltip}
          </MouseoverContent>
        </MouseoverInfoPane>
      )}
      <FlexSectionInputContainer ref={setRef} style={style}>
        {title && <SectionTitle>{title}{titleDetails && <><b style={{ flex: 1 }} /><SectionTitleRight>{titleDetails}</SectionTitleRight></>}</SectionTitle>}

        <FlexSectionInputBody
          isSelected={isSelected}
          onClick={disabled ? undefined : onClick}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          ref={refEl}
          style={bodyStyle}
          {...props}>
          {children && (
            <FlexSectionInputBodyInner style={innerBodyStyle}>
              {children}
            </FlexSectionInputBodyInner>
          )}
          {!children && (
            <ThumbnailWithData>
              {image}
              <label>
                <h3>{label}</h3>
                {sublabel && <b>{sublabel}</b>}
              </label>
            </ThumbnailWithData>
          )}
          {addChildren}
          <ClipCorner dimension={sectionBodyCornerSize} />
        </FlexSectionInputBody>
      </FlexSectionInputContainer>
    </>
  );
};

export const FlexSectionBlock = ({ bodyStyle, children, style = {}, title, titleDetails }) => {
  return (
    <FlexSectionInputContainer style={style}>
      {title && <SectionTitle>{title}{titleDetails && <><b style={{ flex: 1 }} /><SectionTitleRight>{titleDetails}</SectionTitleRight></>}</SectionTitle>}
      <FlexSectionBlockInner style={bodyStyle}>
        {children}
      </FlexSectionBlockInner>
    </FlexSectionInputContainer>
  );
};

export const LotControlWarning = ({ lot }) => {
  const { accountCrewIds, crew } = useCrewContext();
  const { isAtRisk } = useConstructionManager(lot?.id);

  const warning = useMemo(() => {
    if (!(crew && lot)) return null;
    if (isAtRisk) {
      return <>Construction Site is vulnerable to any crew.</>;
    }
    if (!accountCrewIds?.includes(lot?.Control?.controller?.id)) {
      return <>Lot Not Controlled. Construction Site is vulnerable to <EntityName {...(lot?.Control?.controller || {})} /></>;
    }
  }, [accountCrewIds, crew, isAtRisk, lot?.building]);

  if (!warning) return null;
  return (
    <ControlWarning>
      <WarningIcon /> <span>{warning}</span>
    </ControlWarning>
  );
}



//
// Sections
//

export const ResourceGridSectionInner = ({
  columns,
  errorMessage,
  hideTotals = false,
  isGathering,
  items,
  onClick,
  minCells = 0,
  noCellStyles,
  style,
  theming = 'default'
}) => {
  const { totalItems, totalMass, totalVolume } = useMemo(() => {
    return items.reduce((acc, { i, numerator, denominator, selected }) => {
      if (!Product.TYPES[i]) {
        console.error(`Product #${i} invalid`)
        return acc;
      }
      let sumValue = numerator;
      if (selected !== undefined) sumValue = selected;
      else if (denominator !== undefined) sumValue = denominator;

      acc.totalItems += (selected === undefined || selected > 0) ? 1 : 0;
      acc.totalMass += sumValue * Product.TYPES[i].massPerUnit;
      acc.totalVolume += sumValue * (Product.TYPES[i].volumePerUnit || 0);
      return acc;
    }, { totalItems: 0, totalMass: 0, totalVolume: 0 });
  }, [items]);

  return (
    <IngredientsList
      columns={columns}
      hasSummary={!hideTotals}
      theming={theming}
      isSelected={reactBool(onClick)}
      onClick={onClick}
      style={style}>
      {items.length > 0
        ? (
          <>
            {items.map((item) => (
              <ResourceRequirement
                key={item.i}
                isGathering={isGathering}
                item={item}
                resource={Product.TYPES[item.i]}
                noStyles={noCellStyles}
                size="96px"
                tooltipContainer="actionDialogTooltip" />
            ))}
            {Array.from({ length: Math.max(0, minCells - items.length) }).map((_, i) => (
              <EmptyResourceImage key={i} noIcon outlineColor="transparent" style={{ background: 'rgba(0, 0, 0, 0.25)' }} />
            ))}
            {errorMessage && (
              <IngredientSummary theming="error">
                <span><WarningIcon /> {errorMessage}</span>
              </IngredientSummary>
            )}
            {!hideTotals && !errorMessage && (
              <IngredientSummary theming={theming}>
                <span>{theming === 'warning' ? 'Total Requirements:' : 'Total Transfer:'}</span>
                <span>{formatMass(totalMass)} | {formatVolume(totalVolume)}</span>
              </IngredientSummary>
            )}
          </>
        )
        : (
          <>
            <div style={{ height: 92 }}>
              <ThumbnailWithData style={{ marginLeft: 4, position: 'absolute' }}>
                <EmptyResourceImage />
                <label>
                  <h3>Select</h3>
                  <b>Items</b>
                </label>
              </ThumbnailWithData>
            </div>
            {!hideTotals && (
              <IngredientSummary theming="none">
                <span>None Selected</span>
              </IngredientSummary>
            )}
          </>
        )}
      <ClipCorner dimension={sectionBodyCornerSize} />
    </IngredientsList>
  );
};

const ResourceGridSection = ({ label, sectionProps = {}, ...props }) => (
  <Section style={{ marginBottom: props.marginBottom === undefined ? 25 : props.marginBottom }}>
    <SectionTitle>{label}</SectionTitle>
    <SectionBody {...sectionProps}>
      <ResourceGridSectionInner {...props} />
    </SectionBody>
  </Section>
);

export const BuildingRequirementsSection = ({ mode, label, requirements, requirementsMet }) => {
  const items = useMemo(() => {
    return requirements.map((item) => ({
      i: item.i,
      numerator: item.inInventory + item.inTransit,
      denominator: item.totalRequired,
      customIcon: item.inTransit > 0
        ? {
          animated: true,
          icon: <TransferToSiteIcon />,
        }
        : undefined,
      stripeAnimation: item.inTransit > 0
    }));
  }, [requirements]);

  return (
    <ResourceGridSection
      hideTotals={mode === 'simple'}
      isGathering={mode === 'gathering'}
      items={items}
      label={label}
      noCellStyles={mode === 'simple'}
      theming={requirementsMet ? undefined : 'warning'} />
  );
};

export const TransferBuildingRequirementsSection = ({ label, onClick, requirements, selectedItems }) => {
  const items = useMemo(() => requirements.map((item) => ({
    i: item.i,
    numerator: item.inInventory + item.inTransit + (selectedItems[item.i] || 0),
    denominator: item.totalRequired,
    requirementMet: (item.inInventory + item.inTransit) >= item.totalRequired,
    selected: selectedItems[item.i] || 0,
    customIcon: item.inTransit > 0
      ? {
        animated: true,
        icon: <TransferToSiteIcon />,
      }
      : undefined,
    stripeAnimation: item.inTransit > 0
  })), [requirements, selectedItems]);

  return (
    <ResourceGridSection
      isGathering
      items={items}
      selectedItems={selectedItems}
      label={label}
      onClick={onClick} />
  );
};

export const DeconstructionMaterialsSection = ({ label, itemsReturned }) => {
  const items = useMemo(() => {
    return itemsReturned.map((item) => ({
      i: item.i,
      customIcon: { icon: <PlusIcon /> },
      numerator: item.totalRequired
    }));
  }, [itemsReturned]);

  return (
    <ResourceGridSection
      items={items}
      label={label} />
  );
};

export const ItemSelectionSection = ({ columns = 7, label, items, onClick, stage, unwrapped, ...props }) => {
  const formattedItems = useMemo(() => {
    return Object.keys(items || {}).map((resourceId) => ({
      i: resourceId,
      numerator: items[resourceId]
    }));
  }, [items]);

  return unwrapped
    ? (
      <ResourceGridSectionInner
        columns={columns}
        items={formattedItems}
        minCells={columns * 2}
        noCellStyles={stage !== actionStage.NOT_STARTED}
        onClick={onClick}
        theming={stage === actionStage.READY_TO_COMPLETE ? 'success' : 'default'}
        {...props} />
    )
    : (
      <ResourceGridSection
        columns={columns}
        items={formattedItems}
        label={label}
        minCells={columns * 2}
        noCellStyles={stage !== actionStage.NOT_STARTED}
        onClick={onClick}
        theming={stage === actionStage.READY_TO_COMPLETE ? 'success' : 'default'}
        {...props} />
    );
};

export const TransferDistanceDetails = ({ distance, crewDistBonus }) => {
  const crewFreeTransferRadius = Asteroid.FREE_TRANSPORT_RADIUS * (crewDistBonus?.totalBonus || 1);
  return (
    <TransferDistanceTitleDetails>
      {distance && distance < crewFreeTransferRadius ? (
        <Mouseoverable tooltip={(
          <FreeTransferNote>
            <div>Instant Transfer Radius</div>
            <div>Transfers less than {crewFreeTransferRadius.toFixed(1)}km in distance are instantaneous.</div>
          </FreeTransferNote>
        )}>
          <label><SurfaceTransferIcon /> {Math.round(distance)}km Away</label>
        </Mouseoverable>
      ) : ''}
      {distance && distance >= crewFreeTransferRadius ? `${Math.round(distance)}km Away` : ''}
    </TransferDistanceTitleDetails>
  );
};

export const ProgressBarSection = ({
  finishTime,
  isCountDown,
  overrides = {
    barColor: null,
    color: null,
    left: '',
    center: '',
    right: ''
  },
  stage,
  startTime,
  title,
  tooltip,
  totalTime,
  width
}) => {
  const syncedTime = useSyncedTime();

  const refEl = useRef();
  const [hovered, setHovered] = useState();

  const { animating, barWidth, color, left, reverseAnimation, right, center } = useMemo(() => {
    const r = {
      animating: false,
      reverseAnimation: false,
      barWidth: 0,
      color: null,
      left: '',
      right: '',
    }
    if (stage === actionStage.NOT_STARTED) {
      if (isCountDown) {
        const isZero = syncedTime > finishTime;
        const progress = startTime && finishTime && syncedTime
          ? Math.max(0, 1 - (syncedTime - startTime) / (finishTime - startTime))
          : 1;
        r.animating = !isZero;
        r.reverseAnimation = false;
        r.barWidth = progress;
        r.left = `${formatFixed(100 * progress, 1)}%`;
        r.right = isZero
          ? <span style={{ color: 'white' }}>Site is Abandoned</span>
          : <><LiveTimer target={finishTime} maxPrecision={2} /> left</>;
      }
      r.color = '#AAA';
      r.left = '0.0%';

    } else if (stage === actionStage.STARTING) {
      r.animating = true;
      r.color = '#AAA';
      r.left = '0.0%';

    } else if (stage === actionStage.IN_PROGRESS) {
      if (syncedTime < startTime) {
        r.animating = true;
        r.reverseAnimation = true;
        r.barWidth = 0;
        r.left = 'WAITING';
        r.right = <>Scheduled in <LiveTimer target={startTime} maxPrecision={2} /></>;
        r.color = theme.colors.sequence;
      } else {
        const progress = startTime && finishTime && syncedTime
          ? Math.min(1, (syncedTime - startTime) / (finishTime - startTime))
          : 0;
        r.animating = true;
        r.barWidth = progress;
        r.color = '#FFF';
        r.left = `${formatFixed(100 * progress, 1)}%`;
        r.right = <LiveTimer target={finishTime} />
      }

    } else if (stage === actionStage.READY_TO_COMPLETE) {
      r.barWidth = 1;
      r.color = '#FFF';
      r.left = '100%';

    } else if (stage === actionStage.COMPLETING) {
      r.animating = true;

    } else if (stage === actionStage.COMPLETED) {
      r.barWidth = 1;
      r.color = '#FFF';
    }
    return r;
  }, [finishTime, stage, startTime, syncedTime]);

  const totalTimeNote = useMemo(() => {
    if (!totalTime) return '';
    if ([actionStage.NOT_STARTED, actionStage.COMPLETING, actionStage.COMPLETED].includes(stage)) return '';
    return `TOTAL: ${formatTimer(totalTime, 2)}`;
  }, [stage, totalTime]);

  return (
    <Section style={{ width }}>
      <SectionTitle note={totalTimeNote}>{title}</SectionTitle>
      {tooltip && (
        <MouseoverInfoPane referenceEl={refEl.current} visible={hovered}>
          <MouseoverContent>
            {tooltip}
          </MouseoverContent>
        </MouseoverInfoPane>
      )}
      <ActionProgressWrapper>
        <ActionProgressContainer
          animating={animating}
          color={overrides.barColor || theming[stage]?.highlight}
          labelColor={overrides.color || color || undefined}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          ref={refEl}
          reverseAnimation={reverseAnimation}>
          <ActionProgress progress={barWidth || 0} />
          <ActionProgressLabels>
            <div>{overrides.left || left}</div>
            <div>{overrides.center || center}</div>
            <div>{overrides.right || right}</div>
          </ActionProgressLabels>
        </ActionProgressContainer>
      </ActionProgressWrapper>
    </Section>
  );
};

export const ResourceAmountSlider = ({ amount, extractionTime, min, max, resource, setAmount }) => {
  const setCoachmarkRef = useCoachmarkRefSetter();

  const [grams, tonnageValue] = useMemo(() => {
    const grams = amount * resource?.massPerUnit || 0;
    const tonnage = grams / 1e6;
    const tonnageValue = Math.round(1e3 * tonnage) / 1e3;
    return [grams, tonnageValue];
  }, [amount, resource]);

  const [focusOn, setFocusOn] = useState();
  const [mouseIn, setMouseIn] = useState(false);

  const onFocusEvent = useCallback((e) => {
    if (e.type === 'focus') {
      setFocusOn(true);
      e.target.select();
    } else {
      setFocusOn(false);
    }
  }, []);

  const onMouseEvent = useCallback((e) => {
    setMouseIn(e.type === 'mouseenter')
  }, []);

  const onChangeInput = (e) => {
    let quanta = Math.round(1e6 * e.currentTarget.value / resource.massPerUnit);
    if (quanta > max) quanta = max;
    if (quanta < min) quanta = min;
    setAmount(quanta);
  };
  return (
    <SliderWrapper>
      <SliderInfoRow>
        <SliderLabel onMouseEnter={onMouseEvent} onMouseLeave={onMouseEvent}>
          {(mouseIn || focusOn)
            ? (
              <SliderTextInput
                type="number"
                step={0.1}
                value={tonnageValue}
                onChange={onChangeInput}
                onBlur={onFocusEvent}
                onFocus={onFocusEvent} />
            )
            : <b>{formatSampleMass(grams)}</b>
          }
          {' '}
          tonnes
        </SliderLabel>
        {extractionTime !== undefined && <SliderInfo>{formatTimer(extractionTime, 3)}</SliderInfo>}
        <Button
          disabled={amount === max}
          onClick={() => setAmount(max)}
          setRef={amount === max ? undefined : setCoachmarkRef(COACHMARK_IDS.actionDialogMaxRecipes)}
          size="small"
          style={{ padding: 0, minWidth: 75 }}>Max</Button>
      </SliderInfoRow>
      <SliderInput
        min={min}
        max={max}
        increment={resource ? (0.1 / resource?.massPerUnit) : 1}
        onChange={setAmount}
        value={amount || 0} />
    </SliderWrapper>
  );
};

export const RecipeSlider = ({ amount, disabled, increment = 0.001, processingTime, min: rawMin, max: rawMax, overrideSliderLabel, setAmount }) => {
  const [focusOn, setFocusOn] = useState();
  const [mouseIn, setMouseIn] = useState(false);

  const setCoachmarkRef = useCoachmarkRefSetter();

  const [min, max] = useMemo(() => {
    return [
      Math.ceil(rawMin / increment) * increment,
      Math.floor(rawMax / increment) * increment
    ];
  }, [increment, rawMin, rawMax]);

  const onFocusEvent = useCallback((e) => {
    if (e.type === 'focus') {
      setFocusOn(true);
      e.target.select();
    } else {
      setFocusOn(false);
    }
  }, []);

  const onMouseEvent = useCallback((e) => {
    setMouseIn(e.type === 'mouseenter')
  }, []);

  const onSetAmount = useCallback((value) => {
    let cleansed = numeral(value);
    if (cleansed.value() === null) cleansed = numeral(min);

    // apply max, then min, then single increment
    if (cleansed.value() > max) cleansed = Math.min(max, cleansed.value());

    // apply min / single increment
    if (cleansed.value() < min) cleansed = numeral(Math.max(min, increment));
  
    setAmount(Number(cleansed.format(`${increment}`)));
  }, [increment, min, max]);

  const onChangeInput = useCallback((e) => {
    onSetAmount(e.currentTarget.value);
  }, [onSetAmount]);

  const onRound = useCallback(() => {
    onSetAmount(Math.round(amount));
  }, [amount, onSetAmount]);

  return (
    <SliderWrapper>
      <SliderInput
        disabled={disabled}
        min={min}
        max={max}
        increment={increment}
        onChange={onSetAmount}
        value={amount || 0} />
      <SliderInfoRow style={{ alignItems: 'center' }}>
        <SliderInfo style={{ flex: 1 }}>{formatTimer(processingTime, 3)}</SliderInfo>
        {overrideSliderLabel || (
          <>
            <SliderLabel onMouseEnter={onMouseEvent} onMouseLeave={onMouseEvent} style={{ flex: 'none', fontSize: '10px', lineHeight: '29px' }}>
              {(mouseIn || focusOn) ? (
                <SliderTextInput
                  type="number"
                  disabled={disabled}
                  step={increment}
                  value={amount}
                  onChange={onChangeInput}
                  onBlur={onFocusEvent}
                  onFocus={onFocusEvent}
                  style={{ marginTop: -2 }} />
              )
                : (
                  <b>{amount.toLocaleString()}</b>
                )
              }
              {' '}
              <span style={{ fontSize: 14 }}>SRs</span>
            </SliderLabel>
            {!disabled && (
              <>
                <Button
                  disabled={amount === Math.round(amount)}
                  onClick={onRound}
                  size="small"
                  style={{ marginLeft: 10, padding: 0, minWidth: 75 }}>Round</Button>
                <Button
                  disabled={amount === max}
                  onClick={() => onSetAmount(max)}
                  setRef={amount === max ? undefined : setCoachmarkRef(COACHMARK_IDS.actionDialogMaxRecipes)}
                  size="small"
                  style={{ marginLeft: 10, padding: 0, minWidth: 75 }}>Max</Button>
              </>
            )}
          </>
        )}
      </SliderInfoRow>
    </SliderWrapper>
  );
};

export const ProcessInputOutputSection = ({ title, products, input, output, primaryOutput, secondaryOutputsBonus, setPrimaryOutput, source, stage, ...props }) => {
  const sourceContents = useMemo(() => (source?.contents || []).reduce((acc, cur) => ({ ...acc, [cur.product]: cur.amount }), {}), [source]);

  return (
    <FlexSectionBlock title={title} {...props} bodyStyle={{ padding: 0 }}>
      <ProductWrapper horizontalScroll={products?.length > 7}>
        {products.map(({ i: resourceId, recipe, amount }) => {
          const thumbProps = {};
          if (output) {
            thumbProps.backgroundColor = `rgba(${hexToRGB(theme.colors.green)}, 0.15)`;
            thumbProps.badgeColor = theme.colors.green;
          // don't show insufficient input if already started
          } else if ((sourceContents[resourceId] >= amount) || (stage !== actionStage.NOT_STARTED))  {
            thumbProps.backgroundColor = `rgba(${theme.colors.mainRGB}, 0.15)`;
            thumbProps.badgeColor = theme.colors.main;
            thumbProps.progress = 1;
          } else {
            thumbProps.backgroundColor = `rgba(${hexToRGB(theme.colors.error)}, 0.15)`;
            thumbProps.badgeColor = theme.colors.error;
            thumbProps.progress = (sourceContents[resourceId] || 0) / amount;
            if (source) {
              thumbProps.tooltipOverride = `[INSUFFICIENT] ${Product.TYPES[resourceId]?.name}`;
            }
          }
          const resource = Product.TYPES[resourceId];
          return (
            <ProductSelector
              key={resourceId}
              input={input}
              output={output}
              primary={primaryOutput === resourceId}
              onClick={setPrimaryOutput ? () => setPrimaryOutput(resourceId) : undefined}>
              <ResourceThumbnail
                resource={resource}
                badge={`${output ? '+' : '-'}${resource.isAtomic ? amount : formatResourceMass(amount, resourceId)}`}
                iconBadge={<RecipeLabel>{recipe.toLocaleString()}</RecipeLabel>}
                tooltipContainer="actionDialogTooltip"
                {...thumbProps}
              />
              {output && (
                <label>
                  {primaryOutput === resourceId
                    ? (
                      <>
                        <TargetIcon /><span>Primary</span>
                        <ClipCorner dimension={10} color={theme.colors.main} />
                      </>
                    )
                    : `-${formatFixed(100 * Math.min(0.375 / (secondaryOutputsBonus || 1), 1), 1)}%`
                  }
                </label>
              )}
            </ProductSelector>
          );
        })}
      </ProductWrapper>
    </FlexSectionBlock>
  );
};

export const ProcessInputSquareSection = ({ title, products, input, output, primaryOutput, setPrimaryOutput, source, stage, ...props }) => {
  const sourceContents = useMemo(() => (source?.contents || []).reduce((acc, cur) => ({ ...acc, [cur.product]: cur.amount }), {}), [source]);
  return (
    <FlexSectionBlock title={title} {...props} bodyStyle={{ padding: 0 }}>
      <ProductGridWrapper>
        {products.map(({ i: resourceId, recipe, amount }) => {
          const thumbProps = {};
          if (output) {
            thumbProps.backgroundColor = `rgba(${hexToRGB(theme.colors.green)}, 0.15)`;
            thumbProps.badgeColor = theme.colors.green;
          } else if ((sourceContents[resourceId] || 0) >= amount || stage !== 'NOT_STARTED') {
            thumbProps.backgroundColor = `rgba(${theme.colors.mainRGB}, 0.15)`;
            thumbProps.badgeColor = theme.colors.main;
            thumbProps.progress = 1;
          } else {
            thumbProps.backgroundColor = `rgba(${hexToRGB(theme.colors.error)}, 0.15)`;
            thumbProps.badgeColor = theme.colors.error;
            thumbProps.progress = (sourceContents[resourceId] || 0) / amount;
            if (source) {
              thumbProps.tooltipOverride = `[INSUFFICIENT] ${Product.TYPES[resourceId]?.name}`;
            }
          }
          const resource = Product.TYPES[resourceId];
          return (
            <ProductSelector
              key={resourceId}
              input={input}
              output={output}
              primary={primaryOutput === resourceId}
              onClick={setPrimaryOutput ? () => setPrimaryOutput(resourceId) : undefined}>
              <ResourceThumbnail
                resource={resource}
                badge={`${output ? '+' : '-'}${resource.isAtomic ? amount : formatResourceMass(amount, resourceId)}`}
                iconBadge={<RecipeLabel>{(recipe || 0).toLocaleString()}</RecipeLabel>}
                size="87px"
                tooltipContainer="actionDialogTooltip"
                {...thumbProps}
              />
              {output && <label>{primaryOutput === resourceId ? <><TargetIcon /><span>Primary</span></> : `-50%`}</label>}
            </ProductSelector>
          );
        })}
      </ProductGridWrapper>
    </FlexSectionBlock>
  );
};

export const PropulsionTypeSection = ({ disabled, objectLabel, propulsiveTime, tugTime, powered, onSetPowered, warning }) => {
  const coachmarks = useStore(s => s.coachmarks);
  const setCoachmarkRef = useCoachmarkRefSetter();
  return (
    <FlexSectionBlock title={`${objectLabel} Type`} bodyStyle={{ padding: 0 }}>
      <>
        {(onSetPowered || powered) && (
          <PropulsionTypeOption
            ref={!powered && coachmarks[COACHMARK_IDS.actionDialogTargetLaunchType] === 'propulsive' ? setCoachmarkRef(COACHMARK_IDS.actionDialogTargetLaunchType) : null}
            disabled={disabled}
            onClick={!disabled && onSetPowered ? () => onSetPowered(true) : undefined}
            selected={powered}>
            {onSetPowered && (powered ? <RadioCheckedIcon /> : <RadioUncheckedIcon />)}
            <div style={{ flex: 1 }}>
              <label>Propulsive:</label> Thruster {objectLabel}
            </div>
            <div>{formatTimer(propulsiveTime || 0, 2)}</div>
          </PropulsionTypeOption>
        )}
        {(onSetPowered || !powered) && (
          <PropulsionTypeOption
            ref={powered && coachmarks[COACHMARK_IDS.actionDialogTargetLaunchType] === 'tug' ? setCoachmarkRef(COACHMARK_IDS.actionDialogTargetLaunchType) : null}
            disabled={disabled}
            onClick={!disabled && onSetPowered ? () => onSetPowered(false) : undefined}
            selected={!powered}>
            {onSetPowered && (!powered ? <RadioCheckedIcon /> : <RadioUncheckedIcon />)}
            <div style={{ flex: 1 }}>
              <label>Tug:</label> Hopper-Assisted {objectLabel}
            </div>
            <div>{formatTimer(tugTime || 0, 2)}</div>
          </PropulsionTypeOption>
        )}
        {warning && (
          <TugWarning>
            <WarningOutlineIcon />
            <span>{warning}</span>
          </TugWarning>
        )}
      </>
    </FlexSectionBlock>
  );
}

export const PropellantSection = ({ title, narrow, deltaVLoaded, deltaVRequired, propellantLoaded, propellantRequired }) => {
  const [deltaVMode, setDeltaVMode] = useState(false);

  const propellantUse = propellantLoaded > 0 ? propellantRequired / propellantLoaded : (propellantRequired > 0 ? Infinity : 0);
  const deltaVUse = deltaVLoaded > 0 ? deltaVRequired / deltaVLoaded : (deltaVRequired > 0 ? Infinity : 0);

  return (
    <FlexSectionBlock
      title={title}
      titleDetails={(
        <SectionTitleRightTabs>
          <SectionTitleTab
            data-tooltip-id="actionDialogTooltip"
            data-tooltip-content="Propellant Usage"
            data-tooltip-place="left"
            onClick={() => setDeltaVMode(false)}
            isSelected={!deltaVMode}><GasIcon /></SectionTitleTab>
          <SectionTitleTab
            data-tooltip-id="actionDialogTooltip"
            data-tooltip-content="Delta-V Usage"
            data-tooltip-place="left"
            onClick={() => setDeltaVMode(true)}
            isSelected={!!deltaVMode}><DeltaVIcon /></SectionTitleTab>
        </SectionTitleRightTabs>
      )}
      bodyStyle={{ padding: '1px 0' }}
      style={narrow ? {} : { width: '100%' }}>
      {narrow && (
        <BarChartNotes color={deltaVMode ? '#aaaaaa' : theme.colors.main}>
          <div>
            <b>Required: </b>
            {propellantRequired
              ? (deltaVMode ? formatVelocity(deltaVRequired) : formatMass(propellantRequired))
              : 'NONE'
            }
          </div>
          <div />
          <div>
            <b>Loaded:</b> {deltaVMode ? formatVelocity(deltaVLoaded) : formatMass(propellantLoaded)}
            {/* TODO: tooltip this? <small style={{ color: '#667'}}> / {formatMass(propellantMax)} max</small> */}
          </div>
        </BarChartNotes>
      )}
      {deltaVMode
        ? <BarChart
          color="#cccccc"
          value={Math.min(1, deltaVUse)} />
        : <BarChart
          color={theme.colors[propellantUse > 1 ? 'error' : 'orange']}
          bgColor={theme.colors.main}
          value={Math.min(1, propellantUse)} />
      }
      {!(narrow && !propellantRequired) && (
        <BarChartNotes color={deltaVMode ? '#aaaaaa' : theme.colors.main}>
          {!narrow && (
            <div>
              <b>Required: </b>
              {propellantRequired
                ? (deltaVMode ? formatVelocity(deltaVRequired) : formatMass(propellantRequired))
                : 'NONE'
              }
            </div>
          )}
          <div style={{ color: deltaVMode ? '#ccc' : theme.colors.orange, ...(narrow ? { textAlign: 'center', width: '100%' } : {}) }}>
            {(deltaVMode ? deltaVUse : propellantUse) > 1
              ? <span style={{ alignItems: 'center', color: theme.colors.error, display: 'flex', justifyContent: 'center' }}><WarningOutlineIcon /><span style={{ marginLeft: 4 }}>Insufficient Loaded</span></span>
              : <>{formatFixed(100 * (deltaVMode ? deltaVUse : propellantUse))}% of Loaded</>
            }

          </div>
          {!narrow && (
            <div>
              <b>Loaded:</b> {deltaVMode ? formatVelocity(deltaVLoaded) : formatMass(propellantLoaded)}
              {/* TODO: tooltip this? <small style={{ color: '#667'}}> / {formatMass(propellantMax)} max</small>*/}
            </div>
          )}
        </BarChartNotes>
      )}
    </FlexSectionBlock>
  );
};

export const EmergencyPropellantSection = ({ title, propellantPregeneration, propellantPostgeneration, propellantTankMax, emergencyPropellantCap }) => {
  return (
    <FlexSectionBlock
      title={title}
      bodyStyle={{ padding: '1px 0' }}
      style={{ width: '100%' }}>
      <BarChart
        color={theme.colors.warning}
        bgColor={theme.colors.main}
        value={propellantPregeneration / propellantTankMax}
        postValue={propellantPostgeneration / propellantTankMax}>
        {emergencyPropellantCap < 1 && <BarChartLimitLine position={emergencyPropellantCap} />}
      </BarChart>
      <BarChartNotes color={theme.colors.main}>
        <div>
          <span style={{ color: theme.colors.warning }}>Current: </span>
          <b>{formatMass(propellantPostgeneration)}</b>
        </div>
        <div>
          <span style={{ color: theme.colors.red, textTransform: 'uppercase' }}>Emergency Limit {formatFixed(emergencyPropellantCap * 100, 1)}%: </span>
          <b>{formatMass(emergencyPropellantCap * propellantTankMax)}</b>
        </div>
      </BarChartNotes>
    </FlexSectionBlock>
  );
};

export const SwayInputBlockInner = ({ instruction, ...props }) => {
  return (
    <>
      {instruction && <SwayInputInstruction>{instruction}</SwayInputInstruction>}
      <SwayInput {...props} />
    </>
  )
};

export const SwayInputBlock = ({ title, ...props }) => (
  <FlexSectionInputBlock
    title={title}
    bodyStyle={{ background: 'transparent' }}>
    <SwayInputBlockInner {...props} />
  </FlexSectionInputBlock>
);

const InlineCrewDetails = styled.div`
  align-items: center;
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  & > div:first-child {
    overflow: hidden;
    padding-left: 4px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;
export const CrewInputBlock = ({ cardWidth, crew, hideCrewmates, highlightCrewmates, inlineDetails, title, ...props }) => {
  const simulationEnabled = useSimulationEnabled();
  return (
    <FlexSectionInputBlock
      title={title}
      titleDetails={(inlineDetails || !crew) ? null : (
        <div>
          <CrewIcon />
          <span style={{ fontSize: '85%', marginLeft: 4 }}>
            {formatters.crewName(crew)}
          </span>
        </div>
      )}
      bodyStyle={{
        paddingRight: 8,
        ...(hideCrewmates ? { paddingBottom: 0 } : (crew?.Crew?.roster?.length === 0 ? { paddingBottom: 20 } : {}))
      }}
      innerBodyStyle={{ height: 'auto' }}
      {...props}>
      <div>
        {crew && inlineDetails && (
          <InlineCrewDetails>
            <div>{formatters.crewName(crew)}</div>
            <LiveReadyStatus crew={crew} style={{ fontSize: '14px' }} />
          </InlineCrewDetails>
        )}
        {!hideCrewmates && (
          <CrewmateCards>
            {Array.from({ length: 5 }).map((_, i) => {
              let crewmate;
              if (crew?._crewmates) {
                crewmate = crew?._crewmates[i]
              } else if (crew?.Crew?.roster[i]) {
                crewmate = {
                  id: crew?.Crew?.roster[i],
                  label: Entity.IDS.CREWMATE
                };
              }
              return crewmate
                ? (
                  <CrewmateCardFramed
                    key={i}
                    borderColor={`rgba(${theme.colors.mainRGB}, 0.7)`}
                    crewmate={crewmate}
                    isCaptain={i === 0}
                    lessPadding
                    noArrow={i > 0}
                    style={highlightCrewmates && !highlightCrewmates.includes(crewmate.id) ? { opacity: 0.5 } : {}}
                    width={cardWidth || 60}
                    CrewmateCardProps={i === 0 && simulationEnabled ? { useExplicitAppearance: true } : undefined} />
                )
                : (
                  <CrewmateCardPlaceholder
                    key={i}
                    style={highlightCrewmates ? { opacity: 0.5 } : {}}
                    width={cardWidth || 60} />
                );
          })}
          </CrewmateCards>
        )}
      </div>
    </FlexSectionInputBlock>
  )
};

export const CrewOwnerBlock = ({ title, ...innerProps }) => {
  return (
    <FlexSectionInputBlock
      title={title}
      bodyStyle={{ background: 'transparent' }}>
      <CrewIndicator {...innerProps} />
    </FlexSectionInputBlock>
  );
};

export const LotInputBlock = ({ lot, fallbackLabel = 'Select', fallbackSublabel = 'Lot', imageProps = {}, ...props }) => {
  const buildingType = lot?.building?.Building?.buildingType || 0;
  return (
    <FlexSectionInputBlock
      image={
        lot
          ? <BuildingImage buildingType={buildingType} {...imageProps} />
          : <EmptyBuildingImage {...imageProps} />
      }
      label={lot ? `${lot.building?.Name?.name || Building.TYPES[buildingType].name}` : fallbackLabel}
      sublabel={lot ? `${lot.building?.Name?.name ? Building.TYPES[buildingType].name : formatters.lotName(lot.id)}` : fallbackSublabel}
      {...props}
    />
  );
};

const Overloaded = styled.div`
  color: ${p => p.theme.colors.error};
  font-size: 12px;
  margin-top: 6px;
  text-transform: uppercase;
`;

export const MultiSourceInputBlock = ({
  crew,
  onClear,
  onClickInventory,
  onClickExchange,
  exchangeSelection,
  inventorySelection,
  origin,
  originLot,
  ...props
}) => {
  const offerExchanges = !!crew?._location?.lotId;
  if (offerExchanges && !exchangeSelection && !inventorySelection) {
    return (
      <FlexSectionInputBlock bodyStyle={{ height: 104, padding: 0 }} {...props}>
        <MultiSourceWrapper style={{ height: 104, width: '100%' }} isSelected={false}>
          <Button onClick={onClickInventory}>
            <TransferToSiteIcon /> <span>Transfer from Inventory</span>
          </Button>

          {/* TODO: disable if no marketplaces exist */}
          <Button onClick={onClickExchange}>
            <MarketBuyIcon /> <span>Source from Market</span>
          </Button>
        </MultiSourceWrapper>
      </FlexSectionInputBlock>
    );

  } else if (exchangeSelection) {
    return (
      <LotInputBlock
        {...props}
        onClick={onClear}
        lot={originLot}
      />
    );
  }

  // if off-surface, just present inventory...
  return (
    <InventoryInputBlock
      {...props}
      sublabel={
        originLot
        ? <><LocationIcon /> {formatters.lotName(inventorySelection?.lotIndex)}</>
        : 'Inventory'
      }
      entity={origin}
      imageProps={{ iconOverride: <InventoryIcon /> }}
      inventoryBonuses={crew?._inventoryBonuses}
      inventorySlot={inventorySelection?.slot}
      isSourcing
      onClick={offerExchanges ? onClear : onClickInventory}
    />
  );
};

export const InventoryInputBlock = ({
  entity,
  isSourcing,
  inventorySlot,
  lotIdOverride,
  transferMass = 0,
  transferVolume = 0,
  fallbackLabel = 'Select',
  fallbackSublabel = 'Inventory',
  imageProps = {},
  inventoryBonuses,
  stage,
  sublabel,
  ...props
}) => {
  const inventory = useMemo(() => {
    if (entity?.Inventories && inventorySlot) {
      return entity.Inventories.find((i) => i.slot === inventorySlot);
    }
    return null;
  }, [entity, inventorySlot]);

  const invConfig = useMemo(() => {
    if (inventory) {
      return Inventory.getType(inventory.inventoryType, inventoryBonuses);
    }
    return null;
  }, [inventory, inventoryBonuses]);

  const destinationOverloaded = useMemo(() => {
    const changeAlreadyApplied = (stage && ![actionStage.NOT_STARTED, actionStage.STARTING].includes(stage));

    if (inventory && !isSourcing) {
      const capacity = getCapacityStats(inventory, inventoryBonuses);
      const postMass = capacity.mass.used + capacity.mass.reserved + (changeAlreadyApplied ? 0 : transferMass);
      const postVolume = capacity.volume.used + capacity.volume.reserved + (changeAlreadyApplied ? 0 : transferVolume);
      if (!capacity.mass.isSoftMax && (postMass > capacity.mass.max)) {
        return true;
      }
      if (!capacity.volume.isSoftMax && (postVolume > capacity.volume.max)) {
        return true;
      }
    }
    return false;
  }, [transferMass, transferVolume, inventory, inventoryBonuses, stage]);

  const params = useMemo(() => {
    const fullImageProps = {
      ...imageProps,
      error: destinationOverloaded,
      inventory: !isSourcing && inventory,
      inventoryBonuses
    }
    const locObj = locationsArrToObj(entity?.Location?.locations || []);
    const lotIndex = lotIdOverride ? Lot.toIndex(lotIdOverride) : locObj.lotIndex;
    if (entity?.label === Entity.IDS.BUILDING) {
      const unfinished = entity?.Building?.status !== Building.CONSTRUCTION_STATUSES.OPERATIONAL;
      return {
        image: (
          <BuildingImage
            buildingType={entity?.Building?.buildingType || 0}
            unfinished={reactBool(unfinished)}
            {...fullImageProps} />
        ),
        label: `${formatters.buildingName(entity)}${invConfig?.category === Inventory.CATEGORIES.SITE ? ' (Site)' : ''}`,
        sublabel: sublabel || formatters.lotName(lotIndex),
      };
    }
    else if (entity?.label === Entity.IDS.SHIP) {
      // lotIdOverride is included for when this was the origin of a delivery, but ship has taken off
      // before action item completion... in case of lotIndex mismatch, just show the ship image
      return {
        image: lotIndex && locObj.lotIndex === lotIndex && !locObj.buildingId
          ? <LotShipImage shipType={entity?.Ship?.shipType || 0} {...fullImageProps} />
          : <ShipImage shipType={entity?.Ship?.shipType || 0} {...fullImageProps} />,
        label: `${formatters.shipName(entity)}${invConfig?.category === Inventory.CATEGORIES.PROPELLANT ? ' (Propellant)' : ' (Cargo)'}`,
        sublabel: sublabel || formatters.lotName(lotIndex),
      };
    }
    return { image: <EmptyBuildingImage {...fullImageProps} /> };
  }, [destinationOverloaded, imageProps, isSourcing, entity, inventory, invConfig, sublabel]);

  return (
    <FlexSectionInputBlock
      image={params.image}
      label={params.label || fallbackLabel}
      sublabel={(
        <>
          {params.sublabel || fallbackSublabel}
          {destinationOverloaded && <Overloaded>Over Capacity</Overloaded>}
        </>
      )}
      {...props}
    />
  );
};

export const BuildingInputBlock = ({ building, imageProps = {}, ...props }) => {
  const buildingType = building?.Building?.buildingType || 0;
  const unfinished = building?.Building?.status < Building.CONSTRUCTION_STATUSES.OPERATIONAL;
  return (
    <FlexSectionInputBlock
      image={
        buildingType
          ? <BuildingImage buildingType={buildingType} unfinished={unfinished} {...imageProps} />
          : <EmptyBuildingImage {...imageProps} />
      }
      label={building?.Name?.name ? formatters.buildingName(building) : `${Building.TYPES[buildingType].name}${unfinished ? ' (Site)' : ''}`}
      sublabel={building?.Name?.name ? Building.TYPES[buildingType].name : formatters.lotName(Lot.toPosition(building?.Location?.location)?.lotIndex || 0)}
      {...props}
    />
  );
};

export const ShipInputBlock = ({ ship, ...props }) => {
  const { accountCrewIds, crew } = useCrewContext();
  const hasMyCrew = crew && crew._location?.shipId === ship?.id;
  const isMine = accountCrewIds?.includes(ship?.Control?.controller?.id);
  const inEmergencyMode = ship?.Ship?.emergencyAt > 0;
  return (
    <FlexSectionInputBlock
      image={(
        <ShipImage
          iconBadge={isMine ? <MyAssetIcon /> : null}
          iconOverlay={inEmergencyMode ? <EmergencyModeEnterIcon /> : null}
          iconOverlayColor={theme.colors.orange}
          shipType={ship?.Ship?.shipType} />
      )}
      label={formatters.shipName(ship)}
      sublabel={(
        <>
          <div>{Ship.TYPES[ship?.shipType]?.name}</div>
          <ShipStatus ship={ship}>{hasMyCrew && <CaptainIcon />}</ShipStatus>
        </>
      )}
      bodyStyle={inEmergencyMode ? { backgroundColor: `rgba(${hexToRGB(theme.colors.orange)}, 0.2)` } : {}}
      {...props}
    />
  );
};

export const ShipTab = ({ pilotCrew, inventoryBonuses, ship, stage, deltas = {}, statWarnings = {}, warnings = [] }) => {

  // TODO: if want to include "reserved", it would probably make sense to use getCapacityUsage helper instead
  const inventory = useMemo(() => {
    if (!ship?.Ship?.shipType || !ship?.Inventories) return {};
    const shipConfig = Ship.TYPES[ship.Ship.shipType] || {};
    const propellantInventory = ship.Inventories.find((i) => i.slot === shipConfig.propellantSlot);
    const cargoInventory = ship.Inventories.find((i) => i.slot === shipConfig.cargoSlot);
    const propInvConfig = Inventory.getType(propellantInventory?.inventoryType, inventoryBonuses);
    const cargoInvConfig = Inventory.getType(cargoInventory?.inventoryType, inventoryBonuses);
    return {
      propellantMass: propellantInventory?.mass || 0,
      maxPropellantMass: propInvConfig?.massConstraint || 0,
      propellantVolume: propellantInventory?.volume || 0,
      maxPropellantVolume: propInvConfig?.volumeConstraint || 0,
      cargoMass: cargoInventory?.mass || 0,
      maxCargoMass: cargoInvConfig?.massConstraint || 0,
      cargoVolume: cargoInventory?.volume || 0,
      maxCargoVolume: cargoInvConfig?.volumeConstraint || 0,
    };
  }, [ship?.shipType, ship?.Inventories, inventoryBonuses]);

  const charts = useMemo(() => {
    const result = {
      propellantMass: {
        color: '#8cc63f',
        label: 'Propellant Mass',
        valueLabel: `${formatFixed((inventory.propellantMass + (deltas.propellantMass || 0)) / 1e6)} / ${formatFixed(inventory.maxPropellantMass / 1e6)}t`,
        value: (inventory.propellantMass + (deltas.propellantMass || 0)) / inventory.maxPropellantMass,
        deltaValue: (deltas.propellantMass || 0) / inventory.maxPropellantMass,
      },
      propellantVolume: {
        color: '#557826',
        label: 'Propellant Volume',
        valueLabel: `${formatFixed((inventory.propellantVolume + (deltas.propellantVolume || 0)) / 1e6)} / ${formatFixed(inventory.maxPropellantVolume / 1e6)}m³`,
        value: (inventory.propellantVolume + (deltas.propellantVolume || 0)) / inventory.maxPropellantVolume,
        deltaValue: (deltas.propellantVolume || 0) / inventory.maxPropellantVolume,
      },
      cargoMass: {
        label: 'Cargo Mass',
        valueLabel: `${formatFixed((inventory.cargoMass + (deltas.cargoMass || 0)) / 1e6)} / ${formatFixed(inventory.maxCargoMass / 1e6)}t`,
        value: (inventory.cargoMass + (deltas.cargoMass || 0)) / inventory.maxCargoMass,
        deltaValue: (deltas.cargoMass || 0) / inventory.maxCargoMass,
      },
      cargoVolume: {
        color: '#1f5f75',
        label: 'Cargo Volume',
        valueLabel: `${formatFixed((inventory.cargoVolume + (deltas.cargoVolume || 0)) / 1e6)} / ${formatFixed(inventory.maxCargoVolume / 1e6)}m³`,
        value: (inventory.cargoVolume + (deltas.cargoVolume || 0)) / inventory.maxCargoVolume,
        deltaValue: (deltas.cargoVolume || 0) / inventory.maxCargoVolume,
      }
    };

    // No need to show passengers if not at a station (crew is likely on an escape module)
    if (ship.Station) {
      result.passengers = {
        color: '#92278f',
        label: 'Crewmates Onboard',
        valueLabel: `${((ship.Station.population || 0) + (deltas.passengers || 0))} / ${Station.TYPES[ship.Station?.stationType]?.cap || 0}`,
        value: ((ship.Station.population || 0) + (deltas.passengers || 0)) / Station.TYPES[ship.Station?.stationType]?.cap || 0,
        deltaValue: (deltas.passengers || 0) / Station.TYPES[ship.Station?.stationType]?.cap || 0
      };
    }
    return result;
  }, [deltas, inventory, ship, stage, statWarnings]);

  return (
    <>
      <FlexSection>
        <ShipInputBlock
          title="Ship"
          disabled={stage !== actionStage.NOT_STARTED}
          ship={ship} />

        <FlexSectionSpacer />

        <CrewInputBlock
          title="Flight Crew"
          crew={pilotCrew} />
      </FlexSection>

      <FlexSection>
        <div style={{ width: '50%' }}>
          <MiniBarChartSection>
            {Object.keys(charts).map((key) => (
              <MiniBarChart
                key={key}
                {...charts[key]}
                warning={statWarnings[key]}
              />
            ))}
          </MiniBarChartSection>
        </div>

        <FlexSectionSpacer />

        {warnings?.length > 0 && (
          <div style={{ alignSelf: 'flex-start', width: '50%' }}>
            {warnings.map(({ icon, text }) => (
              <WarningAlert key={text}>
                <div>{icon}</div>
                <div>{text}</div>
              </WarningAlert>
            ))}
          </div>
        )}
      </FlexSection>
    </>
  );
};

export const InventoryChangeCharts = ({ inventory, inventoryBonuses, deltaMass, deltaVolume, stage = null }) => {
  if (!inventory) return null;

  const capacity = getCapacityStats(inventory, inventoryBonuses);

  // determine if current capacity is pre or post change (based on stage)
  let preDeltaMass, preDeltaVolume, postDeltaMass, postDeltaVolume;
  if (!stage || [actionStage.NOT_STARTED, actionStage.STARTING].includes(stage)) {
    preDeltaMass = capacity.mass.used + capacity.mass.reserved;
    preDeltaVolume = capacity.volume.used + capacity.volume.reserved;
    postDeltaMass = capacity.mass.used + capacity.mass.reserved + deltaMass;
    postDeltaVolume = capacity.volume.used + capacity.volume.reserved + deltaVolume;
  } else {
    preDeltaMass = capacity.mass.used + capacity.mass.reserved - deltaMass;
    preDeltaVolume = capacity.volume.used + capacity.volume.reserved - deltaVolume;
    postDeltaMass = capacity.mass.used + capacity.mass.reserved;
    postDeltaVolume = capacity.volume.used + capacity.volume.reserved;
  }

  const overMassCapacity = postDeltaMass > capacity.mass.max;
  const overVolumeCapacity = postDeltaVolume > capacity.volume.max;
  const massColor = overMassCapacity ? theme.colors.error : theme.colors.main;
  const volumeColor = overVolumeCapacity ? theme.colors.error : theme.colors.main;
  return (
    <>
      <div style={{ paddingBottom: 15 }}>
        <MiniBarChart
          color={massColor}
          label="Mass Capacity"
          valueStyle={{ color: massColor, fontWeight: 'bold' }}
          valueLabel={`${formatFixed(100 * postDeltaMass / capacity.mass.max, 1)}%`}
          value={postDeltaMass / capacity.mass.max}
          deltaColor={overMassCapacity ? theme.colors.error : theme.colors.brightMain}
          deltaValue={deltaMass / capacity.mass.max}
          underLabels={(
            <>
              <span style={{ color: massColor, opacity: deltaMass < 0 ? 0.6 : 1 }}>{deltaMass < 0 ? '-' : '+'}{formatMass(Math.abs(deltaMass))}</span>
              <span style={{ color: overMassCapacity ? theme.colors.error : 'white' }}>{formatMass(capacity.mass.max)}</span>
            </>
          )}
        />
      </div>

      <div style={{ paddingBottom: 5 }}>
        <MiniBarChart
          color={volumeColor}
          label="Volume Capacity"
          valueStyle={{ color: volumeColor, fontWeight: 'bold' }}
          valueLabel={`${formatFixed(100 * postDeltaVolume / capacity.volume.max, 1)}%`}
          value={postDeltaVolume / capacity.volume.max}
          deltaColor={overVolumeCapacity ? theme.colors.error : theme.colors.brightMain}
          deltaValue={deltaVolume / capacity.volume.max}
          underLabels={(
            <>
              <span style={{ color: volumeColor, opacity: deltaVolume < 0 ? 0.6 : 1 }}>{deltaVolume < 0 ? '-' : '+'}{formatVolume(Math.abs(deltaVolume))}</span>
              <span style={{ color: overVolumeCapacity ? theme.colors.error : 'white' }}>{formatVolume(capacity.volume.max)}</span>
            </>
          )}
        />
      </div>
    </>
  );
}

const ActionDialogStat = ({ stat: { isTimeStat, label, value, direction, tooltip, warning } }) => {
  const refEl = useRef();
  const [hovered, setHovered] = useState();
  return (
    <StatRow
      key={label}
      direction={value === '' ? null : direction}
      isTimeStat={reactBool(isTimeStat)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      ref={refEl}>
      <label>{label}</label>
      <span>
        {value}
      </span>
      {value !== '' && tooltip && (
        <MouseoverInfoPane referenceEl={refEl.current} visible={hovered}>
          <MouseoverContent>
            {tooltip}
          </MouseoverContent>
        </MouseoverInfoPane>
      )}
      {value !== '' && warning && (
        <MouseoverIcon icon={<WarningOutlineIcon />} iconStyle={{ fontSize: '125%', marginLeft: 5 }} themeColor={theme.colors.error}>
          {warning}
        </MouseoverIcon>
      )}
    </StatRow>
  );
};

export const ActionDialogStats = ({ stage, stats: rawStats, wide }) => {
  const [open, setOpen] = useState();

  useEffect(() => {
    setOpen(stage === actionStage.NOT_STARTED);
  }, [stage]);

  // remove any conditionally omitted stats
  const stats = useMemo(() => rawStats.filter((s) => !!s), [rawStats]);

  if (!stats?.length) return null;
  return (
    <StatSection actionStage={stage} wide={wide}>
      <SectionTitle
        isDetailsHeader
        isOpen={open}
        onClick={() => setOpen((o) => !o)}>
        <ChevronRightIcon /> Details
      </SectionTitle>
      <SectionBody collapsible isOpen={open}>
        {[0, 1].map((statGroup) => (
          <div key={statGroup}>
            {(statGroup === 0
              ? stats.slice(0, Math.ceil(stats.length / 2))
              : stats.slice(Math.ceil(stats.length / 2))
            ).map((stat) => <ActionDialogStat key={stat.label} stat={stat} />)}
          </div>
        ))}
      </SectionBody>
    </StatSection>
  );
};

const CrewBusyButton = ({ isSequenceable }) => {
  return (
    <Button disabled isTransaction loading>
      {isSequenceable ? 'Schedule Full' : 'Crew Busy'}
    </Button>
  );
};

const CrewNotLaunchedButton = () => {
  return (
    <Button disabled isTransaction>
      Crew Not Launched
    </Button>
  );
};

const NotificationEnabler = styled.label`
  align-items: center;
  color: white;
  cursor: ${p => p.theme.cursors.active};
  display: inline-flex;
  opacity: 0.5;
  transition: opacity 250ms ease;
  & > svg {
    color: ${p => p.theme.colors[p.enabled ? 'main' : 'error']};
    margin-right: 4px;
  }

  &:hover {
    opacity: 0.75;
  }
`;

const NotificationSettingsPrompt = ({ onFinished }) => {
  // TODO: disable finish if form is in invalid state (i.e. email but invalid email)
  // TODO: is isTransaction always true?
  const [loading, setLoading] = useState(false);
  const [valid, setValid] = useState(false);
  return (
    <GenericDialog
      title="Select Your Notification Preference"
      isTransaction
      disabled={!valid}
      loading={loading}
      onConfirm={onFinished}
      confirmText="Continue Action">
      <div style={{ alignItems: 'center', border: 'solid #222', borderWidth: '1px 0', display: 'flex', minHeight: 152 }}>
        <NotificationSettings standalone onLoading={setLoading} onValid={setValid} />
      </div>
    </GenericDialog>
  );
};

export const ActionDialogFooter = ({
  buttonsLoading,
  crewAvailableTime,
  disabled,
  finalizeLabel,
  goLabel,
  goLabelPrice,
  isSequenceable = false,
  requireLaunched = true,
  onClose,
  onFinalize,
  onGo,
  stage,
  taskCompleteTime,
  waitForCrewReady,
  wide
}) => {
  const { crew, isLaunched } = useCrewContext();
  const { data: user, isLoading: userIsLoading } = useUser();
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [promptForNotifications, setPromptForNotifications] = useState(false);

  const allowedOrLaunched = useMemo(() => requireLaunched ? isLaunched : true, [isLaunched, requireLaunched]);

  const finalizeActions = useMemo(() => {
    if (Array.isArray(onFinalize)) {
      return onFinalize.map((onAction, i) => ({
        finalizeLabel: finalizeLabel?.[i],
        onFinalize: onAction
      }));
    }
    return [{ finalizeLabel, onFinalize }];
  }, [finalizeLabel, onFinalize]);

  // only show notification option if i've disabled all and this would have one
  const showNotificationOption = useMemo(() => {
    if (stage === actionStage.NOT_STARTED) {
      if (!crew?._isSimulation && !userIsLoading) {
        // if not subscribed to one of the things that takes time
        // TODO: does this cover ship delivery? can we also show in form_agreement?
        return (
          (!user?.notificationSubscriptions?.CREW && crewAvailableTime?.total > 0) 
          || (!user?.notificationSubscriptions?.TASK && taskCompleteTime?.total > 0) 
          || (!user?.email && (crewAvailableTime?.total > 0 || taskCompleteTime?.total > 0))
        );
      }
    }
    return false;
  }, [crewAvailableTime?.total, stage, taskCompleteTime?.total, userIsLoading, user?.email, user?.notificationSubscriptions]);

  const onBeforeGo = useCallback(async () => {
    if (showNotificationOption && notificationsEnabled) {
      setPromptForNotifications(true);
    } else {
      onGo();
    }
  }, [onGo, notificationsEnabled, showNotificationOption]);

  const onCloseNotificationPrompt = useCallback(() => {
    setPromptForNotifications(false);
    onGo();
  }, [onGo]);

  const isReady = isSequenceable ? crew?._readyToSequence : crew?._ready;
  return (
    <Footer wide={wide}>
      <SectionBody>
        {showNotificationOption && (
          <NotificationEnabler
            enabled={notificationsEnabled}
            onClick={() => setNotificationsEnabled((e) => !e)}>
            {notificationsEnabled ? <CheckedIcon /> : <UncheckedIcon />}
            Notify when Ready
          </NotificationEnabler>
        )}

        <Spacer />

        {stage === actionStage.NOT_STARTED
          ? (
            <>
              <Button
                loading={reactBool(buttonsLoading)}
                onClick={onClose}>
                Cancel
              </Button>
              {waitForCrewReady && !allowedOrLaunched && <CrewNotLaunchedButton />}
              {waitForCrewReady && allowedOrLaunched && !isReady && <CrewBusyButton isSequenceable={isSequenceable} />}
              {(!waitForCrewReady || (isReady && allowedOrLaunched)) && (
                <Button
                  disabled={nativeBool(disabled || userIsLoading)}
                  isTransaction
                  loading={reactBool(buttonsLoading)}
                  onClick={onBeforeGo}>
                  {goLabelPrice > 0
                    ? (
                      <PurchaseButtonInner>
                        <label>{goLabel}</label>
                        <span style={{ marginLeft: 10 }}>
                          <SwayIcon /> {Math.round(goLabelPrice / TOKEN_SCALE[TOKEN.SWAY]).toLocaleString()}
                        </span>
                      </PurchaseButtonInner>
                    )
                    : goLabel
                  }
                </Button>
              )}
            </>
          )
          : (
            stage === actionStage.READY_TO_COMPLETE
              ? (
                <>
                  {finalizeActions?.length === 1 && (
                    <Button
                      loading={reactBool(buttonsLoading)}
                      onClick={onClose}>Close</Button>
                  )}
                  {finalizeActions.map((a, i) => (
                    <Button
                      key={i}
                      disabled={nativeBool(disabled)}
                      isTransaction
                      loading={reactBool(buttonsLoading)}
                      onClick={a.onFinalize}>{a.finalizeLabel || 'Accept'}</Button>
                  ))}
                </>
              )
              : (
                <Button
                  loading={reactBool(buttonsLoading)}
                  onClick={onClose}>Close</Button>
              )
          )}
      </SectionBody>

      {promptForNotifications && createPortal(
        <NotificationSettingsPrompt
          goLabel={goLabel}
          onFinished={onCloseNotificationPrompt}
        />,
        document.body
      )}
    </Footer>
  );
};

export const ActionDialogTabs = ({ tabs, selected, onSelect }) => (
  <Section>
    <Tabs>
      {tabs.filter((t) => !!t).map((tab, i) => (
        <Tab key={i} onClick={() => onSelect(i)} isSelected={reactBool(i === selected)}>
          {tab.icon && <TabIcon style={tab.iconStyle || {}}>{tab.icon}</TabIcon>}
          <div>{tab.label}</div>
        </Tab>
      ))}
    </Tabs>
  </Section>
);

//
// bonus tooltips
//

const Bonuses = styled.div`
  font-size: 95%;
  padding: 0px 15px;
`;
const BonusesHeader = styled.div`
  border-bottom: 1px solid ${borderColor};
  color: white;
  font-weight: bold;
  padding-bottom: 12px;
  text-transform: uppercase;
`;
const BonusesSection = styled.div`
  margin: 0 0 20px;
  &:last-child {
    margin-bottom: 0;
  }
  & table {
    border-collapse: collapse;
    width: 100%;
    & th {
      font-weight: normal;
      text-align: left;
    }
    & td {
      color: white;
      text-align: right;
      &:last-child {
        padding-right: 0;
      }
    }
    & th, & td {
      padding: 5px 10px 5px 0;
      white-space: nowrap;
    }
  }
`;
const BonusItem = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  padding: 5px 0;

  & > span {
    font-weight: bold;
    white-space: nowrap;

    ${p => p.direction !== 0 && `
      color: ${p.direction > 0 ? p.theme.colors.success : p.theme.colors.error};
      ${!p.noIcon && `
        &:after {
          content: "${(p.flip ? -1 : 1) * p.direction > 0 ? '▲' : '▼'}";
          display: inline-block;
          font-size: 7px;
          padding-left: 3px;
          vertical-align: middle;
        }
      `}
    `}
  }
`;
const BonusesSectionHeader = styled(BonusItem)`
  border-bottom: 1px solid ${borderColor};
  color: white;
`;

const BonusesFootnote = styled.div`
  color: ${p => p.warning ? p.theme.colors.orange : p.theme.colors.main};
  font-size: 95%;
  margin-top: -5px;
`;

const extractBonuses = (bonusObj, isTimeStat) => {
  const timeMult = isTimeStat ? -1 : 1;

  const x = [];
  if (bonusObj.class?.classId) {
    const { matches, multiplier, classId } = bonusObj.class;
    x.push({
      text: `${Crewmate.getClass(classId)?.name} on Crew (x${matches})`,
      multiplier,
      direction: getBonusDirection({ totalBonus: multiplier })
    });
  }
  Object.keys(bonusObj.titles || {}).map((titleId) => {
    const { matches, bonus, /* bonusPerMatch */ } = bonusObj.titles[titleId];
    x.push({
      text: `${Crewmate.getTitle(titleId)?.name} on Crew (x${matches})`,
      bonus,
      direction: getBonusDirection({ totalBonus: 1 + timeMult * bonus }, !isTimeStat)
    });
  });
  Object.keys(bonusObj.traits || {}).map((traitId) => {
    const { matches, bonus, /* bonusPerMatch */ } = bonusObj.traits[traitId];
    x.push({
      text: `${Crewmate.getTrait(traitId)?.name} (x${matches})`,
      bonus,
      direction: getBonusDirection({ totalBonus: 1 + timeMult * bonus }, !isTimeStat)
    });
  });
  if (bonusObj.foodMultiplier < 1) {
    x.push({
      text: `Food Rationing Penalty`,
      multiplier: bonusObj.foodMultiplier,
      direction: getBonusDirection({ totalBonus: bonusObj.foodMultiplier })
    });
  }
  if (bonusObj.stationMultiplier !== 1) {
    x.push({
      text: `Station Capacity ${bonusObj.stationMultiplier > 1 ? 'Bonus' : 'Penalty'}`,
      multiplier: bonusObj.stationMultiplier,
      direction: getBonusDirection({ totalBonus: bonusObj.stationMultiplier })
    });
  }
  (bonusObj.others || []).forEach(({ text, bonus, direction }) => {
    x.push({ text, bonus, direction });
  });

  return x
    .filter((b) => (b.multiplier !== undefined && b.multiplier !== 1) || (b.bonus !== undefined && b.bonus !== 0))
    .sort((a, b) => b.bonus - a.bonus);
};

export const BonusTooltip = ({ bonus = {}, details, title, titleValue, isTimeStat }) => {
  const timeMult = isTimeStat ? -1 : 1;
  const titleDirection = getBonusDirection({ totalBonus: bonus.totalBonus });
  const bonuses = useMemo(() => extractBonuses(bonus, isTimeStat), [bonus, isTimeStat]);
  return (
    <Bonuses>
      {(bonus.totalBonus !== 1 || !details) && (
        <>
          <BonusesHeader>Bonuses</BonusesHeader>
          <BonusesSection>
            <BonusesSectionHeader direction={titleDirection} flip={isTimeStat}>
              <label>{title}</label>
              <span>{titleValue}</span>
            </BonusesSectionHeader>
            {bonuses.map(({ text, bonus, multiplier, direction }) => {
              let bonusLabel;
              if (multiplier) {
                bonusLabel = `x${typeof multiplier === 'number' ? formatFixed(multiplier, 3) : multiplier}`;
              } else {
                bonusLabel = `${timeMult > 0 ? '+' : '-'}${formatFixed(100 * bonus, 1)}%`;
              }
              return (
                <BonusItem key={text} direction={direction} noIcon>
                  <label>{text}</label>
                  <span>{bonusLabel}</span>
                </BonusItem>
              );
            })}
          </BonusesSection>
        </>
      )}
      {details && details.rows && (
        <>
          <BonusesHeader>{details.title}</BonusesHeader>
          <BonusesSection>
            <table>
              <tbody>
                {(details.rows || []).map(([label, ...items]) => (
                  <tr key={label}>
                    <th>{label}</th>
                    {items.map((item) => <td key={item}>{item}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </BonusesSection>
        </>
      )}
      {/*
      {crewRequired === 'duration' && (
        <BonusesFootnote warning>
          NOTE: Actions requiring a crew for the duration begin as soon as your crew reaches its destination and end once the crew has finished the task.
        </BonusesFootnote>
      )}
      {crewRequired === 'start' && (
        <BonusesFootnote>
          NOTE: Actions requiring a crew to start will begin as soon as your crew reaches its destination.
        </BonusesFootnote>
      )}
      */}
    </Bonuses>
  );
};

export const FeeBonusTooltip = ({ baseFeeRate, bonusedFeeRate, feeEnforcementBonus, feeReductionBonus, ...props }) => {
  const flip = false;
  const timeMult = 1;
  const reductionBonuses = useMemo(() => extractBonuses(feeReductionBonus, true), [feeReductionBonus]);
  return (
    <Bonuses>
      {feeEnforcementBonus.totalBonus !== 1 && (
        <>
          <BonusesHeader>Marketplace Operator</BonusesHeader>
          <BonusesSection>
            <BonusesSectionHeader direction={feeEnforcementBonus.totalBonus > 1 ? -1 : 1} flip>
              <label>Fee Enforcement Bonus</label>
              <span>x{feeEnforcementBonus.totalBonus}</span>
            </BonusesSectionHeader>
          </BonusesSection>
        </>
      )}
      {feeReductionBonus.totalBonus !== 1 && (
        <>
          <BonusesHeader>Your Crew</BonusesHeader>
          <BonusesSection>
            <BonusesSectionHeader direction={feeReductionBonus.totalBonus > 1 ? 1 : -1}>
              <label>Fee Reduction Bonus</label>
              <span>x{feeReductionBonus.totalBonus}</span>
            </BonusesSectionHeader>
            {reductionBonuses.map(({ text, bonus, multiplier, direction }) => {
              let bonusLabel;
              if (multiplier) {
                bonusLabel = `x${flip ? (Math.round(1000 / multiplier) / 1000) : multiplier}`;
              } else {
                bonusLabel = `${timeMult > 0 ? '+' : '-'}${formatFixed(100 * bonus, 1)}%`;
              }
              return (
                <BonusItem key={text} direction={direction} noIcon>
                  <label>{text}</label>
                  <span>{bonusLabel}</span>
                </BonusItem>
              );
            })}
          </BonusesSection>
        </>
      )}
      {feeEnforcementBonus.totalBonus !== 1 && feeReductionBonus.totalBonus !== 1 && (
        <>
          <BonusesHeader>Summary</BonusesHeader>
          <BonusesSection>
            <BonusesSectionHeader direction={bonusedFeeRate / baseFeeRate > 1 ? -1 : 1} flip>
              <label>Effective Fee</label>
              <span>{formatFixed(100 * bonusedFeeRate, Math.log10(Order.FEE_SCALE / 100))}%</span>
            </BonusesSectionHeader>
            <BonusItem direction={0} noIcon>
              <label>Base Fee</label>
              <span>{formatFixed(100 * baseFeeRate, Math.log10(Order.FEE_SCALE / 100))}%</span>
            </BonusItem>
            <BonusItem direction={bonusedFeeRate / baseFeeRate > 1 ? -1 : 1} noIcon>
              <label>Net Multiplier</label>
              <span>x{bonusedFeeRate / baseFeeRate}</span>
            </BonusItem>
          </BonusesSection>
        </>
      )}
    </Bonuses>
  );
};

export const MaterialBonusTooltip = ({ bonus, title, titleValue, ...props }) => (
  <BonusTooltip
    {...props}
    bonus={bonus}
    title={title}
    titleValue={titleValue}
  />
);

export const TimeBonusTooltip = ({ bonus, title, totalTime, ...props }) => (
  <BonusTooltip
    {...props}
    bonus={bonus}
    isTimeStat
    title={title}
    titleValue={formatTimer(totalTime)}
  />
);

export const TravelBonusTooltip = ({ bonus, totalTime, tripDetails, ...props }) => (
  <BonusTooltip
    {...props}
    bonus={bonus}
    details={{ title: "Trip Details", rows: tripDetails }}
    isTimeStat
    title="Crew Travel Time"
    titleValue={formatTimer(totalTime)}
  />
);

export const LeaseTooltip = ({ desiredTerm, initialTerm, permId, rate }) => {
  return (
    <Bonuses>
      <BonusesHeader>Lease Details</BonusesHeader>
      <BonusesSection>
        <table>
          <tbody>
            <tr>
              <th>Permission</th>
              <td>{Permission.TYPES[permId].name}</td>
            </tr>
            <tr>
              <th>Policy Type</th>
              <td>Prepaid Lease</td>
            </tr>
            <tr><td colSpan="2" style={{ borderBottom: '1px solid #333', height: 0 }} /></tr>
            <tr>
              <th>Requested Time</th>
              <td>{formatFixed(desiredTerm / 3600, 3)} hr</td>
            </tr>
            <tr>
              <th>Minimum Time</th>
              <td style={desiredTerm < initialTerm ? { color: theme.colors.warning } : {}}>
                {desiredTerm < initialTerm && <WarningIcon />}
                <span style={{ marginLeft: 4 }}>{formatFixed(initialTerm / 3600, 3)} hr</span>
              </td>
            </tr>
            <tr>
              <th>Lease Rate</th>
              <td><SwayIcon /> {formatPrice(rate / TOKEN_SCALE[TOKEN.SWAY])} / hr</td>
            </tr>
            <tr><td colSpan="2" style={{ borderBottom: '1px solid #333', height: 0 }} /></tr>
            <tr>
              <th>Total Lease Cost</th>
              <td><SwayIcon /> {formatPrice((rate / TOKEN_SCALE[TOKEN.SWAY]) * Math.max(desiredTerm, initialTerm) / 3600)}</td>
            </tr>
          </tbody>
        </table>
      </BonusesSection>
    </Bonuses>
  );
};

//
// utils
//

export const formatSampleMass = (grams, maximumFractionDigits = 1) => {
  return formatFixed(grams / 1e6, maximumFractionDigits);
};

export const formatSampleVolume = (volume) => {
  return formatFixed(volume, 1);
};

export const getBonusDirection = ({ totalBonus } = {}, biggerIsBetter = true) => {
  if (totalBonus === 1) return 0;
  return (biggerIsBetter === (totalBonus > 1)) ? 1 : -1;
};

export const getTripDetails = (asteroidId, crewTravelBonus, crewDistBonus, originLotIndex, steps, timeAcceleration) => {
  let currentLotIndex = originLotIndex;
  let totalDistance = 0;
  let totalTime = 0;

  const tripDetails = steps.map(({ label, lotIndex, skipToLotIndex }) => {
    const stepDistance = Asteroid.getLotDistance(asteroidId, currentLotIndex, lotIndex) || 0;
    const stepTime = Time.toRealDuration(
      Asteroid.getLotTravelTime(
        asteroidId, currentLotIndex, lotIndex, crewTravelBonus.totalBonus, crewDistBonus.totalBonus
      ) || 0,
      timeAcceleration
    );
    currentLotIndex = skipToLotIndex || lotIndex;

    // agg
    totalDistance += stepDistance;
    totalTime += stepTime;

    // format
    return [
      `${label}:`,
      `${Math.round(stepDistance)}km`,
      formatTimer(stepTime)
    ];
  });
  return { totalDistance, totalTime, tripDetails };
};

export const formatResourceAmountRatio = (numerator, denominator, resourceId, options = {}) => {
  // if non-atomic, determine common unit and scale based on denominator
  if (!Product.TYPES[resourceId].isAtomic) {
    const { unitLabel, scale } = getUnitLabelAndScale(Product.TYPES[resourceId].massPerUnit * denominator, options);
    return {
      numerator: formatResourceMass(numerator, resourceId, { ...options, unitLabel, scale }),
      denominator: formatResourceMass(denominator, resourceId, { ...options, unitLabel, scale }),
      deficit: (numerator < denominator) ? formatMass((denominator - numerator) * Product.TYPES[resourceId].massPerUnit, { ...options, fixedPrecision: 2 }) : 0
    };
  }
  return {
    numerator: formatResourceAmount(numerator, resourceId),
    denominator: formatResourceAmount(denominator, resourceId)
  }
};

export const formatResourceAmount = (units, resourceId, { abbrev = true, minPrecision = 3, fixedPrecision } = {}) => {
  if (!Product.TYPES[resourceId].isAtomic) {
    return formatResourceMass(units, resourceId, { abbrev, minPrecision, fixedPrecision });
  }
  // granular units
  return units.toLocaleString();
};

export const formatResourceMass = (units, resourceId, { abbrev = true, minPrecision = 3, fixedPrecision, unitLabel, scale } = {}) => {
  return formatMass(
    resourceId
      ? units * Product.TYPES[resourceId].massPerUnit
      : 0,
    { abbrev, minPrecision, fixedPrecision, unitLabel, scale }
  );
}

export const getUnitLabelAndScale = (inputGrams, { abbrev = true, minPrecision = 3, fixedPrecision } = {}) => {
  const grams = Math.abs(inputGrams);

  let unitLabel;
  let scale;
  if (grams >= 1e18) {
    return `${(grams / 1e3).toExponential((fixedPrecision || minPrecision || 1) - 1)} ${abbrev ? 'kg' : 'kilograms'}`;
  } else if (grams >= 1e15) {
    scale = 1e15;
    unitLabel = abbrev ? 'Gt' : 'gigatonnes';
  } else if (grams >= 1e12) {
    scale = 1e12;
    unitLabel = abbrev ? 'Mt' : 'megatonnes';
  } else if (grams >= 1e9) {
    scale = 1e9;
    unitLabel = abbrev ? 'kt' : 'kilotonnes';
  } else if (grams >= 1e6 || grams === 0) {
    scale = 1e6;
    unitLabel = abbrev ? 't' : 'tonnes';
  } else if (grams >= 1e3) {
    scale = 1e3;
    unitLabel = abbrev ? 'kg' : 'kilograms';
  } else {
    scale = 1;
    unitLabel = abbrev ? 'g' : 'grams';
  }

  return { unitLabel, scale };
}

export const formatMass = (inputGrams, { abbrev = true, minPrecision = 3, fixedPrecision, ...options } = {}) => {
  let sign = inputGrams < 0 ? '-' : '';
  let unitLabel = options.unitLabel;
  let scale = options.scale;
  if (!unitLabel || !scale) {
    const config = getUnitLabelAndScale(inputGrams, { abbrev, minPrecision, fixedPrecision });
    if (!unitLabel) unitLabel = config.unitLabel
    if (!scale) scale = config.scale;
  }

  const grams = Math.abs(inputGrams);
  const workingUnits = (grams / scale);

  let fixedPlaces = fixedPrecision || 0;
  if (fixedPrecision === undefined && workingUnits > 0) {
    while (workingUnits * 10 ** (fixedPlaces + 1) < 10 ** minPrecision) {
      fixedPlaces++;
    }
  }
  return `${sign}${formatFixed(workingUnits, fixedPlaces)} ${unitLabel}`;
};

export const formatResourceVolume = (units, resourceId, { abbrev = true, minPrecision = 3, fixedPrecision } = {}) => {
  return formatVolume(
    resourceId
      ? units * Product.TYPES[resourceId].volumePerUnit
      : 0,
    { abbrev, minPrecision, fixedPrecision }
  );
}

export const formatVolume = (inputMl, { abbrev = true, minPrecision = 3, fixedPrecision } = {}) => {
  let sign = inputMl < 0 ? '-' : '';

  const ml = Math.abs(inputMl);
  let unitLabel;
  let scale;
  if (ml >= 1e6 || ml === 0) {
    scale = 1e6;
    unitLabel = abbrev ? 'm³' : 'cubic meters';
  } else if (ml >= 1e3) {
    scale = 1e3;
    unitLabel = abbrev ? 'L' : 'liters';
  } else {
    scale = 1;
    unitLabel = abbrev ? 'mL' : 'milliliters';
  }

  const workingUnits = (ml / scale);

  let fixedPlaces = fixedPrecision || 0;
  if (fixedPrecision === undefined && workingUnits > 0) {
    while (workingUnits * 10 ** (fixedPlaces + 1) < 10 ** minPrecision) {
      fixedPlaces++;
    }
  }
  return `${sign}${formatFixed(workingUnits, fixedPlaces)} ${unitLabel}`;
};

export const formatSurfaceDistance = (km) => {
  return `${Math.round(km).toLocaleString()} km`;
};

export const formatBeltDistance = (m) => {
  if (m > constants.AU) {
    return `${(Math.round(100 * m / constants.AU) / 100).toLocaleString()} AU`;
  } else if (m > 1e9) {
    return `${(Math.round(m / 1e8) / 10).toLocaleString()}m km`;
  } else if (m > 1e6) {
    return `${(Math.round(m / 1e5) / 10).toLocaleString()}k km`;
  }
  return `${Math.round(m / 1e3).toLocaleString()} km`;
}

export const formatVelocity = (inputMetersPerSecond, { abbrev = true, minPrecision = 3, fixedPrecision } = {}) => {
  let sign = inputMetersPerSecond < 0 ? '-' : '';

  const metersPerSecond = Math.abs(inputMetersPerSecond);
  let unitLabel;
  let scale;
  if (metersPerSecond >= 1e3) {
    scale = 1e3;
    unitLabel = abbrev ? 'km/s' : 'kilometers / second';
  } else {
    scale = 1;
    unitLabel = abbrev ? 'm/s' : 'meters / second';
  }

  const workingUnits = (metersPerSecond / scale);

  let fixedPlaces = fixedPrecision || 0;
  if (fixedPrecision === undefined && workingUnits > 0) {
    while (workingUnits * 10 ** (fixedPlaces + 1) < 10 ** minPrecision) {
      fixedPlaces++;
    }
  }
  return `${sign}${formatFixed(workingUnits, fixedPlaces)} ${unitLabel}`;
};

export const formatShipStatus = (ship) => {
  if (ship?.Ship?.status === Ship.STATUSES.UNDER_CONSTRUCTION) return 'Under Construction';
  if (ship?.Ship?.transitDeparture > 0) return 'In Flight';
  if (ship?.Ship?.status === Ship.STATUSES.DISABLED) return 'Disabled';

  const loc = ship?.Location?.location;

  if (loc.label === Entity.IDS.BUILDING) {
    return 'In Port';
  } else if (loc.label === Entity.IDS.LOT) {
    return 'On Surface';
  } else if (loc.label === Entity.IDS.ASTEROID) {
    return 'In Orbit';
  }

  console.warn('Unknown ship status', ship)
  return '';
}

export const formatTimeRequirements = (details) => {
  if (Array.isArray(details)) {
    return {
      total: details.reduce((acc, cur) => acc + (cur?.[0] || 0), 0),
      details
    };
  }
  return {
    total: details || 0,
    details: []
  };
};
