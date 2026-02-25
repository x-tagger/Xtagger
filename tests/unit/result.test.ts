import { describe, it, expect } from 'vitest';
import {
  ok, err, isOk, isErr,
  mapResult, flatMapResult, collectResults, getOrElse
} from '../../src/core/shared/result';

describe('Result', () => {
  describe('ok / err factories', () => {
    it('ok creates an Ok result', () => {
      const r = ok(42);
      expect(r.ok).toBe(true);
      expect(r.value).toBe(42);
    });
    it('err creates an Err result', () => {
      const r = err('oops');
      expect(r.ok).toBe(false);
      expect(r.error).toBe('oops');
    });
  });

  describe('isOk / isErr', () => {
    it('isOk returns true for Ok', () => expect(isOk(ok(1))).toBe(true));
    it('isOk returns false for Err', () => expect(isOk(err('x'))).toBe(false));
    it('isErr returns true for Err', () => expect(isErr(err('x'))).toBe(true));
  });

  describe('mapResult', () => {
    it('transforms value in Ok', () => {
      expect(mapResult(ok(5), x => x * 2)).toEqual(ok(10));
    });
    it('passes Err unchanged', () => {
      expect(mapResult(err('e'), x => x)).toEqual(err('e'));
    });
  });

  describe('flatMapResult', () => {
    it('chains Ok results', () => {
      const r = flatMapResult(ok(5), x => ok(x + 1));
      expect(r).toEqual(ok(6));
    });
    it('short-circuits on Err', () => {
      const r = flatMapResult(err<string, string>('fail'), x => ok(x));
      expect(r).toEqual(err('fail'));
    });
  });

  describe('collectResults', () => {
    it('collects all Ok values', () => {
      expect(collectResults([ok(1), ok(2), ok(3)])).toEqual(ok([1, 2, 3]));
    });
    it('returns first Err', () => {
      expect(collectResults([ok(1), err('e'), ok(3)])).toEqual(err('e'));
    });
    it('handles empty array', () => {
      expect(collectResults([])).toEqual(ok([]));
    });
  });

  describe('getOrElse', () => {
    it('returns value for Ok', () => expect(getOrElse(ok(99), 0)).toBe(99));
    it('returns fallback for Err', () => expect(getOrElse(err('x'), 0)).toBe(0));
  });
});
