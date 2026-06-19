import { useMemo } from 'react';

import Worker from 'worker-loader!../worker'; // eslint-disable-line

let workerIds = 0;
let workIds = 0;

const maxWorkerTally = 6;
const defaultWorkerTally = Math.max(1, (navigator?.hardwareConcurrency || 4) - 1);
const totalWorkers = Math.min(defaultWorkerTally, maxWorkerTally);

// TODO: remove debug 
// let taskTotal = 0;
// let taskTally = 0;
// let resetPending = true;

// setInterval(() => {
//   if (!resetPending && taskTally > 0) {
//     console.log(
//       `avg response time (over ${taskTally}): ${Math.round(taskTotal / taskTally)}ms`,
//     );
//   }
// }, 5000);

class WorkerThread {
  constructor() {
    this.id = workerIds++;
    this.paramCache = {};
    this.messageCallback = null;

    this.worker = new Worker();
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

class WorkerThreadPool {
  constructor(tally) {
    this.workers = [...Array(tally)].map(_ => new WorkerThread());
    this.available = [...this.workers];
    this.busy = {};
    this.activeByGroup = {};
    this.workQueue = [];
  }

  // i.e. post to all workers in pool
  broadcast(msg) {
    for(let i = 0; i < this.workers.length; i++) {
      this.workers[i].postMessage(msg);
    }
  }

  getWorkerTally() {
    return this.workers.length;
  }

  isBusy() {
    return this.workQueue.length > 0 || Object.keys(this.busy).length > 0;
  }

  addToQueue(workItem, resolve, transfer, options = {}) {
    const meta = {
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
    delete this.busy[worker.id];
  }

  processQueue() {
    while (this.available.length > 0 && this.workQueue.length > 0) {
      const nextIndex = this.getNextWorkIndex();
      if (nextIndex < 0) return;

      const w = this.available.pop();
      const { workItem, resolve: workResolve, transfer, ...work } = this.workQueue.splice(nextIndex, 1)[0];

      this.trackWorkStart(w, work);

      w.postMessage(
        workItem,
        (v) => {
          this.trackWorkEnd(w);
          this.available.push(w);
          if (workResolve) workResolve(v);
          this.processQueue();
        },
        transfer || []
      );
    }
  }
}

const workerThreadPool = new WorkerThreadPool(totalWorkers);

const useWebWorker = () => {
  return useMemo(() => ({
    broadcast: (message) => workerThreadPool.broadcast(message),
    getWorkerTally: () => workerThreadPool.getWorkerTally(),
    processInBackground: (message, callback, transfer, options) => workerThreadPool.addToQueue(message, callback, transfer, options),
    cancelBackgroundProcesses: (filterFunc) => workerThreadPool.removeFromQueue(filterFunc)
  }), []);
};

export default useWebWorker;
