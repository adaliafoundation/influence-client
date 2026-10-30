import axios from 'axios';

jest.mock('axios', () => ({ get: jest.fn() }));
jest.mock('~/appConfig', () => ({ appConfig: { get: () => 'https://api.test' } }), { virtual: true });

let maintenance;
beforeEach(() => {
  jest.useFakeTimers();
  jest.isolateModules(() => { maintenance = require('./maintenance'); });
  axios.get.mockReset();
});
afterEach(() => jest.useRealTimers());

const advance = async ms => {
  jest.advanceTimersByTime(ms);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const status = active => ({ data: { active } });

test('deduplicates failures, polls only during maintenance, and signals recovery once', async () => {
  axios.get.mockResolvedValueOnce(status(true)).mockResolvedValueOnce(status(true)).mockResolvedValueOnce(status(false));
  const changed = jest.fn();
  maintenance.subscribeMaintenance(changed);
  const pending = maintenance.checkMaintenance();
  maintenance.checkMaintenance();
  expect(axios.get).toHaveBeenCalledTimes(1);
  await pending;
  expect(maintenance.isMaintenanceActive()).toBe(true);
  maintenance.checkMaintenance();
  expect(axios.get).toHaveBeenCalledTimes(1);
  await advance(60000);
  expect(axios.get).toHaveBeenCalledTimes(2);
  await advance(60000);
  expect(maintenance.isMaintenanceActive()).toBe(false);
  expect(changed).toHaveBeenCalledTimes(2);
  await advance(180000);
  expect(axios.get).toHaveBeenCalledTimes(3);
});

test.each([status(false), { data: {} }])('does not poll when maintenance is unconfirmed: %j', async response => {
  axios.get.mockResolvedValue(response);
  await maintenance.checkMaintenance();
  expect(maintenance.isMaintenanceActive()).toBe(false);
  expect(jest.getTimerCount()).toBe(0);
});

test('an unreachable endpoint leaves normal failures alone and retains confirmed maintenance', async () => {
  axios.get.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(status(true)).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(status(false));
  await maintenance.checkMaintenance();
  expect(jest.getTimerCount()).toBe(0);
  await maintenance.checkMaintenance();
  await advance(60000);
  expect(maintenance.isMaintenanceActive()).toBe(true);
  await advance(60000);
  expect(maintenance.isMaintenanceActive()).toBe(false);
});
