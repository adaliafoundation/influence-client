import create from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import produce from 'immer';
import cloneDeep from 'lodash/cloneDeep';
import isEqual from 'lodash/isEqual';
import { Building, Entity, Lot } from '@influenceth/sdk';

import constants from '~/lib/constants';
import { TOKEN } from '~/lib/priceUtils';
import { safeBigInt } from '~/lib/utils';
import SIMULATION_CONFIG from '~/simulation/simulationConfig';
import { appConfig } from '~/appConfig';

export const STORE_NAME = 'influence';

const {
  CHUNK_RESOLUTION,
  GRAPHICS_DEFAULTS,
  ENABLE_SHADOWS,
  MIN_FOV,
  MAX_FOV
} = constants;

const buildingCategories = Object.values(Building.CATEGORIES).map((k) => k.toString());

const assetSearchDefaults = {
  actionitems: { filters: {}, sort: ['time', 'asc'] },
  agreements: { filters: { timing: ['active', 'recently_expired'] }, sort: ['_agreement.endTime', 'asc'] },
  asteroids: { filters: {}, sort: ['Celestial.radius', 'desc'] },
  asteroidsMapped: { filters: {}, sort: ['Celestial.radius', 'desc'], highlight: null },
  buildings: { filters: {}, sort: ['Building.buildingType', 'asc'] },
  coresamples: { filters: { status: [2,3] }, sort: ['lot.id', 'asc'] },
  crewmates: { filters: {}, sort: ['id', 'asc'] },
  crews: { filters: {}, sort: ['id', 'asc'] },
  eventlog: { filters: {}, sort: ['time', 'desc'] },
  ships: { filters: {}, sort: ['id', 'asc'] },
  orders: { filters: {}, sort: ['id', 'asc'] },
  leases: { filters: {}, sort: ['lot.id', 'asc'] },
  lots: { filters: {}, sort: ['id', 'asc'] },
  lotsMapped: { filters: { category: [...buildingCategories] }, sort: ['id', 'asc'], highlight: null }
};

const simulationStateDefault = {
  step: 0,
  crewmate: null, // id, name, appearance
  lots: null,     // { id: buildingEntity(sparse), ... }
  sway: null,
  actionItems: [],
}

const useStore = create(
  subscribeWithSelector(
    persist((set, get) => ({
        actionDialog: {},
        launcherPage: null,
        launcherSubpage: null,
        openHudMenu: null,
        hudMenuState: {},

        // TODO: more encapsulated structure, but might cause unnecessary re-renders more often
        // simulation: {
        //   enabled,
        //   enabledActions: [],
        //   coachmark: [],
        //   state: { ...simulationStateDefault }
        // },
        isNew: true,
        simulationEnabled: false,
        simulation: { ...simulationStateDefault },
        simulationActions: [],
        coachmarks: [],

        // scene: {
        //   belt: {
        //     origin, destination, hovered, travelMode, travelSolution, cameraPos/* (zoomedFrom) */,
        //   },
        //   asteroid: {
        //     origin, destination, hovered, resourceMap
        //   },
        //   lot: {
        //     model
        //   },
        //   zoomStatus: 'belt', // belt, zooming-in / zooming-out, asteroid, zooming-to-scene, lot
        //   transitionTo: {}
        // },

        asteroids: {
          origin: null,
          destination: null,
          hovered: null,
          lot: null,
          resourceMap: {
            active: false,
            selected: null
          },
          travelMode: false,
          travelSolution: null,
          zoomedFrom: null,
          zoomScene: null,
          zoomStatus: 'out', // out -> zooming-in -> in -> zooming-out -> out
          cinematicInitialPosition: false
        },

        assetSearch: {
          ...assetSearchDefaults
        },
        lotsMappedAssetSearchResults: {},

        currentSession: {},
        sessions: {},
        lastConnectedWalletId: null,

        selectedCrewId: null,
        crewAssignments: {},
        crewTutorials: {},

        cameraNeedsHighAltitude: false,
        cameraNeedsRecenter: false,
        cameraNeedsReorientation: false,

        chatHistory: [],

        hasSeenIntroVideo: false,
        hiddenActionItems: [],
        perProcessLeases: [],
        canvasStack: [],

        logs: {
          alerts: []
        },

        timeOverride: null,

        draggables: {},

        gameplay: {
          activeCrewsDisplay: 'all', // selected, delegated, all
          autoswap: true,
          dismissTutorial: false,
          feeToken: null, // deprecated
          feeTokens: [TOKEN.SWAY, TOKEN.USDC],
          useSessions: null
        },

        graphics: {
          autodetect: true,
          fov: 75,
          lensflare: true,
          pixelRatio: 1,
          skybox: true,
          // (these will default per the gpu tier):
          shadowQuality: undefined,
          textureQuality: undefined,
        },

        sounds: {
          music: appConfig.get('App.defaultMuted') ? 0 : 100,
          effects: appConfig.get('App.defaultMuted') ? 0 : 100,
        },

        failedTransactions: [],
        pendingTransactions: [],

        lotLoader: {
          id: null,
          progress: 0
        },

        effects: {},

        referrer: null,

        preferredUiCurrency: null,

        dmPrivateKey: null,

        //
        // DISPATCHERS

        dispatchIsNotNew: () => set(produce(state => {
          state.isNew = false;
        })),

        dispatchGpuInfo: (gpuInfo) => set(produce(state => {
          // this sets defaults if they are not already
          const defaults = GRAPHICS_DEFAULTS[gpuInfo.tier] || {};
          Object.keys(defaults).forEach((k) => {
            if (!state.graphics.hasOwnProperty(k) || state.graphics[k] === undefined) {
              state.graphics[k] = defaults[k];
            }
          });
        })),

        dispatchEffectStartRequested: (sound, options) => set(produce(state => {
          state.effects[sound] = { status: 'play', ...options };
        })),

        dispatchEffectStarted: (sound) => set(produce(state => {
          state.effects[sound] = { status: 'playing' };
        })),

        dispatchEffectStopRequested: (sound, options) => set(produce(state => {
          state.effects[sound] = { status: 'stop', ...options };
        })),

        dispatchEffectStopped: (sound) => set(produce(state => {
          delete state.effects[sound];
        })),

        dispatchMusicVolumeSet: (volume) => set(produce(state => {
          state.sounds.music = volume;
        })),

        dispatchEffectsVolumeSet: (volume) => set(produce(state => {
          state.sounds.effects = volume;
        })),

        dispatchAlertLogged: (alert) => set(produce(state => {
          state.logs.alerts.unshift(alert);
        })),

        dispatchActionDialog: (type, params = {}) => set(produce(state => {
          state.actionDialog = { type, params };
        })),

        dispatchLauncherPage: (page, subpage) => set(produce(state => {
          if (['play', 'store', 'help', 'rewards', 'settings', 'inbox'].includes(page)) {
            state.launcherPage = page;
            state.launcherSubpage = subpage;
          }
          else if (page) {
            state.launcherPage = 'play';
            state.launcherSubpage = null;
          }
          else {
            state.launcherPage = null;
            state.launcherSubpage = null;
          }
        })),

        dispatchAlertNotified: (alert) => set(produce(state => {
          const index = state.logs.alerts.findIndex(a => a.type === alert.type && a.timestamp === alert.timestamp);
          state.logs.alerts.splice(index, 1);
        })),

        dispatchDraggableClose: (id) => set(produce(state => {
          delete state.draggables[id];
        })),

        dispatchDraggableOpen: (type, params) => set(produce(state => {
          const id = Date.now();
          state.draggables[id] = {
            type,
            params,
            position: { x: 0, y: 0 }, // TODO: ...
            index: Object.values(state.draggables).reduce((acc, cur) => acc < cur.index ? cur.index : acc, 0) + 1,
          };
        })),

        dispatchDraggableToFront: (id) => set(produce(state => {
          if (state.draggables[id]) {
            const maxIndex = Object.values(state.draggables).reduce((acc, cur) => acc < cur.index ? cur.index : acc, 0);
            if (state.draggables[id].index < maxIndex) {
              state.draggables[id].index = maxIndex + 1;
            }
          }
        })),

        dispatchDraggableMoved: (id, position) => set(produce(state => {
          if (state.draggables[id]) {
            state.draggables[id].position = position;
          }
        })),

        dispatchHudMenuOpened: (section) => set(produce(state => {
          state.openHudMenu = section;
        })),

        dispatchGraphicsAutodetectSet: (which, gpuInfo) => set(produce(state => {
          state.graphics.autodetect = which;
          if (state.graphics.autodetect) {
            const defaults = GRAPHICS_DEFAULTS[gpuInfo.tier] || {};
            Object.keys(defaults).forEach((k) => {
              state.graphics[k] = defaults[k];
            });
          }
        })),

        dispatchToggleInterface: (forceHide) => set(produce(state => {
          state.graphics.hideInterface = (forceHide === true || forceHide === false)
            ? forceHide
            : !state.graphics.hideInterface;
        })),

        dispatchToggleDevTools: (force) => set(produce(state => {
          state.graphics.showDevTools = (force === true || force === false)
            ? force
            : !state.graphics.showDevTools;
          if (state.graphics.showDevTools && state.openHudMenu !== 'DEV_TOOLS') {
            state.openHudMenu = 'DEV_TOOLS';
          } else if (!state.graphics.showDevTools && state.openHudMenu === 'DEV_TOOLS') {
            state.openHudMenu = null;
          }
        })),

        dispatchPixelRatio: (ratio) => set(produce(state => {
          state.graphics.pixelRatio = ratio;
        })),

        dispatchTextureQualitySet: (quality) => set(produce(state => {
          state.graphics.textureQuality = quality;
        })),

        dispatchSkyboxHidden: () => set(produce(state => {
          state.graphics.skybox = false;
        })),

        dispatchSkyboxUnhidden: () => set(produce(state => {
          state.graphics.skybox = true;
        })),

        dispatchLensflareHidden: () => set(produce(state => {
          state.graphics.lensflare = false;
        })),

        dispatchLensflareUnhidden: () => set(produce(state => {
          state.graphics.lensflare = true;
        })),

        // 0 is off, 1 is low, 2 is mid, 3 is high
        dispatchShadowQualitySet: (level) => set(produce(state => {
          state.graphics.shadowQuality = level;
        })),

        dispatchFOVSet: (fov) => set(produce(state => {
          if (fov < MIN_FOV || fov > MAX_FOV) return;
          state.graphics.fov = fov;
        })),

        dispatchStatsOn: () => set(produce(state => {
          state.graphics.stats = true;
        })),

        dispatchStatsOff: () => set(produce(state => {
          state.graphics.stats = false;
        })),

        dispatchOriginSelected: (i) => set(produce(state => {
          state.asteroids.origin = null;
          if (i && Number(i) > 0 && Number(i) <= 250000) {
            state.asteroids.origin = Number(i);
          }

          // Allow changing destination to origin
          if (state.asteroids.destination === i) {
            state.asteroids.destination = null;
          }

          state.asteroids.lot = null;
          state.asteroids.travelSolution = null;
          state.asteroids.zoomScene = null;
        })),

        dispatchDestinationSelected: (i) => set(produce(state => {
          if (state.asteroids.origin === i) return;

          state.asteroids.destination = null;
          if (i && Number(i) > 0 && Number(i) <= 250000) {
            state.asteroids.destination = Number(i);
          }
          state.asteroids.travelSolution = null;
        })),

        dispatchTravelMode: (which) => set(produce((state => {
          state.asteroids.travelMode = which;
          if (!which) {
            state.asteroids.travelSolution = null;
          }
        }))),

        dispatchTravelSolution: (solution) => set(produce((state => {
          state.asteroids.travelSolution = solution;
        }))),

        dispatchSwapOriginDestination: () => set(produce((state => {
          if (state.asteroids.origin && state.asteroids.destination) {
            const tmp = state.asteroids.origin;
            state.asteroids.origin = state.asteroids.destination;
            state.asteroids.destination = tmp;
            state.asteroids.travelSolution = null;
          }
        }))),

        dispatchAsteroidHovered: (i) => set(produce(state => {
          state.asteroids.hovered = Number(i);
        })),

        dispatchAsteroidUnhovered: () => set(produce(state => {
          state.asteroids.hovered = null;
        })),

        dispatchZoomStatusChanged: (status, maintainLot) => set(produce(state => {
          state.asteroids.zoomStatus = status;
          if (!maintainLot) {
            state.asteroids.lot = null;
            state.asteroids.zoomScene = null;
          }
        })),

        dispatchCinematicInitialPosition: (which) => set(produce(state => {
          state.asteroids.cinematicInitialPosition = which;
        })),

        dispatchAsteroidZoomedFrom: (from) => set(produce(state => {
          state.asteroids.zoomedFrom = from;
        })),

        dispatchFiltersUpdated: (assetType) => (filters) => set(produce(state => {
          state.assetSearch[assetType].filters = filters;
        })),

        dispatchFilterReset: (assetType, fieldName) => set(produce(state => {
          if (assetSearchDefaults[assetType].filters[fieldName]) {
            state.assetSearch[assetType].filters[fieldName] = cloneDeep(assetSearchDefaults[assetType].filters[fieldName]);
          } else {
            delete state.assetSearch[assetType].filters[fieldName];
          }
        })),

        dispatchFiltersReset: (assetType) => () => set(produce(state => {
          state.assetSearch[assetType].filters = { ...assetSearchDefaults[assetType].filters };
          state.assetSearch[assetType].sort = [ ...assetSearchDefaults[assetType].sort ];
          if (Object.keys(assetSearchDefaults[assetType]).includes('highlight')) {
            state.assetSearch[assetType].highlight = assetSearchDefaults[assetType].highlight
              ? { ...assetSearchDefaults[assetType].highlight }
              : null;
          }
        })),

        dispatchSortUpdated: (assetType) => (sort) => set(produce(state => {
          state.assetSearch[assetType].sort = sort;
        })),

        dispatchHighlightUpdated: (assetType) => (settings) => set(produce(state => {
          state.assetSearch[assetType].highlight = settings || null;
        })),

        dispatchLotsMappedSearchResults: (payload) => set(produce(state => {
          state.lotsMappedAssetSearchResults = { ...payload };
        })),

        dispatchCrewAssignmentPathSelection: (crewId, crewmateId, storyId, pathId) => set(produce(state => {
          const crewKey = `${crewId}_${crewmateId}`;
          if (!state.crewAssignments) state.crewAssignments = {};
          if (!state.crewAssignments[crewKey]) state.crewAssignments[crewKey] = {};
          if (!state.crewAssignments[crewKey][storyId]) state.crewAssignments[crewKey][storyId] = [];
          if (!state.crewAssignments[crewKey][storyId].includes(pathId)) {
            state.crewAssignments[crewKey][storyId].push(pathId);
          }
        })),

        dispatchCrewAssignmentPathUndo: (crewId, crewmateId, storyId) => set(produce(state => {
          const crewKey = `${crewId}_${crewmateId}`;
          if (state.crewAssignments?.[crewKey]?.[storyId]?.length > 0) {
            state.crewAssignments[crewKey][storyId].pop();
          }
        })),

        dispatchCrewAssignmentRestart: (crewId, crewmateId) => set(produce(state => {
          const crewKey = `${crewId}_${crewmateId}`;
          state.crewAssignments[crewKey] = {};
        })),

        dispatchTimeOverride: (anchor, speed) => set((produce(state => {
          state.timeOverride = anchor ? { anchor, speed, ts: Date.now() } : null;
        }))),

        // Starts a session and sets it as the current session
        dispatchSessionStarted: (session) => set(produce(state => {
          state.currentSession = session;
          state.lastConnectedWalletId = session.walletId;
          state.sessions[session.accountAddress] = session;
          state.simulationEnabled = false;
        })),

        // Unsets the current session but keeps it in the sessions list
        dispatchSessionSuspended: () => set(produce(state => {
          state.currentSession = {};
        })),

        // Resumes a session that was suspended
        dispatchSessionResumed: (session) => set(produce(state => {
          state.currentSession = session;
          state.lastConnectedWalletId = session.walletId;
          state.simulationEnabled = false;
        })),

        // Ends a session and removes it from the sessions list
        dispatchSessionEnded: () => set(produce(state => {
          delete state.sessions[state.currentSession?.accountAddress];
          state.currentSession = {};
          state.dmPrivateKey = null;
        })),

        dispatchSimulationEnabled: (which) => set(produce(state => {
          state.simulationEnabled = which;
        })),

        dispatchSimulationStep: (step) => set(produce(state => {
          if (!state.simulation || step === undefined) state.simulation = {};
          state.simulation.step = step;
        })),

        dispatchSimulationState: (key, update, mode = 'replace') => set(produce(state => {
          if (mode === 'append') {
            if (!state.simulation[key]) state.simulation[key] = [];
            state.simulation[key].push(update);
          } else if (mode === 'assign') {
            if (!state.simulation[key]) state.simulation[key] = {};
            Object.keys(update).forEach((k) => state.simulation[key][k] = update[k]);
          } else if (mode === 'increment') {
            state.simulation[key] += update;
          } else {
            state.simulation[key] = update;
          }
        })),

        dispatchSimulationLotState: (lotId, update) => set(produce(state => {
          if (!state.simulation.lots) state.simulation.lots = {};
          if (!state.simulation.lots[lotId]) state.simulation.lots[lotId] = {};
          Object.keys(update).forEach((k) => state.simulation.lots[lotId][k] = update[k]);
        })),

        dispatchSimulationAddToInventory: (destination, slot, product, amount) => set(produce(state => {
          const lotId = Object.keys(state.simulation?.lots || {}).find((lotId) => {
            const lot = state.simulation.lots[lotId];
            return (lot?.shipId === destination.id && destination.label === Entity.IDS.SHIP)
              || (lot?.buildingId === destination.id && destination.label === Entity.IDS.BUILDING);
          });

          if (lotId) {
            if (!state.simulation.lots[lotId].inventoryContents) state.simulation.lots[lotId].inventoryContents = {};
            if (!state.simulation.lots[lotId].inventoryContents[slot]) state.simulation.lots[lotId].inventoryContents[slot] = {};
            if (!state.simulation.lots[lotId].inventoryContents[slot][product]) state.simulation.lots[lotId].inventoryContents[slot][product] = 0;
            state.simulation.lots[lotId].inventoryContents[slot][product] += amount;
          }
        })),

        dispatchSimulationActionItems: (newActivities) => set(produce(state => {
          // console.log('dispatchSimulationActionItems', newActivities);
          if (!state.simulation.actionItems) state.simulation.actionItems = [];
          state.simulation.actionItems.push(...newActivities);
        })),

        dispatchSimulationActionItemResolutions: (eventNames) => set(produce(state => {
          // console.log('dispatchSimulationActionItemResolutions', eventNames);
          if (!state.simulation.actionItems) state.simulation.actionItems = [];
          state.simulation.actionItems = state.simulation.actionItems.filter((a) => !eventNames.includes(a.event.name));
        })),

        dispatchSimulationActions: (actions) => set(produce(state => {
          // console.log('dispatchSimulationActions', actions);
          state.simulationActions = actions || [];
        })),

        dispatchCoachmarks: (coachmarkObj) => set(produce(state => {
          // console.log('dispatchCoachmarks', coachmarkObj);
          state.coachmarks = coachmarkObj || {};
        })),

        dispatchCrewSelected: (crewId) => set(produce(state => {
          state.selectedCrewId = crewId;
          if (crewId && crewId !== SIMULATION_CONFIG.crewId) {
            state.simulationEnabled = false;
            state.simulation = { ...simulationStateDefault };
          }
        })),

        dispatchCutscene: (source, allowSkip) => set(produce(state => {
          state.cutscene = source ? { source, allowSkip: allowSkip || false } : null;
        })),

        dispatchSeenIntroVideo: (which) => set(produce(state => {
          state.hasSeenIntroVideo = which;
        })),

        dispatchReferrerSet: (refCode) => set(produce(state => {
          state.referrer = refCode;
        })),

        dispatchResourceMapToggle: (which) => set(produce(state => {
          state.asteroids.resourceMap.active = which;
        })),

        dispatchResourceMapSelect: (resourceId) => set(produce(state => {
          state.asteroids.resourceMap.selected = Number(resourceId);
          if (!resourceId) state.asteroids.resourceMap.active = false;
        })),

        dispatchLotsLoading: (id, progress = 0, simulateTarget = 0) => set(produce(state => {
          if (simulateTarget) {
            state.lotLoader = { id, progress: state.lotLoader.progress + (simulateTarget - state.lotLoader.progress) / 3 };
          } else {
            state.lotLoader = { id, progress: progress > 0.99 ? 1 : progress };
          }
        })),

        dispatchLotSelected: (lotId) => set(produce(state => {
          state.asteroids.lot = lotId > 0 ? lotId : null;
          state.asteroids.zoomScene = null;
        })),

        dispatchRecenterCamera: (needsRecenter) => set(produce(state => {
          state.cameraNeedsRecenter = !!needsRecenter;
        })),

        dispatchReorientCamera: (needsReorienting) => set(produce(state => {
          state.cameraNeedsReorientation = !!needsReorienting;
        })),

        dispatchGoToHighAltitude: (needsHighAltitude) => set(produce(state => {
          state.cameraNeedsHighAltitude = !!needsHighAltitude;
        })),

        dispatchFailedTransaction: ({ key, vars = {}, meta = {}, txHash, err }) => set(produce(state => {
          if (!state.failedTransactions) state.failedTransactions = [];
          // because different wallets report tx failure in different ways, this is
          // prone to duplicates, so only report one failure per failed transaction
          if (!txHash || !state.failedTransactions.find((tx) => tx.txHash === txHash)) {
            state.failedTransactions.push({
              key,
              vars,
              meta,
              err,
              txHash,
              timestamp: Date.now()
            });
          }
        })),

        dispatchFailedTransactionDismissed: (txHashOrTimestamp) => set(produce(state => {
          if (!state.failedTransactions) state.failedTransactions = [];
          const bTxHashOrTimestamp = txHashOrTimestamp ? safeBigInt(txHashOrTimestamp) : null;
          state.failedTransactions = state.failedTransactions.filter((tx) => safeBigInt(tx.txHash || 0) !== bTxHashOrTimestamp && tx.timestamp !== txHashOrTimestamp);
        })),

        dispatchPendingTransaction: ({ key, vars = {}, meta = {}, timestamp, txHash }) => set(produce(state => {
          if (!state.pendingTransactions) state.pendingTransactions = [];
          state.pendingTransactions.push({
            key,
            vars,
            meta,
            txHash,
            timestamp: timestamp || Date.now() // 1695408166
          });
        })),

        dispatchPendingTransactionUpdate: (txHash, params) => set(produce(state => {
          if (!state.pendingTransactions) state.pendingTransactions = [];
          const txIndex = state.pendingTransactions.findIndex((tx) => tx.txHash === txHash);
          state.pendingTransactions[txIndex] = {
            ...state.pendingTransactions[txIndex],
            ...params
          }
        })),

        dispatchPendingTransactionComplete: (txHash) => set(produce(state => {
          if (!state.pendingTransactions) state.pendingTransactions = [];
          state.pendingTransactions = state.pendingTransactions.filter((tx) => tx.txHash !== txHash);
        })),

        dispatchCanvasStacked: (id) => set(produce(state => {
          if (!state.canvasStack) state.canvasStack = [];
          state.canvasStack.unshift(id);
        })),

        dispatchCanvasUnstacked: (id) => set(produce(state => {
          if (!state.canvasStack) state.canvasStack = [];
          state.canvasStack = state.canvasStack.filter((s) => s !== id);
        })),

        dispatchClearTransactionHistory: () => set(produce(state => {
          state.pendingTransactions = [];
          state.failedTransactions = [];
        })),

        dispatchZoomScene: (details) => set(produce(state => {
          state.asteroids.zoomScene = details || null;
        })),

        dispatchClearChatHistory: () => set(produce(state => {
          state.chatHistory = [];
        })),

        dispatchChatMessage: (body) => set(produce(state => {
          state.chatHistory = [
            ...(state.chatHistory || []).slice(-249),
            { ...body, timestamp: Date.now(), unread: true }
          ];
        })),

        dispatchChatRoomView: (asteroidId) => set(produce(state => {
          state.chatHistory = state.chatHistory.map((c) => ({
            ...c,
            unread: c.asteroidId === asteroidId ? false : c.unread
          }));
        })),

        dispatchChatDisconnectedMessage: () => set(produce(state => {
          if (!state.chatHistory) state.chatHistory = [];
          if (state.chatHistory.length > 0 && !state.chatHistory[state.chatHistory.length - 1].isConnectionBreak) {
            state.chatHistory.push({ isConnectionBreak: true });
          }
        })),

        dispatchToggleHideActionItem: (key) => set(produce(state => {
          if (!key) return;

          if (!state.hiddenActionItems) state.hiddenActionItems = [];
          if (state.hiddenActionItems.includes(key)) {
            state.hiddenActionItems = state.hiddenActionItems.filter((a) => a !== key);
          } else {
            state.hiddenActionItems = [...(state.hiddenActionItems || []), key];
          }
        })),
        dispatchUnhideAllActionItems: () => set(produce(state => {
          state.hiddenActionItems = [];
        })),

        dispatchPerProcessLease: ({ key, endTime }) => set(produce(state => {
          // cleanout leases that ended more than 30 days ago (only show for 7 days)
          const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 86400;
          state.perProcessLeases = (state.perProcessLeases || []).filter((l) => l.endTime < thirtyDaysAgo);

          // add the new lease
          state.perProcessLeases.push({ key, endTime });
        })),

        dispatchPreferredUiCurrency: (token) => set(produce(state => {
          state.preferredUiCurrency = token;
        })),

        dispatchAutoswapEnabled: (which) => set(produce(state => {
          state.gameplay.autoswap = !!which;
        })),

        dispatchTutorialDisabled: (which) => set(produce(state => {
          state.gameplay.dismissTutorial = !!which;
        })),

        dispatchUseSessionsSet: (which) => set(produce(state => {
          state.gameplay.useSessions = which;
        })),

        dispatchFeeTokenToggle: (which) => set(produce(state => {
          if (state.gameplay.feeTokens.includes(which)) {
            state.gameplay.feeTokens = state.gameplay.feeTokens.filter((token) => token !== which);
          } else {
            state.gameplay.feeTokens.push(which);
          }
        })),

        dispatchActiveCrewsDisplaySet: (which) => set(produce(state => {
          state.gameplay.activeCrewsDisplay = which;
        })),

        dispatchDismissCrewTutorial: (crewId, which) => set(produce(state => {
          // (resets dismissedSteps either way)
          state.crewTutorials[crewId] = {
            dismissed: which,
            dismissedSteps: []
          };
        })),
        dispatchDismissCrewTutorialStep: (crewId, step) => set(produce(state => {
          if (!state.crewTutorials[crewId]) {
            state.crewTutorials[crewId] = {
              dismissed: false,
              dismissedSteps: []
            };
          }
          if (!state.crewTutorials[crewId].dismissedSteps.includes(step)) {
            state.crewTutorials[crewId].dismissedSteps.push(step);
          }
        })),

        dispatchHudMenuState: (menu, menuState) => set(produce(state => {
          if (!state.hudMenuState) state.hudMenuState = {};
          if (!state.hudMenuState[menu]) state.hudMenuState[menu] = {};
          state.hudMenuState[menu] = { ...menuState };
        })),

        dispatchDmPrivateKey: (key) => set(produce(state => {
          state.dmPrivateKey = key;
        })),

        //
        // SPECIAL GETTERS

        getPreferredUiCurrency: () => {
          const s = get();
          if ([TOKEN.ETH, TOKEN.USDC].includes(s.preferredUiCurrency)) return s.preferredUiCurrency;
          else if (s.currentSession?.walletId && s.currentSession.walletId !== 'argentWebWallet') return TOKEN.ETH;
          return TOKEN.USDC;
        },

        getShadowQuality: () => {
          // NOTE: 0 is no shadows, 1 is single-light shadows, 2 is CSMs
          //       (support for CSMs has been removed because it was non-performant and didn't look great)
          const q = ENABLE_SHADOWS ? get().graphics?.shadowQuality : 0;
          if (q === 1) return { shadowMode: 1, shadowSize: 1024 };
          if (q === 2) return { shadowMode: 2, shadowSize: 2048 };
          if (q === 3) return { shadowMode: 2, shadowSize: 4096 };
          return { shadowMode: 0, shadowSize: 1024 };
        },

        getTerrainQuality: () => {
          const q = get().graphics?.textureQuality;
          if (q === 2) return { textureSize: 2 * CHUNK_RESOLUTION - 3 };
          if (q === 3) return { textureSize: 4 * CHUNK_RESOLUTION - 3 };
          return { textureSize: 1 * CHUNK_RESOLUTION - 3 };
        },

        isAssetSearchMatchingDefault: (assetType) => {
          if (!assetType) return true;
          return isEqual(get().assetSearch[assetType].filters, assetSearchDefaults[assetType].filters)
            && isEqual(get().assetSearch[assetType].sort, assetSearchDefaults[assetType].sort)
        },

        isAssetSearchFilterMatchingDefault: (assetType, fieldName) => {
          if (!assetType || !fieldName) return true;
          return isEqual(get().assetSearch[assetType].filters[fieldName], assetSearchDefaults[assetType].filters[fieldName]);
        },

    }), {
      name: STORE_NAME,
      version: 7,
      migrate: (persistedState, oldVersion) => {
        const migrations = [
          (state, version) => {
            if (version >= 1) return;
            const active = state.asteroids.mapResourceId ? true : false;
            const selected = state.asteroids.mapResourceId || null;
            state.asteroids.resourceMap = { active, selected };
            return state;
          },
          (state, version) => {
            if (version >= 3) return;
            if (state.asteroids.lot?.asteroidId && state.asteroids.lot?.lotId) {
              state.asteroids.lot = Lot.toId(state.asteroids.lot?.asteroidId, state.asteroids.lot?.lotId);
            } else {
              state.asteroids.lot = null;
            }
            return state;
          },
          (state, version) => {
            if (version >= 4) return;
            state.assetSearch = { ...assetSearchDefaults };
            return state;
          },
          (state, version) => {
            if (version >= 5) return;
            state.gameplay = { autoswap: true };
            return state;
          },
          (state, version) => {
            if (version >= 6) return;
            state.crewTutorials = {};
            return state;
          },
          (state, version) => {
            if (false && version >= 7) return;
            state.gameplay.feeTokens = [TOKEN.USDC, TOKEN.ETH, TOKEN.STRK];
            if (state.gameplay.feeToken !== 'ETH') {
              state.gameplay.feeTokens.unshift(TOKEN.SWAY);
            }
            return state;
          },
        ];

        for (let i = 0; i < migrations.length; i++) {
          persistedState = migrations[i](persistedState, oldVersion);
        }

        return persistedState;
      },
      blacklist: [
        // TODO: should these be stored elsewhere if ephemeral?
        // TODO: the nested values are not supported by zustand
        'actionDialog',
        'asteroids.hovered',
        'asteroids.lot',
        'asteroids.travelMode',
        'asteroids.travelSolution',
        'asteroids.zoomScene',
        'asteroids.cinematicInitialPosition',
        'canvasStack',
        'cameraNeedsRecenter',
        'cameraNeedsReorientation',
        'coachmarks',
        'cutscene',
        'draggables',
        'hudMenuState',
        'lotLoader',
        'simulationActions',
        'timeOverride' // should this be in ClockContext?
      ],

      // accomodate bigint's
      serialize: (state) => {
        return JSON.stringify(state, (_, v) => typeof v === 'bigint' ? `${v.toString()}n` : v);
      },
      deserialize: (stored) => {
        return JSON.parse(stored, (_, v) => {
          if (typeof v === 'string' && /^[0-9]+n$/.test(v)) {
            try { return BigInt(v.slice(0, -1)); } catch(e) { console.warn(e); }
          }
          return v;
        });
      }
    })
  )
);

export default useStore;
