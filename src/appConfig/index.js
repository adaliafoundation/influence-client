import { isPlainObject, reduce } from 'lodash';
import defaultConfig from './_default.json';
import prereleaseConfig from './prerelease.json';
import productionConfig from './production.json';

// 
//                                          NOTES:
// - _default contains a list of all possible config values, though most are not filled in
// - prerelease and production contain the actual values for those environments
// - any value can be overridden by an environment variable... for example, to overwrite 
//  'Api.ClientId.layerswap', you would set `REACT_APP_API_CLIENTID_LAYERSWAP` in your env

function flattenObject(obj, parentKey = '', result = {}) {
  return reduce(obj, (res, value, key) => {
    const newKey = parentKey ? `${parentKey}.${key}` : key;
    if (isPlainObject(value)) {
      flattenObject(value, newKey, res);
    } else {
      res[newKey] = value;
    }
    return res;
  }, result);
}

const runtimeConfig =
  typeof window !== 'undefined'
    ? (window.APP_CONFIG || {})
    : process.env;

// override default config with environment specific config
const configSelection = runtimeConfig.REACT_APP_CONFIG_ENV || process.env.NODE_ENV;
const rawConfig = {
  ...flattenObject(defaultConfig),
  ...flattenObject(configSelection === 'production' ? productionConfig : prereleaseConfig),
};

// override config with environment variables
const appConfigData = reduce(
  rawConfig,
  (res, v, key) => {
    const overrideKey = `REACT_APP_${key.replace(/\./g, '_').toUpperCase()}`;
    if (runtimeConfig.hasOwnProperty(overrideKey)) {
      res[key] = runtimeConfig[overrideKey];
    }
    return res;
  },
  rawConfig
);

const appConfig = {
  get: (key) => {
    if (!appConfigData.hasOwnProperty(key)) throw new Error(`Invalid appConfig key: "${key}"`);
    return appConfigData[key];
  },
  has: (key) => appConfigData.hasOwnProperty(key),
};

export { appConfig };
