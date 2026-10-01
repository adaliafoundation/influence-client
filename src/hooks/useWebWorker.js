import { useMemo } from 'react';
import { BACKGROUND_JOB_TIMEOUT_MS, reportBackgroundWorkError } from '../lib/backgroundWork';

import Worker from 'worker-loader!../worker'; // eslint-disable-line

let workerIds = 0;
let workIds = 0;

const maxWorkerTally = 6;
const defaultWorkerTally = Math.max(1, (navigator?.hardwareConcurrency || 4) - 1);
const totalWorkers = Math.min(defaultWorkerTally, maxWorkerTally);

class WorkerThread {
  constructor(onError) {
    this.id = workerIds++;
    this.paramCache = {};
    this.messageCallback = null;

    this.worker = new Worker();
    this.worker.onerror = (event) => onError(new Error(event.message || 'Scene worker failed'));
    this.worker.onmessageerror = () => onError(new Error('Unable to read scene worker response'));
    this.worker.onmessage = (event) => {
      this.onMessage(event);
    };
  }

  onMessage(event) {
    const callback = this.messageCallback;
    this.messageCallback = null;
    if (callback) callback(event.data);
  }

  postMessage(msg, callback, transfer = []) {
    // if worker has cached cacheable params already, then don't include in params
    // else, if new, then note the new cache key
    if (msg._cacheable) {
      if (this.paramCache[msg._cacheable] === msg[msg._cacheable]?.key) {
        delete msg[msg._cacheable];
      } else {
        this.paramCache[msg._cacheable] = msg[msg._cacheable]?.key;
      }
      delete msg._cacheable;
    }

    msg._id = this.id;
    this.messageCallback = callback;
    this.worker.postMessage(msg, transfer);
  }
}

export class WorkerThreadPool {
  constructor(tally, onError = reportBackgroundWorkError) {
    this.onError = onError;
    this.error = null;
    this.workers = [];
    this.available = [];
    this.busy = {};
    this.activeByGroup = {};
    this.workQueue = [];
    try {
      for (let i = 0; i < tally; i++) {
        this.workers.push(new WorkerThread((error) => this.fail(error)));
      }
      this.available = [...this.workers];
    } catch (error) {
      this.fail(error);
    }
  }

  // A failed pool cannot safely resume consumers expecting geometry or transferred buffers.
  // Stop it and surface a reload instead of returning malformed success results.
  fail(error) {
    if (this.error) return;
    this.error = error;
    Object.values(this.busy).forEach(({ work }) => clearTimeout(work.timer));
    this.workers.forEach(({ worker }) => {
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    });
    this.workQueue = [];
    this.available = [];
    this.busy = {};
    this.activeByGroup = {};
    this.onError(error);
  }

  getWorkerTally() {
    return this.workers.length;
  }

  isBusy() {
    return this.workQueue.length > 0 || Object.keys(this.busy).length > 0;
  }

  addToQueue(workItem, resolve, transfer, options = {}) {
    if (this.error) return;
    const meta = {
      onTiming: options.onTiming,
      queuedAt: options.onTiming ? performance.now() : undefined,
      group: options.group ?? workItem._concurrencyGroup ?? null,
      id: workIds++,
      maxConcurrent: options.maxConcurrent ?? workItem._maxConcurrent ?? Infinity,
      priority: options.priority ?? workItem._priority ?? 0
    };

    delete workItem._concurrencyGroup;
    delete workItem._maxConcurrent;
    delete workItem._priority;

    this.workQueue.push({ workItem, resolve, transfer, ...meta });
    this.processQueue();
  }

  removeFromQueue(filterFunc) {
    this.workQueue = this.workQueue.filter(({ workItem }) => filterFunc(workItem));
  }

  canRunWork(work) {
    if (!work.group) return true;
    return (this.activeByGroup[work.group] || 0) < work.maxConcurrent;
  }

  getNextWorkIndex() {
    let nextIndex = -1;
    for (let i = 0; i < this.workQueue.length; i++) {
      const work = this.workQueue[i];
      if (!this.canRunWork(work)) continue;

      if (
        nextIndex < 0
        || work.priority > this.workQueue[nextIndex].priority
        || (work.priority === this.workQueue[nextIndex].priority && work.id < this.workQueue[nextIndex].id)
      ) {
        nextIndex = i;
      }
    }
    return nextIndex;
  }

  trackWorkStart(worker, work) {
    this.busy[worker.id] = { worker, work };
    if (work.group) {
      this.activeByGroup[work.group] = (this.activeByGroup[work.group] || 0) + 1;
    }
  }

  trackWorkEnd(worker) {
    const busyWork = this.busy[worker.id]?.work;
    if (busyWork?.group) {
      this.activeByGroup[busyWork.group] = Math.max(0, (this.activeByGroup[busyWork.group] || 0) - 1);
    }
    clearTimeout(busyWork?.timer);
    delete this.busy[worker.id];
  }

  processQueue() {
    while (this.available.length > 0 && this.workQueue.length > 0) {
      const nextIndex = this.getNextWorkIndex();
      if (nextIndex < 0) return;

      const w = this.available.pop();
      const { workItem, resolve: workResolve, transfer, ...work } = this.workQueue.splice(nextIndex, 1)[0];

      const startedAt = work.onTiming ? performance.now() : undefined;
      work.timer = setTimeout(() => this.fail(new Error(`Scene worker job ${workItem.topic} timed out`)), BACKGROUND_JOB_TIMEOUT_MS);
      this.trackWorkStart(w, work);

      try {
        w.postMessage(
          workItem,
          (v) => {
            this.trackWorkEnd(w);
            this.available.push(w);
            if (work.onTiming) {
              work.onTiming({
                queueMs: startedAt - work.queuedAt,
                executionMs: performance.now() - startedAt
              });
            }
            try {
              if (workResolve) workResolve(v);
              this.processQueue();
            } catch (error) {
              this.fail(error);
            }
          },
          transfer || []
        );
      } catch (error) {
        this.fail(error);
      }
    }
  }
}

const workerThreadPool = new WorkerThreadPool(totalWorkers);

const useWebWorker = () => {
  return useMemo(() => ({
    getWorkerTally: () => workerThreadPool.getWorkerTally(),
    processInBackground: (message, callback, transfer, options) => workerThreadPool.addToQueue(message, callback, transfer, options),
    cancelBackgroundProcesses: (filterFunc) => workerThreadPool.removeFromQueue(filterFunc)
  }), []);
};

export default useWebWorker;
