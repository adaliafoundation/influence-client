const { REQUIRED_PATHS, configVariableName } = require('./config.js');

const required = Object.fromEntries(REQUIRED_PATHS.map((path) => [configVariableName(path), 'https://operator.example.com']));
const originalRuntime = window.INFLUENCE_RUNTIME_CONFIG;
const originalApi = process.env.REACT_APP_API_INFLUENCE;

afterEach(() => {
  window.INFLUENCE_RUNTIME_CONFIG = originalRuntime;
  if (originalApi === undefined) delete process.env.REACT_APP_API_INFLUENCE;
  else process.env.REACT_APP_API_INFLUENCE = originalApi;
});

test('runtime overrides win over build values, including an explicitly empty optional value', () => {
  process.env.REACT_APP_API_INFLUENCE = 'https://build.example.com';
  window.INFLUENCE_RUNTIME_CONFIG = {
    ...required,
    REACT_APP_CONFIG_ENV: 'production',
    REACT_APP_PRIVY_APPID: '',
    REACT_APP_API_CLIENTID_STRIPE: '',
    REACT_APP_APP_ENABLEDEVTOOLS: 'false'
  };
  jest.isolateModules(() => {
    const { appConfig } = require('./index');
    expect(appConfig.get('Api.influence')).toBe('https://operator.example.com');
    expect(appConfig.get('Privy.appId')).toBe('');
    expect(appConfig.get('App.enableDevTools')).toBe(false);
    expect(appConfig.get('Starknet.chainId')).toBe('0x534e5f4d41494e');
    const { features } = require('./features');
    expect(features.privy).toBe(false);
    expect(features.stripe).toBe(false);
  });
});
