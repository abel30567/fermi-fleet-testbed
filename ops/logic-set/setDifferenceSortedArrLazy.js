/**
 * Default strict total-order comparator for homogeneous `number`, `bigint`,
 * or `string` values.
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {number} Negative if `a < b`, `0` if equal, positive if `a > b`.
 * @throws {RangeError} If either operand is `NaN`.
 * @throws {TypeError} If operands are not of the same supported primitive type.
 */
function defaultCompare(a, b) {
  if (Number.isNaN(a) || Number.isNaN(b)) {
    throw new RangeError('Default comparator cannot order NaN values');
  }
  const typeA = typeof a;
  const typeB = typeof b;
  if (
    typeA === typeB &&
    (typeA === 'number' || typeA === 'bigint' || typeA === 'string')
  ) {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }
  throw new TypeError(
    `Default comparator only supports homogeneous number, bigint, or string values (got ${typeA} and ${typeB}); provide a custom compareFn`
  );
}

/**
 * Validates that a value is a non-null iterable object (arrays, generators,
 * TypedArrays, Sets, or custom iterables; rejects primitives including strings).
 *
 * @param {unknown} value
 * @param {string} paramName
 * @throws {TypeError}
 */
function assertIterableObject(value, paramName) {
  if (
    value === null ||
    typeof value !== 'object' ||
    typeof value[Symbol.iterator] !== 'function'
  ) {
    throw new TypeError(
      `${paramName} must be an iterable object (e.g. Array, TypedArray, Set, or generator)`
    );
  }
}

/**
 * Invokes `compareFn` and validates that it returns a non-NaN number.
 *
 * @template T
 * @param {(a: T, b: T) => number} compareFn
 * @param {T} a
 * @param {T} b
 * @returns {number}
 * @throws {TypeError}
 */
function invokeCompare(compareFn, a, b) {
  const result = compareFn(a, b);
  if (typeof result !== 'number' || Number.isNaN(result)) {
    throw new TypeError(
      'compareFn must return a numeric value (and must not return NaN)'
    );
  }
  return result;
}

/**
 * Computes the lazy set difference (`sortedA \ sortedB`) of two strictly
 * ascending (sorted and de-duplicated) sequences using a merge-style
 * streaming generator.
 *
 * Input iterables are consumed lazily on demand: no elements are pulled until
 * the returned generator is iterated, elements of `sortedB` are never pulled
 * if `sortedA` is empty, and open source iterators are closed via `.return()`
 * if iteration stops early.
 *
 * Strict ascending order (sorted and de-duplicated) is validated incrementally
 * as elements are consumed from each sequence.
 *
 * @template T
 * @param {Iterable<T>} sortedA - Strictly ascending, de-duplicated minuend sequence.
 * @param {Iterable<T>} sortedB - Strictly ascending, de-duplicated subtrahend sequence.
 * @param {(a: T, b: T) => number} [compareFn] - Optional comparator returning `< 0`
 *   when `a < b`, `0` when equal, and `> 0` when `a > b`. Defaults to natural
 *   ordering for homogeneous `number`, `bigint`, or `string` values.
 * @returns {Generator<T, void, undefined>} Lazy generator yielding elements present
 *   in `sortedA` and absent from `sortedB`, in strictly ascending order.
 * @throws {TypeError} Eagerly if `sortedA` or `sortedB` is not an iterable object,
 *   or if `compareFn` is defined and not a function; or during iteration if
 *   elements are incomparable under the default comparator or `compareFn` returns
 *   a non-number / `NaN`.
 * @throws {RangeError} During iteration if either sequence contains `NaN` (with
 *   the default comparator), duplicate elements, or out-of-order elements.
 */
export function setDifferenceSortedArrLazy(
  sortedA,
  sortedB,
  compareFn = defaultCompare
) {
  assertIterableObject(sortedA, 'sortedA');
  assertIterableObject(sortedB, 'sortedB');
  if (typeof compareFn !== 'function') {
    throw new TypeError('compareFn must be a function when provided');
  }

  const useDefaultCompare = compareFn === defaultCompare;

  return (function* mergeSetDifference() {
    /** @type {Iterator<T> | null} */
    let iterA = null;
    /** @type {Iterator<T> | null} */
    let iterB = null;
    let doneA = false;
    let doneB = false;
    let hasPrevA = false;
    let hasPrevB = false;
    /** @type {T} */
    let prevA;
    /** @type {T} */
    let prevB;

    function pullA() {
      if (iterA === null) {
        iterA = sortedA[Symbol.iterator]();
      }
      doneA = true;
      const step = iterA.next();
      doneA = Boolean(step.done);
      if (!doneA) {
        const value = step.value;
        if (useDefaultCompare) {
          if (Number.isNaN(value)) {
            throw new RangeError(
              'sortedA contains NaN, which cannot be ordered'
            );
          }
          const t = typeof value;
          if (t !== 'number' && t !== 'bigint' && t !== 'string') {
            throw new TypeError(
              `Default comparator only supports number, bigint, or string values (got ${t}); provide a custom compareFn`
            );
          }
        }
        if (hasPrevA) {
          const order = invokeCompare(compareFn, prevA, value);
          if (order > 0) {
            throw new RangeError(
              'sortedA must be sorted in strictly ascending order'
            );
          }
          if (order === 0) {
            throw new RangeError(
              'sortedA must be de-duplicated (strictly ascending)'
            );
          }
        }
        prevA = value;
        hasPrevA = true;
      }
      return step;
    }

    function pullB() {
      if (iterB === null) {
        iterB = sortedB[Symbol.iterator]();
      }
      doneB = true;
      const step = iterB.next();
      doneB = Boolean(step.done);
      if (!doneB) {
        const value = step.value;
        if (useDefaultCompare) {
          if (Number.isNaN(value)) {
            throw new RangeError(
              'sortedB contains NaN, which cannot be ordered'
            );
          }
          const t = typeof value;
          if (t !== 'number' && t !== 'bigint' && t !== 'string') {
            throw new TypeError(
              `Default comparator only supports number, bigint, or string values (got ${t}); provide a custom compareFn`
            );
          }
        }
        if (hasPrevB) {
          const order = invokeCompare(compareFn, prevB, value);
          if (order > 0) {
            throw new RangeError(
              'sortedB must be sorted in strictly ascending order'
            );
          }
          if (order === 0) {
            throw new RangeError(
              'sortedB must be de-duplicated (strictly ascending)'
            );
          }
        }
        prevB = value;
        hasPrevB = true;
      }
      return step;
    }

    try {
      let stepA = pullA();
      /** @type {IteratorResult<T> | null} */
      let stepB = null;

      while (!stepA.done) {
        if (stepB === null) {
          stepB = pullB();
        }
        if (stepB.done) {
          yield stepA.value;
          stepA = pullA();
          continue;
        }

        const cmp = invokeCompare(compareFn, stepA.value, stepB.value);
        if (cmp < 0) {
          yield stepA.value;
          stepA = pullA();
        } else if (cmp > 0) {
          stepB = pullB();
        } else {
          // Matching element excluded; defer advancing B until A yields another item.
          stepB = null;
          stepA = pullA();
        }
      }
    } finally {
      try {
        if (iterA !== null && !doneA && typeof iterA.return === 'function') {
          iterA.return();
        }
      } finally {
        if (iterB !== null && !doneB && typeof iterB.return === 'function') {
          iterB.return();
        }
      }
    }
  })();
}
