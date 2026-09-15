import config from './config';

const { resolveConfig } = config;

const runtimeConfig = typeof window === 'undefined' ? {} : (window.INFLUENCE_RUNTIME_CONFIG || {});
const appConfigData = resolveConfig({ ...process.env, ...runtimeConfig }, {
  requireConfigEnvironment: process.env.NODE_ENV === 'production',
  validateRequired: process.env.NODE_ENV !== 'test'
});

const appConfig = {
  get: (key) => {
    if (!Object.prototype.hasOwnProperty.call(appConfigData, key)) throw new Error(`Invalid appConfig key: "${key}"`);
    return appConfigData[key];
  },
  has: (key) => Object.prototype.hasOwnProperty.call(appConfigData, key)
};

export { appConfig };
