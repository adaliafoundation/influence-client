import { WorkerThreadPool } from './useWebWorker';

jest.mock('worker-loader!../worker', () => class {
  postMessage = jest.fn();
}, { virtual: true });

it('drops canceled queued jobs without interrupting active or unrelated work', () => {
  const pool = new WorkerThreadPool(1);
  const active = jest.fn();
  const canceled = jest.fn();
  const retained = jest.fn();
  pool.addToQueue({ owner: 1 }, active);
  pool.addToQueue({ owner: 1 }, canceled);
  pool.addToQueue({ owner: 2 }, retained);
  pool.removeFromQueue((job) => job.owner !== 1);
  const worker = pool.workers[0].worker;
  worker.onmessage({ data: 'first result' });
  expect(active).toHaveBeenCalledWith('first result');
  expect(worker.postMessage.mock.calls[1][0].owner).toBe(2);
  worker.onmessage({ data: 'second result' });
  expect(retained).toHaveBeenCalledWith('second result');
  expect(canceled).not.toHaveBeenCalled();
  expect(pool.isBusy()).toBe(false);
});

it('measures queue wait separately from worker round trip', () => {
  let now = 0;
  const clock = jest.spyOn(performance, 'now').mockImplementation(() => now);
  try {
    const pool = new WorkerThreadPool(1);
    const onTiming = jest.fn();
    pool.addToQueue({}, jest.fn());
    now = 10;
    pool.addToQueue({}, jest.fn(), undefined, { onTiming });
    now = 30;
    pool.workers[0].worker.onmessage({ data: {} });
    now = 45;
    pool.workers[0].worker.onmessage({ data: {} });
    expect(onTiming).toHaveBeenCalledWith({ queueMs: 20, executionMs: 15 });
  } finally {
    clock.mockRestore();
  }
});
