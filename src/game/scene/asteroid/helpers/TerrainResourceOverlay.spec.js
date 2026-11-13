import TerrainResourceOverlay from './TerrainResourceOverlay';

const chunk = () => {
  const result = { _params: {}, cached: null,
    hasResourceOverlay: (params) => result.cached === params.resource,
    setResourceOverlay: jest.fn((params, bitmap) => { if (bitmap) result.cached = params.resource; }) };
  return result;
};

it('turns off and restores the same resource synchronously without generation', async () => {
  const generate = jest.fn(), report = jest.fn();
  const overlay = new TerrainResourceOverlay(generate, report);
  const a = chunk();
  a.cached = 1;
  overlay.add(a);
  const off = overlay.set(null);
  expect(a.setResourceOverlay).toHaveBeenLastCalledWith(null);
  await off;
  const params = { resource: 1 };
  const on = overlay.set(params);
  expect(a.setResourceOverlay).toHaveBeenLastCalledWith(params);
  await on;
  expect(generate).not.toHaveBeenCalled();
});

it('publishes only resource maps in one completed batch rather than crawling across chunks', async () => {
  const callbacks = [];
  const generate = jest.fn(() => new Promise((resolve) => callbacks.push(resolve)));
  const overlay = new TerrainResourceOverlay(generate, jest.fn());
  const a = chunk(), b = chunk();
  overlay.add(a); overlay.add(b);
  const params = { resource: 2 };
  const pending = overlay.set(params);
  const first = { close: jest.fn() }, second = { close: jest.fn() };
  callbacks[0](first);
  await Promise.resolve();
  expect(a.cached).toBeNull();
  expect(b.cached).toBeNull();
  callbacks[1](second);
  await pending;
  expect(a.setResourceOverlay).toHaveBeenLastCalledWith(params, first);
  expect(b.setResourceOverlay).toHaveBeenLastCalledWith(params, second);
  expect(generate).toHaveBeenCalledTimes(2);
});

it('discards stale maps after rapid deselection or chunk recycling', async () => {
  const callbacks = [];
  const overlay = new TerrainResourceOverlay(() => new Promise((resolve) => callbacks.push(resolve)), jest.fn());
  const a = chunk();
  overlay.add(a);
  const pending = overlay.set({ resource: 1 });
  await overlay.set(null);
  const stale = { close: jest.fn() };
  callbacks[0](stale);
  await pending;
  expect(stale.close).toHaveBeenCalledTimes(1);
  expect(a.cached).toBeNull();

  const next = overlay.set({ resource: 2 });
  overlay.remove(a);
  a._params = {};
  const recycled = { close: jest.fn() };
  callbacks[1](recycled);
  await next;
  expect(recycled.close).toHaveBeenCalledTimes(1);
  expect(a.cached).toBeNull();
});
