/**
 * Fixed-point scale factor (10^18) used for non-integer cube root results.
 * Every returned BigInt represents `value * 10^18` rounded to the nearest integer.
 *
 * @type {bigint}
 */
export const SCALE = 10n ** 18n;

const SCALE_CUBED = SCALE * SCALE * SCALE; // 10n ** 54n

/**
 * Computes the exact integer floor of the cube root of a positive BigInt `n`,
 * i.e. `floor(n^(1/3))`, using Newton-Raphson iteration.
 *
 * Starting from `x0 = 2^ceil(bitLength(n) / 3) > n^(1/3)`, the iteration
 * `x_{k+1} = floor((2 * x_k + floor(n / x_k^2)) / 3)` decreases strictly while
 * `x_k > floor(n^(1/3))` and never drops below `floor(n^(1/3))`, terminating
 * at the exact integer floor cube root in O(log log n) steps.
 *
 * @param {bigint} n - Strictly positive BigInt (`n >= 1n`).
 * @returns {bigint} Exact `floor(n^(1/3))`.
 */
function floorCbrtPositive(n) {
  const hex = n.toString(16);
  const topBits = 32 - Math.clz32(parseInt(hex[0], 16));
  const bitLen = (hex.length - 1) * 4 + topBits;

  let x = 1n << BigInt(Math.ceil(bitLen / 3));

  while (true) {
    const next = (2n * x + n / (x * x)) / 3n;
    if (next >= x) {
      return x;
    }
    x = next;
  }
}

/**
 * Computes the cube root of a single BigInt `x` as a fixed-point BigInt
 * scaled by `10^18`, rounded to the nearest integer (within 0.5 ULP).
 *
 * @param {bigint} x - Input integer.
 * @returns {bigint} Fixed-point `round(cbrt(x) * 10^18)`.
 */
function cbrtSingle(x) {
  if (x === 0n) {
    return 0n;
  }

  const negative = x < 0n;
  const absX = negative ? -x : x;
  const scaled = absX * SCALE_CUBED;

  let root = floorCbrtPositive(scaled);

  // Round to nearest integer:
  // scaled^(1/3) > root + 1/2  <=>  8 * scaled > (2 * root + 1)^3.
  // Exact half-integer ties cannot occur because (2 * root + 1)^3 is odd while 8 * scaled is even.
  const twoRootPlusOne = 2n * root + 1n;
  if (8n * scaled > twoRootPlusOne * twoRootPlusOne * twoRootPlusOne) {
    root += 1n;
  }

  return negative ? -root : root;
}

/**
 * Lazily streams fixed-point cube roots for an iterable of BigInts.
 * Elements are pulled one at a time on demand; closing the returned generator
 * closes the underlying iterator.
 *
 * @param {Iterable<bigint>} iterable - Iterable yielding BigInt values.
 * @returns {Generator<bigint, void, undefined>} Lazy generator of fixed-point BigInt cube roots.
 */
function* cbrtStream(iterable) {
  for (const item of iterable) {
    if (typeof item !== 'bigint') {
      throw new TypeError(
        `cbrtBigIntLazy expected BigInt elements in iterable, received ${item === null ? 'null' : typeof item}`
      );
    }
    yield cbrtSingle(item);
  }
}

/**
 * Computes the cube root (`cbrt`) over exact BigInt integers, returning
 * fixed-point BigInts scaled by `10^18` (rounded to the nearest ULP).
 *
 * - When given a single `bigint`, returns a single fixed-point `bigint`.
 * - When given an iterable object (e.g., Generator, Array, Set, BigInt64Array,
 *   or custom `[Symbol.iterator]` sequence), returns a lazy Generator that
 *   consumes input elements on demand without buffering the full sequence.
 *
 * @param {bigint | Iterable<bigint>} input - A single BigInt or a lazy iterable of BigInts.
 * @returns {bigint | Generator<bigint, void, undefined>} Fixed-point BigInt cube root, or lazy Generator thereof.
 * @throws {TypeError} If `input` is neither a BigInt nor a non-string iterable object,
 *   or when the iterable yields a non-BigInt element.
 */
export function cbrtBigIntLazy(input) {
  if (typeof input === 'bigint') {
    return cbrtSingle(input);
  }

  if (
    input !== null &&
    typeof input === 'object' &&
    typeof input[Symbol.iterator] === 'function'
  ) {
    return cbrtStream(input);
  }

  throw new TypeError(
    `cbrtBigIntLazy expected a BigInt or an iterable of BigInts, received ${input === null ? 'null' : typeof input}`
  );
}
