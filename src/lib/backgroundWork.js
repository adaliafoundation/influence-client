import create from 'zustand';

export const BACKGROUND_JOB_TIMEOUT_MS = 120000;

export const useBackgroundWorkError = create(() => ({ error: null }));

export const reportBackgroundWorkError = (error) => {
  if (useBackgroundWorkError.getState().error) return;
  console.error('Background scene work failed:', error);
  useBackgroundWorkError.setState({ error });
};

export const withBackgroundWorkTimeout = (promise, description) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`${description} timed out`)), BACKGROUND_JOB_TIMEOUT_MS);
  promise.then(resolve, reject).finally(() => clearTimeout(timer));
});
