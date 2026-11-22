/**
 * Normalizes and validates an array of real intervals `[lo, hi]`, returning a
 * new sorted array of pairwise strictly disjoint, merged intervals.
 *
 * @param {Array<[number, number]>} intervals - Input array of `[lo, hi]` pairs.
 * @param {string} name - Parameter name used in error messages.
 * @returns {Array<[number, number]>} Sorted, merged, disjoint intervals.
 * @throws {TypeError} If `intervals` is not an array, an element is not an array,
 *   or any endpoint is not a number.
 * @throws {RangeError} If an interval does not have length 2, has `NaN` bounds,
 *   has `lo > hi`, or has degenerate infinite bounds (`lo === Infinity` or
 *   `hi === -Infinity`).
 */
function normalizeIntervals(intervals, name) {
  if (!Array.isArray(intervals)) {
    throw new TypeError(`${name} must be an array of [lo, hi] intervals`);
  }

  const validated = [];
  for (let i = 0; i < intervals.length; i++) {
    const interval = intervals[i];
    if (!Array.isArray(interval)) {
      throw new TypeError(`${name}[${i}] must be a [lo, hi] array`);
    }
    if (interval.length !== 2) {
      throw new RangeError(`${name}[${i}] must have length 2`);
    }

    let lo = interval[0];
    let hi = interval[1];
    if (typeof lo !== 'number' || typeof hi !== 'number') {
      throw new TypeError(`${name}[${i}] bounds must be numbers`);
    }
    if (Number.isNaN(lo) || Number.isNaN(hi)) {
      throw new RangeError(`${name}[${i}] bounds must not be NaN`);
    }
    if (lo === Infinity || hi === -Infinity) {
      throw new RangeError(
        `${name}[${i}] cannot have lo === Infinity or hi === -Infinity`
      );
    }
    if (lo > hi) {
      throw new RangeError(`${name}[${i}] must satisfy lo <= hi`);
    }

    if (lo === 0) lo = 0;
    if (hi === 0) hi = 0;
    validated.push([lo, hi]);
  }

  if (validated.length <= 1) {
    return validated;
  }

  validated.sort((a, b) => {
    if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
    if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
    return 0;
  });

  const merged = [validated[0]];
  for (let i = 1; i < validated.length; i++) {
    const current = merged[merged.length - 1];
    const next = validated[i];
    if (next[0] <= current[1]) {
      if (next[1] > current[1]) {
        current[1] = next[1];
      }
    } else {
      merged.push(next);
    }
  }

  return merged;
}

/**
 * Computes the set difference `A \ B` over two sets of real intervals `[lo, hi]`
 * using a straightforward iterative two-pointer sweep.
 *
 * Both `setA` and `setB` are validated, sorted, and merged into canonical
 * disjoint intervals prior to differencing (inputs are never mutated).
 * Endpoints may be finite real numbers or `-Infinity` / `Infinity` (with
 * `lo <= hi`, `lo !== Infinity`, and `hi !== -Infinity`).
 *
 * Non-degenerate intervals are differenced up to boundary endpoints (e.g.,
 * `[0, 10] \ [3, 7] -> [[0, 3], [7, 10]]`), and zero-width point intervals
 * `[x, x]` in `setB` do not split strictly enclosing non-degenerate intervals
 * in `setA`. A standalone point interval `[x, x]` in `setA` is removed if and
 * only if it is covered by some interval in `setB`.
 *
 * The returned array is normalized: sorted in ascending order with strictly
 * disjoint, non-adjacent intervals (`result[k][1] < result[k + 1][0]`).
 *
 * @param {Array<[number, number]>} setA - Minuend set of `[lo, hi]` intervals.
 * @param {Array<[number, number]>} setB - Subtrahend set of `[lo, hi]` intervals.
 * @returns {Array<[number, number]>} Normalized disjoint intervals representing `A \ B`.
 * @throws {TypeError} If `setA` or `setB` is not an array, an element is not an
 *   array, or any bound is not a number.
 * @throws {RangeError} If an interval does not have length 2, has `NaN` bounds,
 *   has `lo > hi`, or has `lo === Infinity` or `hi === -Infinity`.
 */
export function setDifferenceIntervalIterative(setA, setB) {
  const normA = normalizeIntervals(setA, 'setA');
  const normB = normalizeIntervals(setB, 'setB');

  if (normA.length === 0) {
    return [];
  }
  if (normB.length === 0) {
    return normA;
  }

  const result = [];
  let j = 0;

  for (let i = 0; i < normA.length; i++) {
    let [curLo, curHi] = normA[i];

    if (curLo === curHi) {
      while (j < normB.length && normB[j][1] < curLo) {
        j++;
      }
      if (j === normB.length || normB[j][0] > curLo) {
        result.push([curLo, curHi]);
      }
      continue;
    }

    while (j < normB.length) {
      const [bLo, bHi] = normB[j];

      if (bHi <= curLo) {
        j++;
        continue;
      }
      if (bLo >= curHi) {
        break;
      }
      if (bLo === bHi) {
        j++;
        continue;
      }

      if (bLo > curLo) {
        result.push([curLo, bLo]);
      }

      if (bHi < curHi) {
        curLo = bHi;
        j++;
      } else {
        curLo = curHi;
        break;
      }
    }

    if (curLo < curHi) {
      result.push([curLo, curHi]);
    }
  }

  return result;
}
