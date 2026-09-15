jest.mock('~/hooks/useStore', () => {
  const useStore = jest.fn();
  useStore.getState = jest.fn(() => ({ currentSession: { token: 'stored-token' } }));

  return {
    __esModule: true,
    default: useStore
  };
}, { virtual: true });

const { getApiAuthHeaders } = require('./apiAuth');
const useStore = require('~/hooks/useStore').default;

test('builds bearer auth headers from an explicit token', () => {
  expect(getApiAuthHeaders('explicit-token')).toEqual({
    Authorization: 'Bearer explicit-token'
  });
});

test('builds bearer auth headers from the current session token', () => {
  useStore.getState.mockReturnValue({ currentSession: { token: 'stored-token' } });

  expect(getApiAuthHeaders()).toEqual({
    Authorization: 'Bearer stored-token'
  });
});

test('omits authorization when there is no token', () => {
  expect(getApiAuthHeaders(null)).toEqual({});
});
