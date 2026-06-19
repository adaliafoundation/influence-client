import { Building, Product, Ship } from '@influenceth/sdk';
import imageManifest from '@influenceth/sdk/images/manifests/images.v1.json';

import licensedMediaManifest from '~/assets/media/licensedMedia.v1.json';
import { appConfig } from '~/appConfig';
import { getIpfsUrl } from '~/lib/ipfsUtils';

const ASSET_CACHE = {};
export const IMAGE_ASSETS = imageManifest.assets || {};
export const LICENSED_MEDIA_ASSETS = licensedMediaManifest.assets || {};

export const getImageAsset = (key) => IMAGE_ASSETS[key];

export const getImageAssetUrl = (assetOrKey) => {
  const asset = typeof assetOrKey === 'string' ? getImageAsset(assetOrKey) : assetOrKey;
  if (!asset?.cid) return undefined;

  return getIpfsUrl(asset.cid);
};

const getClientMediaCid = () => (appConfig.get('ClientMedia.cid') || '').replace(/^\/+|\/+$/g, '');
let warnedMissingClientMediaCid = false;

export const getLicensedMediaAsset = (key) => LICENSED_MEDIA_ASSETS[key];

export const getLicensedAssetUrl = (assetOrKey) => {
  const asset = typeof assetOrKey === 'string' ? getLicensedMediaAsset(assetOrKey) : assetOrKey;
  if (!asset) return undefined;

  const clientMediaCid = getClientMediaCid();
  if (!clientMediaCid) {
    if (!warnedMissingClientMediaCid) {
      console.warn('Missing ClientMedia.cid for licensed media assets');
      warnedMissingClientMediaCid = true;
    }
    return undefined;
  }

  const path = asset.path.replace(/^\/+/, '');
  return getIpfsUrl(`${clientMediaCid}/${path}`);
};

export const getStoryImageUrl = (rawSlug) => {
  if (!rawSlug) return undefined;
  const key = `stories/${rawSlug.replace(/^influence\/(?:production|staging)\/images\/stories\//, '')}`;
  return getLicensedAssetUrl(key);
};

const getSlug = (assetName) => {
  return (assetName || '').replace(/[^a-z]/ig, '');
}

const getManifestIconUrl = (key) => {
  const url = getImageAssetUrl(key);
  if (!url) console.warn('Missing image manifest asset', key);
  return url || '';
};

const getModelUrl = ({ type, assetName, modelVersion, append } = {}) => {
  let slug = `models/${type}/${getSlug(assetName)}${append || ''}`;
  if (modelVersion) slug += `.v${modelVersion}`;
  slug += '.glb';
  return getLicensedAssetUrl(slug);
}

export const BUILDING_SIZES = {
  w400: { w: 400 },
  w1000: { w: 1000 },
};

export const getBuildingIcon = (i, size, isHologram) => {
  let useSize = size;
  if (!size || !BUILDING_SIZES[size]) {
    if (size) console.log('getBuildingIcon - invalid size', size);
    useSize = Object.keys(BUILDING_SIZES)[0];
  }

  const cacheKey = `buildingIcon_${i}_${useSize}_${isHologram}`;
  if (!ASSET_CACHE[cacheKey]) {
    const assetName = Building.TYPES[i]?.name;
    const useSite = isHologram && Number(i) > 0;
    ASSET_CACHE[cacheKey] = getManifestIconUrl(
      `icons/${useSite ? 'buildings-site' : 'buildings'}/${useSize}/${i}-${getSlug(assetName)}${useSite ? '-site' : ''}.png`
    );
  }

  return ASSET_CACHE[cacheKey];
};

export const getLotShipIcon = (i, size) => {
  let useSize = size;
  if (!size || !BUILDING_SIZES[size]) {
    if (size) console.log('getBuildingIcon - invalid size', size);
    useSize = Object.keys(BUILDING_SIZES)[0];
  }

  const cacheKey = `buildingShipIcon_${i}_${useSize}`;
  if (!ASSET_CACHE[cacheKey]) {
    ASSET_CACHE[cacheKey] = getManifestIconUrl(
      `icons/lot-ships/${useSize}/${i}-${getSlug(Ship.TYPES[i]?.name)}.png`
    );
  }

  return ASSET_CACHE[cacheKey];
};


export const PRODUCT_SIZES = {
  w400: { w: 400 },
};

export const getProductIcon = (i, size) => {
  let useSize = size;
  if (!size || !PRODUCT_SIZES[size]) {
    if (size) console.log('getProductIcon - invalid size', size);
    useSize = Object.keys(PRODUCT_SIZES)[0];
  }

  const cacheKey = `productIcon_${i}_${useSize}`;

  if (!ASSET_CACHE[cacheKey]) {
    ASSET_CACHE[cacheKey] = getManifestIconUrl(
      `icons/resources/${useSize}/${i}-${getSlug(Product.TYPES[i]?.name)}.png`
    );
  }

  return ASSET_CACHE[cacheKey];
};

export const SHIP_SIZES = {
  w400: { w: 400 },
};

export const getShipIcon = (i, size, isHologram) => {
  let useSize = size;
  if (!size || !SHIP_SIZES[size]) {
    if (size) console.log('getShipIcon - invalid size', size);
    useSize = Object.keys(SHIP_SIZES)[0];
  }

  const cacheKey = `shipIcon_${i}_${useSize}_${isHologram}`;

  if (!ASSET_CACHE[cacheKey]) {
    ASSET_CACHE[cacheKey] = getManifestIconUrl(
      `icons/${isHologram ? 'ships-holo' : 'ships'}/${useSize}/${i}-${getSlug(Ship.TYPES[i]?.name)}${isHologram ? '-holo' : ''}.png`
    );
  }

  return ASSET_CACHE[cacheKey];
};

export const getShipModel = (i, variant = 1) => {
  const cacheKey = `shipModel_${i}_${variant}`;

  if (!ASSET_CACHE[cacheKey]) {
    const conf = { type: 'ships', assetName: Ship.TYPES[i]?.name };
    if (variant > 1) conf.append = `_Variant${variant}`;
    ASSET_CACHE[cacheKey] = getModelUrl(conf);
  }

  return ASSET_CACHE[cacheKey];
};
