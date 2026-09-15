const defaults = require('./_default.json');
const networks = {
  prerelease: require('./prerelease.json'),
  production: require('./production.json')
};

const CONFIG_ENV_VARIABLE = 'REACT_APP_CONFIG_ENV';
const CONFIG_ENVIRONMENTS = new Set(Object.keys(networks));
const configVariableName = (path) => `REACT_APP_${path.replace(/\./g, '_').toUpperCase()}`;

function flatten(value, prefix = '') {
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === 'object'
      ? Object.entries(flatten(child, path))
      : [[path, child]];
  }));
}

const defaultValues = flatten(defaults);
const REQUIRED_PATHS = ['Api.influence', 'Api.ipfs', 'Api.avnu', 'Starknet.provider', 'Ethereum.provider'];
const SERVICE_URL_PATHS = [
  ...REQUIRED_PATHS, 'Api.banxa', 'Starknet.providerBackup',
  'Starknet.paymaster', 'Starknet.paymasterProxy'
];
const SUPPORTED_VARIABLES = new Set([CONFIG_ENV_VARIABLE, ...Object.keys(defaultValues).map(configVariableName)]);

function parseValue(path, value) {
  const type = typeof defaultValues[path];
  if (type === 'boolean') {
    if ([true, 'true', '1'].includes(value)) return true;
    if ([false, 'false', '0'].includes(value)) return false;
    throw new Error(`${configVariableName(path)} must be true, false, 1, or 0`);
  }
  if (type === 'number') {
    const number = Number(value);
    if (String(value).trim() && Number.isFinite(number) && number > 0) return number;
    throw new Error(`${configVariableName(path)} must be a positive number`);
  }
  return String(value).trim();
}

function resolveConfig(environment, { requireConfigEnvironment = true, validateRequired = true } = {}) {
  const selection = environment[CONFIG_ENV_VARIABLE];
  if ((!selection && requireConfigEnvironment) || (selection && !CONFIG_ENVIRONMENTS.has(selection))) {
    throw new Error(`${CONFIG_ENV_VARIABLE} must be set to prerelease or production`);
  }
  const values = { ...defaultValues, ...flatten(networks[selection || 'prerelease']) };
  for (const path of Object.keys(defaultValues)) {
    const variable = configVariableName(path);
    if (Object.prototype.hasOwnProperty.call(environment, variable)) {
      values[path] = parseValue(path, environment[variable]);
    }
  }
  if (validateRequired) {
    const required = [...REQUIRED_PATHS];
    if (values['Privy.appId']) required.push('Starknet.paymasterProxy');
    const missing = required.filter((path) => !values[path]);
    if (missing.length) throw new Error(`Missing required configuration: ${missing.map(configVariableName).join(', ')}`);
  }
  for (const path of SERVICE_URL_PATHS) {
    if (!values[path]) continue;
    let url;
    try { url = new URL(values[path]); } catch { /* Report only the variable name below. */ }
    if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new Error(`${configVariableName(path)} must be an HTTP(S) URL without embedded credentials`);
    }
  }
  return values;
}

module.exports = {
  CONFIG_ENV_VARIABLE, CONFIG_ENVIRONMENTS, REQUIRED_PATHS, SERVICE_URL_PATHS,
  SUPPORTED_VARIABLES, configVariableName, resolveConfig
};
