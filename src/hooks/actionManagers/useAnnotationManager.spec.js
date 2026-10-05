import { act, renderHook } from '@testing-library/react';
import { useContext } from 'react';
import useAnnotationManager from './useAnnotationManager';
import api from '~/lib/api';

jest.mock('react', () => ({ ...jest.requireActual('react'), useContext: jest.fn() }));
jest.mock('@influenceth/sdk', () => ({ Entity: { IDS: { CREW: 1 } } }));
jest.mock('~/contexts/ChainTransactionContext', () => ({}), { virtual: true });
jest.mock('~/hooks/useCrewContext', () => () => ({ crew: { id: 1 } }), { virtual: true });
jest.mock('~/lib/utils', () => ({ maxAnnotationLength: 1000 }), { virtual: true });
jest.mock('~/lib/api', () => ({ getAnnotationHash: jest.fn() }), { virtual: true });

const activity = { event: { transactionHash: '0x123', logIndex: 0 }, entities: [] };
let execute;
beforeEach(() => {
  execute = jest.fn().mockResolvedValue({ status: 'submitted', txHash: '0x456' });
  useContext.mockReturnValue({ execute, getStatus: () => null });
  api.getAnnotationHash.mockReset().mockResolvedValue('hash');
});

test('returns the submitted transaction for the shared button to track', async () => {
  const { result } = renderHook(() => useAnnotationManager(activity));
  let submitted;
  await act(async () => { submitted = await result.current.saveAnnotation('Description'); });
  expect(submitted).toEqual({ status: 'submitted', txHash: '0x456' });
  expect(result.current.savingAnnotation).toBe(false);
});

test.each(['hash', 'wallet'])('clears saving after a %s failure so the user can retry', async (stage) => {
  const error = new Error('Failed');
  (stage === 'hash' ? api.getAnnotationHash : execute).mockRejectedValueOnce(error);
  const { result } = renderHook(() => useAnnotationManager(activity));
  await act(async () => { await expect(result.current.saveAnnotation('Description')).rejects.toBe(error); });
  expect(result.current.savingAnnotation).toBe(false);
  await act(async () => { await result.current.saveAnnotation('Description'); });
  expect(result.current.savingAnnotation).toBe(false);
});
