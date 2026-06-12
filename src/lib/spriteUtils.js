import { useEffect, useState } from 'react';
import { Crewmate } from '@influenceth/sdk';

import { getImageAsset, getImageAssetUrl } from '~/lib/assetUtils';
import { safeBigInt } from '~/lib/utils';

const RESOURCE_ATLAS_KEY = 'sprites/atlases/resources/resources.250w.json';
const RESOURCE_SHEET_KEY = 'sprites/resources/250w/resources.250w.png';
const BUILDING_ATLAS_KEY = 'sprites/atlases/buildings/buildings.150w.json';
const BUILDING_SHEET_KEY = 'sprites/buildings/150w/buildings.150w.png';
const SHIP_ATLAS_KEY = 'sprites/atlases/ships/ships.150w.json';
const SHIP_SHEET_KEY = 'sprites/ships/150w/ships.150w.png';

const CREWMATE_ATLAS_KEYS = {
  body: 'sprites/atlases/crewmates/crewmates-body.250w.json',
  feature: 'sprites/atlases/crewmates/crewmates-feature.250w.json',
  hair: 'sprites/atlases/crewmates/crewmates-hair.250w.json',
  headPiece: 'sprites/atlases/crewmates/crewmates-headPiece.250w.json',
  item: 'sprites/atlases/crewmates/crewmates-item.250w.json',
  leadership: 'sprites/atlases/crewmates/crewmates-leadership.250w.json',
  misc: 'sprites/atlases/crewmates/crewmates-misc.250w.json',
  outfit: 'sprites/atlases/crewmates/crewmates-outfit.250w.json'
};

const CREWMATE_SHEET_KEYS = {
  body: 'sprites/crewmates/250w/crewmates-body.250w.png',
  feature: 'sprites/crewmates/250w/crewmates-feature.250w.png',
  hair: 'sprites/crewmates/250w/crewmates-hair.250w.png',
  headPiece: 'sprites/crewmates/250w/crewmates-headPiece.250w.png',
  item: 'sprites/crewmates/250w/crewmates-item.250w.png',
  leadership: 'sprites/crewmates/250w/crewmates-leadership.250w.png',
  misc: 'sprites/crewmates/250w/crewmates-misc.250w.png',
  outfit: 'sprites/crewmates/250w/crewmates-outfit.250w.png'
};

const CREWMATE_MID_PREFIX = 'compositor/mid/crewmates/400w';
const CREWMATE_MID_WIDTH = 400;

const ALL_ATLAS_KEYS = [
  RESOURCE_ATLAS_KEY,
  BUILDING_ATLAS_KEY,
  SHIP_ATLAS_KEY,
  ...Object.values(CREWMATE_ATLAS_KEYS)
];

export const SPRITE_ATLAS_GROUPS = {
  all: ALL_ATLAS_KEYS,
  buildings: [BUILDING_ATLAS_KEY],
  crewmates: Object.values(CREWMATE_ATLAS_KEYS),
  resources: [RESOURCE_ATLAS_KEY],
  ships: [SHIP_ATLAS_KEY]
};

const atlasCache = {};
const atlasPromises = {};
const atlasSubscribers = new Set();
const imageCache = {};
const crewmateUrlCache = new Map();
const MAX_CREWMATE_CACHE_ENTRIES = 300;

const notifyAtlasSubscribers = () => {
  atlasSubscribers.forEach((subscriber) => subscriber());
};

const loadSpriteAtlas = (key) => {
  if (atlasCache[key]) return Promise.resolve(atlasCache[key]);
  if (!atlasPromises[key]) {
    const url = getImageAssetUrl(key);
    if (!url) return Promise.resolve(null);

    atlasPromises[key] = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load sprite atlas ${key}: ${response.status}`);
        return response.json();
      })
      .then((atlas) => {
        atlasCache[key] = atlas;
        notifyAtlasSubscribers();
        return atlas;
      })
      .catch((error) => {
        console.warn(error);
        delete atlasPromises[key];
        return null;
      });
  }
  return atlasPromises[key];
};

export const loadSpriteAtlases = (keys = ALL_ATLAS_KEYS) => Promise.all(keys.map(loadSpriteAtlas));

export const useSpriteAtlases = (keys = ALL_ATLAS_KEYS) => {
  const keySignature = keys.join('|');
  const [loadVersion, setLoadVersion] = useState(0);

  useEffect(() => {
    const subscriber = () => setLoadVersion((version) => version + 1);
    atlasSubscribers.add(subscriber);
    return () => atlasSubscribers.delete(subscriber);
  }, []);

  useEffect(() => {
    loadSpriteAtlases(keys);
  }, [keySignature]); // eslint-disable-line react-hooks/exhaustive-deps

  return keys.every((key) => !!atlasCache[key]) || loadVersion < 0;
};

const backgroundPercent = (offset, sheetSize, frameSize) => {
  if (sheetSize === frameSize) return '0%';
  return `${offset * 100 / (sheetSize - frameSize)}%`;
};

const getAtlasSpriteStyle = (atlas, sheetUrl, frame) => {
  if (!atlas || !sheetUrl || !frame) return null;
  return {
    backgroundImage: `url("${sheetUrl}")`,
    backgroundPosition: `${backgroundPercent(frame.x, atlas.width, frame.w)} ${backgroundPercent(frame.y, atlas.height, frame.h)}`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${atlas.width * 100 / frame.w}% ${atlas.height * 100 / frame.h}%`
  };
};

export const getProductSpriteStyle = (productId) => {
  const atlas = atlasCache[RESOURCE_ATLAS_KEY];
  const frame = atlas?.frames?.[String(productId)];
  return getAtlasSpriteStyle(atlas, getImageAssetUrl(RESOURCE_SHEET_KEY), frame);
};

export const getBuildingSpriteStyle = (buildingType, isHologram) => {
  const atlas = atlasCache[BUILDING_ATLAS_KEY];
  const frame = atlas?.frames?.[`${isHologram ? 'buildingSite' : 'building'}:${buildingType || 0}`];
  return getAtlasSpriteStyle(atlas, getImageAssetUrl(BUILDING_SHEET_KEY), frame);
};

export const getShipSpriteStyle = (shipType, isHologram) => {
  const atlas = atlasCache[SHIP_ATLAS_KEY];
  const frame = atlas?.frames?.[`${isHologram ? 'shipHolo' : 'ship'}:${Math.abs(shipType || 0)}`];
  return getAtlasSpriteStyle(atlas, getImageAssetUrl(SHIP_SHEET_KEY), frame);
};

export const getLotShipSpriteStyle = (shipType) => {
  const atlas = atlasCache[SHIP_ATLAS_KEY];
  const frame = atlas?.frames?.[`lotShip:${Math.abs(shipType || 0)}`];
  return getAtlasSpriteStyle(atlas, getImageAssetUrl(SHIP_SHEET_KEY), frame);
};

const getImage = async (url) => {
  if (!url) return null;
  if (!imageCache[url]) {
    imageCache[url] = fetch(url, { mode: 'cors' })
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load image ${url}: ${response.status}`);
        return response.blob();
      })
      .then((blob) => URL.createObjectURL(blob))
      .then((objectUrl) => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = (error) => {
          URL.revokeObjectURL(objectUrl);
          reject(error);
        };
        image.src = objectUrl;
      })).then(async (image) => {
      if (image.decode) {
        try {
          await image.decode();
        } catch {
          // Some browsers reject decode() after onload for cached images; the loaded image is still usable.
        }
      }
      return image;
    });
  }
  return imageCache[url];
};

const getCanvasBlob = (canvas) => new Promise((resolve, reject) => {
  try {
    canvas.toBlob(resolve, 'image/png');
  } catch (error) {
    reject(error);
  }
});

const getCrewmateAtlas = (atlasKey) => atlasCache[CREWMATE_ATLAS_KEYS[atlasKey]];

const getCrewmateDimensions = () => {
  const atlas = getCrewmateAtlas('body');
  const width = atlas?.targetWidth || 250;
  return {
    height: Math.round(1200 * width / 900),
    width
  };
};

const hasFrame = (atlasKey, frameKey) => !!getCrewmateAtlas(atlasKey)?.frames?.[frameKey];

const getCrewmateCompositorKey = (atlasKey, frameKey) => (
  atlasKey === 'misc'
    ? `${CREWMATE_MID_PREFIX}/${frameKey}.png`
    : `${CREWMATE_MID_PREFIX}/${atlasKey}/${frameKey}.png`
);

const hasCompositorFrame = (atlasKey, frameKey) => !!getImageAsset(getCrewmateCompositorKey(atlasKey, frameKey));

const addLayer = (layers, atlasKey, frameKey, hasLayer) => {
  if (hasLayer(atlasKey, frameKey)) layers.push({ atlasKey, frameKey });
};

const getCrewmateParts = (crewmate = {}) => {
  const component = crewmate.Crewmate || crewmate;
  const appearanceValue = component.appearance || 0;
  const hasAppearance = safeBigInt(appearanceValue || 0) > 0n;
  const appearance = hasAppearance
    ? Crewmate.unpackAppearance(appearanceValue)
    : {};

  return {
    gender: appearance.gender,
    body: appearance.body || 0,
    face: appearance.face,
    hair: appearance.hair,
    hairColor: appearance.hairColor,
    clothes: appearance.clothes,
    head: appearance.head,
    item: appearance.item,
    collection: component.coll || 0,
    crewClass: component.class || 0,
    title: component.title,
    hasAppearance
  };
};

export const canUseCrewmateSprite = (crewmate = {}) => {
  const { collection, hasAppearance } = getCrewmateParts(crewmate);
  return collection === 0 || hasAppearance;
};

export const getCrewmateSpriteKey = (crewmate = {}) => {
  const parts = getCrewmateParts(crewmate);
  return [
    'crewmate-v1',
    parts.collection,
    parts.crewClass,
    parts.title,
    parts.gender,
    parts.body,
    parts.face,
    parts.hair,
    parts.hairColor,
    parts.clothes,
    parts.head,
    parts.item
  ].join(':');
};

const getCrewmateLayers = (crewmate = {}, hasLayer = hasFrame) => {
  const {
    gender,
    body,
    face,
    hair,
    hairColor,
    clothes,
    head,
    item,
    collection,
    title
  } = getCrewmateParts(crewmate);
  const layers = [];

  if (collection === 0) addLayer(layers, 'body', `body${body}`, hasLayer);

  if ([1, 2, 4].includes(collection)) {
    if ([2, 3, 4, 5].includes(item)) addLayer(layers, 'item', `item${item}`, hasLayer);

    if (hasLayer('body', `body${body}_feature${face}`)) {
      addLayer(layers, 'body', `body${body}_feature${face}`, hasLayer);
    } else {
      addLayer(layers, 'body', `body${body}`, hasLayer);
    }

    if (hasLayer('outfit', `outfit${clothes}_body${body}`)) {
      addLayer(layers, 'outfit', `outfit${clothes}_body${body}`, hasLayer);
    } else {
      addLayer(layers, 'outfit', `outfit${clothes}`, hasLayer);
    }

    addLayer(layers, 'item', `item${item}_outfit${clothes}_sex${gender}`, hasLayer);

    if (head !== 5) {
      if (hasLayer('hair', `hair${hair}_hairColor${hairColor}_body${body}`)) {
        addLayer(layers, 'hair', `hair${hair}_hairColor${hairColor}_body${body}`, hasLayer);
      } else {
        addLayer(layers, 'hair', `hair${hair}_hairColor${hairColor}`, hasLayer);
      }
    }

    if (![4, 5].includes(head)) {
      addLayer(layers, 'feature', `feature${face}_hairColor${hairColor}_body${body}`, hasLayer);
    }

    if (hasLayer('headPiece', `headPiece${head}_hair${hair}_body${body}`)) {
      addLayer(layers, 'headPiece', `headPiece${head}_hair${hair}_body${body}`, hasLayer);
    } else if (hasLayer('headPiece', `headPiece${head}_hair${hair}_sex${gender}`)) {
      addLayer(layers, 'headPiece', `headPiece${head}_hair${hair}_sex${gender}`, hasLayer);
    } else if (hasLayer('headPiece', `headPiece${head}_hair${hair}`)) {
      addLayer(layers, 'headPiece', `headPiece${head}_hair${hair}`, hasLayer);
    } else if (hasLayer('headPiece', `headPiece${head}_body${body}`)) {
      addLayer(layers, 'headPiece', `headPiece${head}_body${body}`, hasLayer);
    } else {
      addLayer(layers, 'headPiece', `headPiece${head}`, hasLayer);
    }
  }

  if (collection === 3) addLayer(layers, 'leadership', String(title), hasLayer);

  return layers;
};

const drawFrame = async (targetCtx, atlasKey, frameKey) => {
  const atlas = getCrewmateAtlas(atlasKey);
  const frame = atlas?.frames?.[frameKey];
  if (!frame) return false;

  const sheet = await getImage(getImageAssetUrl(CREWMATE_SHEET_KEYS[atlasKey]));
  if (!sheet) return false;
  const { height, width } = getCrewmateDimensions();
  targetCtx.drawImage(
    sheet,
    frame.x,
    frame.y,
    frame.w,
    frame.h,
    0,
    0,
    width,
    height
  );
  return true;
};

const drawCompositorFrame = async (targetCtx, atlasKey, frameKey) => {
  const url = getImageAssetUrl(getCrewmateCompositorKey(atlasKey, frameKey));
  if (!url) return false;

  const image = await getImage(url);
  if (!image) return false;
  const height = Math.round(1200 * CREWMATE_MID_WIDTH / 900);
  targetCtx.drawImage(image, 0, 0, CREWMATE_MID_WIDTH, height);
  return true;
};

const rememberCrewmateUrl = (key, url) => {
  crewmateUrlCache.set(key, url);
  if (crewmateUrlCache.size <= MAX_CREWMATE_CACHE_ENTRIES) return;

  const [oldestKey, oldestUrl] = crewmateUrlCache.entries().next().value || [];
  if (oldestKey) {
    URL.revokeObjectURL(oldestUrl);
    crewmateUrlCache.delete(oldestKey);
  }
};

export const getCrewmateSpriteImageUrl = async (crewmate = {}) => {
  const key = getCrewmateSpriteKey(crewmate);
  const cached = crewmateUrlCache.get(key);
  if (cached) {
    crewmateUrlCache.delete(key);
    crewmateUrlCache.set(key, cached);
    return cached;
  }

  if (!canUseCrewmateSprite(crewmate)) return null;

  await loadSpriteAtlases(SPRITE_ATLAS_GROUPS.crewmates);

  const { height, width } = getCrewmateDimensions();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const layers = getCrewmateLayers(crewmate);
  for (const layer of layers) {
    await drawFrame(ctx, layer.atlasKey, layer.frameKey);
  }

  if (hasFrame('misc', 'texture')) {
    const textureCanvas = document.createElement('canvas');
    textureCanvas.width = width;
    textureCanvas.height = height;
    const textureCtx = textureCanvas.getContext('2d');
    if (textureCtx) {
      await drawFrame(textureCtx, 'misc', 'texture');
      textureCtx.globalCompositeOperation = 'destination-in';
      textureCtx.drawImage(canvas, 0, 0);
      ctx.globalCompositeOperation = 'soft-light';
      ctx.drawImage(textureCanvas, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  const blob = await getCanvasBlob(canvas);
  if (!blob) return null;

  const url = URL.createObjectURL(blob);
  rememberCrewmateUrl(key, url);
  return url;
};

export const getCrewmateCompositorImageUrl = async (crewmate = {}) => {
  const key = `crewmate-mid:${getCrewmateSpriteKey(crewmate)}`;
  const cached = crewmateUrlCache.get(key);
  if (cached) {
    crewmateUrlCache.delete(key);
    crewmateUrlCache.set(key, cached);
    return cached;
  }

  if (!canUseCrewmateSprite(crewmate)) return null;

  const height = Math.round(1200 * CREWMATE_MID_WIDTH / 900);
  const canvas = document.createElement('canvas');
  canvas.width = CREWMATE_MID_WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const layers = getCrewmateLayers(crewmate, hasCompositorFrame);
  for (const layer of layers) {
    await drawCompositorFrame(ctx, layer.atlasKey, layer.frameKey);
  }

  if (hasCompositorFrame('misc', 'texture')) {
    const textureCanvas = document.createElement('canvas');
    textureCanvas.width = CREWMATE_MID_WIDTH;
    textureCanvas.height = height;
    const textureCtx = textureCanvas.getContext('2d');
    if (textureCtx) {
      await drawCompositorFrame(textureCtx, 'misc', 'texture');
      textureCtx.globalCompositeOperation = 'destination-in';
      textureCtx.drawImage(canvas, 0, 0);
      ctx.globalCompositeOperation = 'soft-light';
      ctx.drawImage(textureCanvas, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  const blob = await getCanvasBlob(canvas);
  if (!blob) return null;

  const url = URL.createObjectURL(blob);
  rememberCrewmateUrl(key, url);
  return url;
};
