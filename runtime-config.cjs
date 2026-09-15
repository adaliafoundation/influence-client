const { CONFIG_ENV_VARIABLE, CONFIG_ENVIRONMENTS, SUPPORTED_VARIABLES, resolveConfig } = require('./src/appConfig/config.js');

function collectRuntimeConfig(environment, { requireConfigEnvironment = false } = {}) {
  resolveConfig(environment, { requireConfigEnvironment, validateRequired: requireConfigEnvironment });

  return Object.fromEntries(
    [...SUPPORTED_VARIABLES]
      .sort()
      .filter((name) => Object.prototype.hasOwnProperty.call(environment, name))
      .map((name) => [name, environment[name]])
  );
}

function createRuntimeConfigScript(environment, options) {
  const config = collectRuntimeConfig(environment, options);
  const serialized = JSON.stringify(config)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `window.INFLUENCE_RUNTIME_CONFIG = Object.freeze(${serialized});\n`;
}

module.exports = {
  collectRuntimeConfig,
  CONFIG_ENV_VARIABLE,
  CONFIG_ENVIRONMENTS,
  createRuntimeConfigScript,
  SUPPORTED_VARIABLES
};
