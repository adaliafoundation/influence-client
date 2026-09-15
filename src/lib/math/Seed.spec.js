import Seed from './Seed';
import { Vector3 } from 'three';

test('provides the 16bit representation of seed', () => {
  const seed = '0xafafafafafafafafafaf';
  const expected = parseInt(0xafaf);
  const result = new Seed(seed).get16Bit();
  expect(result).toBe(expected);
});

test('provides a 3D vector representation of seed', () => {
  const seed = '0xafafafafafafafafafaf';
  const expected = new Vector3(parseInt(0xafaf), parseInt(0xafaf), parseInt(0xafaf)).normalize();
  const result = new Seed(seed).getVector3();
  expect(result).toMatchObject(expected);
});
