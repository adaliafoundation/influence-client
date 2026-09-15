const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const {
  collectRuntimeConfig,
  createRuntimeConfigScript,
  SUPPORTED_VARIABLES
} = require('./runtime-config.cjs');

test('only exposes supported client configuration', () => {
  const config = collectRuntimeConfig({
    REACT_APP_API_INFLUENCE: 'https://api.example.com',
    REACT_APP_NOT_A_CONFIG_VALUE: 'ignored',
    STARKNET_STARTER_PACK_PRIVATE_KEY: 'never-expose-this'
  });

  assert.deepEqual(config, {
    REACT_APP_API_INFLUENCE: 'https://api.example.com'
  });
});

test('includes every versioned app config key in the allowlist', () => {
  assert.equal(SUPPORTED_VARIABLES.has('REACT_APP_STARKNET_ADDRESS_STRKTOKEN'), true);
  assert.equal(SUPPORTED_VARIABLES.has('REACT_APP_API_IPFS'), true);
  assert.equal(SUPPORTED_VARIABLES.has('REACT_APP_CONFIG_ENV'), true);
});

test('requires an explicit deployment environment for container use', () => {
  assert.throws(
    () => collectRuntimeConfig({}, { requireConfigEnvironment: true }),
    /REACT_APP_CONFIG_ENV must be set/
  );
  assert.throws(
    () => collectRuntimeConfig({ REACT_APP_CONFIG_ENV: 'development' }),
    /REACT_APP_CONFIG_ENV must be set/
  );
});

test('serializes values as inert JavaScript data', () => {
  const context = { window: {} };
  const value = '"; globalThis.injected = true; //\n</script>\\';
  vm.runInNewContext(createRuntimeConfigScript({
    REACT_APP_CONFIG_ENV: 'prerelease',
    REACT_APP_API_CLIENTID_GOOGLE: value
  }), context);

  assert.equal(context.injected, undefined);
  assert.equal(context.window.INFLUENCE_RUNTIME_CONFIG.REACT_APP_API_CLIENTID_GOOGLE, value);
  assert.equal(Object.isFrozen(context.window.INFLUENCE_RUNTIME_CONFIG), true);
});

const { resolveConfig, REQUIRED_PATHS, configVariableName } = require('./src/appConfig/config.js');
const requiredEnvironment = Object.fromEntries(REQUIRED_PATHS.map((path) => [configVariableName(path), 'https://operator.example.com']));

test('selects network facts independently of NODE_ENV with operator endpoints', () => {
  for (const [network, chainId] of [['prerelease', '0x534e5f5345504f4c4941'], ['production', '0x534e5f4d41494e']]) {
    const config = resolveConfig({ ...requiredEnvironment, REACT_APP_CONFIG_ENV: network, NODE_ENV: 'production' });
    assert.equal(config['Starknet.chainId'], chainId);
    assert.equal(config['Api.influence'], requiredEnvironment.REACT_APP_API_INFLUENCE);
    assert.equal(config['Privy.appId'], '');
    assert.equal(config['Api.ClientId.stripe'], '');
  }
});

test('parses false and zero as disabled flags and numbers as numbers', () => {
  const config = resolveConfig({
    ...requiredEnvironment, REACT_APP_CONFIG_ENV: 'prerelease',
    REACT_APP_APP_ENABLEDEVTOOLS: 'false', REACT_APP_APP_VERBOSELOGS: '0', REACT_APP_BANXA_MINFIAT: '15'
  });
  assert.equal(config['App.enableDevTools'], false);
  assert.equal(config['App.verboseLogs'], false);
  assert.equal(config['Banxa.minFiat'], 15);
  for (const override of [{ REACT_APP_APP_VERBOSELOGS: 'maybe' }, { REACT_APP_BANXA_MINFIAT: 'NaN' }]) {
    assert.throws(() => resolveConfig({ ...requiredEnvironment, REACT_APP_CONFIG_ENV: 'production', ...override }), /must be/);
  }
});

test('requires core endpoints and the Privy proxy only when Privy is enabled', () => {
  assert.throws(() => collectRuntimeConfig({ REACT_APP_CONFIG_ENV: 'production' }, { requireConfigEnvironment: true }), /Missing required configuration/);
  assert.throws(() => resolveConfig({ ...requiredEnvironment, REACT_APP_CONFIG_ENV: 'production', REACT_APP_PRIVY_APPID: 'public-id' }), /REACT_APP_STARKNET_PAYMASTERPROXY/);
  assert.doesNotThrow(() => resolveConfig({ ...requiredEnvironment, REACT_APP_CONFIG_ENV: 'production' }));
});

test('rejects malformed endpoints without including their values in errors', () => {
  assert.throws(() => resolveConfig({ ...requiredEnvironment, REACT_APP_CONFIG_ENV: 'production', REACT_APP_API_INFLUENCE: 'secret-invalid-endpoint' }), (error) => {
    assert.match(error.message, /REACT_APP_API_INFLUENCE/);
    assert.equal(error.message.includes('secret-invalid-endpoint'), false);
    return true;
  });
});

test('network presets contain no service endpoints or account identifiers', () => {
  for (const network of ['prerelease', 'production']) {
    const config = require(`./src/appConfig/${network}.json`);
    assert.equal(config.Api, undefined);
    assert.equal(config.Privy, undefined);
    assert.equal(config.Starknet.paymaster, undefined);
    assert.equal(config.Url.bridge, undefined);
  }
  assert.equal(SUPPORTED_VARIABLES.has('REACT_APP_URL_BRIDGE'), false);
  assert.equal(SUPPORTED_VARIABLES.has('REACT_APP_API_CLIENTID_WALLETCONNECT'), false);
});
