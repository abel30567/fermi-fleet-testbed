/**
 * @fileoverview Element-wise discrete (floored) modulo over Float64Array inputs
 * using a precomputed small-integer lookup table and a bounded memoization cache.
 */

const TABLE_X_MIN = -64;
const TABLE_X_MAX = 64;
const TABLE_Y_MIN = 1;
const TABLE_Y_MAX = 64;
const TABLE_Y_SPAN = TABLE_Y_MAX - TABLE_Y_MIN + 1;
const TABLE_X_SPAN = TABLE_X_MAX - TABLE_X_MIN + 1;

/**
 * Precomputed lookup table for discrete modulo `x mod y` over
 * `x in [-64, 64]` and `y in [1, 64]`. Every result is in `[0, 63]`.
 * @type {Uint8Array}
 */
const SMALL_MOD_TABLE = new Uint8Array(TABLE_X_SPAN * TABLE_Y_SPAN);

for (let xi = 0; xi < TABLE_X_SPAN; xi += 1) {
  const x = xi + TABLE_X_MIN;
  const rowOffset = xi * TABLE_Y_SPAN;
  for (let yi = 0; yi < TABLE_Y_SPAN; yi += 1) {
    const y = yi + TABLE_Y_MIN;
    let r = x % y;
    if (r < 0) r += y;
    SMALL_MOD_TABLE[rowOffset + yi] = r === 0 ? 0 : r;
  }
}

const MAX_CACHE_SIZE = 4096;

/**
 * Bounded FIFO memoization cache for `(x, y)` pairs outside the precomputed table.
 * @type {Map<string, number>}
 */
const memoCache = new Map();

/**
 * Computes discrete (floored) modulo `x mod y` for two numbers.
 * Result is `0` when `x` is an exact multiple of `y`, otherwise has the same
 * sign as `y` with `0 < |r| < |y|` (for finite `x` and non-zero finite `y`).
 *
 * @param {number} x - Dividend.
 * @param {number} y - Divisor (modulus).
 * @returns {number} Discrete modulo result.
 */
function computeDiscreteModulo(x, y) {
  let r = x % y;
  if (Number.isNaN(r)) {
    return NaN;
  }
  if (r !== 0 && (r < 0) !== (y < 0)) {
    r += y;
    if (Number.isFinite(y) && r === y) {
      return 0;
    }
  }
  return r === 0 ? 0 : r;
}

/**
 * Computes the element-wise discrete (floored) modulo of two `Float64Array`
 * inputs using a precomputed lookup table for small integer pairs
 * (`x in [-64, 64]`, `y in [1, 64]`) and a bounded memoization cache for
 * general finite pairs.
 *
 * For each index `i`, the result satisfies `r = a[i] - b[i] * floor(a[i] / b[i])`
 * (normalized so `-0` becomes `+0`, and yielding `NaN` when `b[i] === 0`,
 * `a[i]` is non-finite, or either operand is `NaN`).
 *
 * @param {Float64Array} a - Element-wise dividends.
 * @param {Float64Array} b - Element-wise moduli (must have the same length as `a`).
 * @returns {Float64Array} A new `Float64Array` containing the element-wise discrete modulo results.
 * @throws {TypeError} If `a` or `b` is not a `Float64Array`.
 * @throws {RangeError} If `a` and `b` do not have the same length.
 */
export function moduloTypedMemo(a, b) {
  if (!(a instanceof Float64Array)) {
    throw new TypeError('First argument "a" must be a Float64Array');
  }
  if (!(b instanceof Float64Array)) {
    throw new TypeError('Second argument "b" must be a Float64Array');
  }
  const len = a.length;
  if (len !== b.length) {
    throw new RangeError(
      `Input Float64Arrays must have equal length (got ${len} and ${b.length})`,
    );
  }

  const out = new Float64Array(len);

  for (let i = 0; i < len; i += 1) {
    const x = a[i];
    const y = b[i];

    // Fast path: precomputed table for small integer pairs
    if (
      x >= TABLE_X_MIN &&
      x <= TABLE_X_MAX &&
      y >= TABLE_Y_MIN &&
      y <= TABLE_Y_MAX &&
      (x | 0) === x &&
      (y | 0) === y
    ) {
      out[i] = SMALL_MOD_TABLE[(x - TABLE_X_MIN) * TABLE_Y_SPAN + (y - TABLE_Y_MIN)];
      continue;
    }

    // Non-finite or zero-modulus values bypass the cache
    if (y === 0 || !Number.isFinite(x) || !Number.isFinite(y)) {
      out[i] = computeDiscreteModulo(x, y);
      continue;
    }

    // Memoized path for general finite pairs
    const nx = x === 0 ? 0 : x;
    const key = `${nx},${y}`;
    let value = memoCache.get(key);
    if (value === undefined) {
      value = computeDiscreteModulo(nx, y);
      if (memoCache.size >= MAX_CACHE_SIZE) {
        memoCache.delete(memoCache.keys().next().value);
      }
      memoCache.set(key, value);
    }
    out[i] = value;
  }

  return out;
}
