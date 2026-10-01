import { WorkerThreadPool } from './useWebWorker';
import Worker from 'worker-loader!../worker'; // eslint-disable-line import/no-webpack-loader-syntax
import { BACKGROUND_JOB_TIMEOUT_MS } from '../lib/backgroundWork';

jest.mock('worker-loader!../worker', () => class {
  constructor() {
    if (this.constructor.constructionError) throw this.constructor.constructionError;
  }
  postMessage = jest.fn();
  terminate = jest.fn();
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


it.each(['onerror', 'onmessageerror'])('stops failed work and surfaces %s once', (eventName) => {
  const onError = jest.fn();
  const pool = new WorkerThreadPool(1, onError);
  const callback = jest.fn();
  pool.addToQueue({ topic: 'geometry', _concurrencyGroup: 'terrain', _maxConcurrent: 1 }, callback);
  pool.addToQueue({ topic: 'queued' }, callback);
  const worker = pool.workers[0].worker;
  worker[eventName]({ message: 'GPU worker failed' });
  expect(onError).toHaveBeenCalledTimes(1);
  expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
  expect(callback).not.toHaveBeenCalled();
  expect(worker.terminate).toHaveBeenCalledTimes(1);
  expect(pool.isBusy()).toBe(false);
  expect(pool.activeByGroup).toEqual({});
  pool.addToQueue({ topic: 'after failure' }, callback);
  expect(worker.postMessage).toHaveBeenCalledTimes(1);
  expect(worker.onmessage).toBeNull();
});

it('surfaces dispatch failures instead of leaving an occupied worker slot', () => {
  const onError = jest.fn();
  const pool = new WorkerThreadPool(1, onError);
  const error = new Error('DataCloneError');
  pool.workers[0].worker.postMessage.mockImplementation(() => { throw error; });
  pool.addToQueue({ topic: 'geometry' }, jest.fn());
  expect(onError).toHaveBeenCalledWith(error);
  expect(pool.isBusy()).toBe(false);
});

it('times out only active jobs and clears the timer on success', () => {
  jest.useFakeTimers();
  try {
    const onError = jest.fn();
    const pool = new WorkerThreadPool(1, onError);
    pool.addToQueue({ topic: 'first' }, jest.fn());
    pool.addToQueue({ topic: 'second' }, jest.fn());
    jest.advanceTimersByTime(BACKGROUND_JOB_TIMEOUT_MS - 1);
    pool.workers[0].worker.onmessage({ data: {} });
    jest.advanceTimersByTime(1);
    expect(onError).not.toHaveBeenCalled();
    jest.advanceTimersByTime(BACKGROUND_JOB_TIMEOUT_MS - 1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toContain('second');
    expect(pool.isBusy()).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});


it('surfaces worker creation failures without preventing the application from mounting', () => {
  const error = new Error('Worker blocked by browser');
  Worker.constructionError = error;
  try {
    const onError = jest.fn();
    const pool = new WorkerThreadPool(2, onError);
    expect(onError).toHaveBeenCalledWith(error);
    expect(pool.isBusy()).toBe(false);
    expect(pool.available).toEqual([]);
  } finally {
    Worker.constructionError = null;
  }
});
