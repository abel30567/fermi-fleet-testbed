/**
 * Exact rational multiplication using recursive Euclidean GCD cross-cancellation
 * and a recursive divide-and-conquer product tree.
 *
 * Rationals are represented as `{ num: BigInt, den: BigInt }` and all results
 * are normalized to lowest terms with `den > 0n` (and `{ num: 0n, den: 1n }`
 * for zero).
 */

/**
 * Returns the absolute value of a BigInt.
 *
 * @param {bigint} value
 * @returns {bigint}
 */
function absBigInt(value) {
  return value < 0n ? -value : value;
}

/**
 * Computes the greatest common divisor of two non-negative BigInts
 * using the recursive Euclidean algorithm.
 *
 * @param {bigint} a - Non-negative BigInt.
 * @param {bigint} b - Non-negative BigInt.
 * @returns {bigint} Non-negative greatest common divisor.
 */
function gcdRecursive(a, b) {
  return b === 0n ? a : gcdRecursive(b, a % b);
}

/**
 * Validates and normalizes a rational operand `{ num: bigint, den: bigint }`
 * into lowest terms with a strictly positive denominator (`den > 0n`) and
 * `{ num: 0n, den: 1n }` for zero.
 *
 * @param {{ num: bigint, den: bigint }} rational
 * @param {number} index - Operand index for error reporting.
 * @returns {{ num: bigint, den: bigint }}
 */
function normalizeRational(rational, index) {
  if (typeof rational !== 'object' || rational === null || Array.isArray(rational)) {
    throw new TypeError(`Operand at index ${index} must be a rational object { num: BigInt, den: BigInt }`);
  }
  const { num, den } = rational;
  if (typeof num !== 'bigint' || typeof den !== 'bigint') {
    throw new TypeError(`Operand at index ${index} must have BigInt 'num' and 'den' properties`);
  }
  if (den === 0n) {
    throw new RangeError(`Operand at index ${index} has zero denominator`);
  }
  if (num === 0n) {
    return { num: 0n, den: 1n };
  }

  const signedNum = den < 0n ? -num : num;
  const positiveDen = den < 0n ? -den : den;
  const divisor = gcdRecursive(absBigInt(signedNum), positiveDen);

  return {
    num: signedNum / divisor,
    den: positiveDen / divisor,
  };
}

/**
 * Multiplies two already-normalized rationals using recursive GCD
 * cross-cancellation to avoid unnecessary intermediate growth.
 *
 * @param {{ num: bigint, den: bigint }} left
 * @param {{ num: bigint, den: bigint }} right
 * @returns {{ num: bigint, den: bigint }}
 */
function multiplyPair(left, right) {
  if (left.num === 0n || right.num === 0n) {
    return { num: 0n, den: 1n };
  }

  const g1 = gcdRecursive(absBigInt(left.num), right.den);
  const g2 = gcdRecursive(absBigInt(right.num), left.den);

  return {
    num: (left.num / g1) * (right.num / g2),
    den: (left.den / g2) * (right.den / g1),
  };
}

/**
 * Computes the product of normalized rationals in `items[low..high]`
 * using recursive divide-and-conquer.
 *
 * @param {Array<{ num: bigint, den: bigint }>} items
 * @param {number} low
 * @param {number} high
 * @returns {{ num: bigint, den: bigint }}
 */
function productDivideAndConquer(items, low, high) {
  if (low === high) {
    return items[low];
  }
  const mid = Math.floor((low + high) / 2);
  const left = productDivideAndConquer(items, low, mid);
  if (left.num === 0n) {
    return { num: 0n, den: 1n };
  }
  const right = productDivideAndConquer(items, mid + 1, high);
  return multiplyPair(left, right);
}

/**
 * Multiplies exact rationals `{ num: BigInt, den: BigInt }` in lowest terms
 * using recursive Euclidean GCD cross-cancellation and a recursive
 * divide-and-conquer product tree.
 *
 * Supports either variadic rational arguments:
 *   `multiplyRationalRecursive(a, b, ...)`
 * or a single array of rationals:
 *   `multiplyRationalRecursive([a, b, ...])`
 *
 * An empty array returns the multiplicative identity `{ num: 1n, den: 1n }`.
 * Calling with no arguments throws a `TypeError`.
 *
 * @param {...({ num: bigint, den: bigint } | Array<{ num: bigint, den: bigint }>)} args
 * @returns {{ num: bigint, den: bigint }} Product normalized to lowest terms with `den > 0n`.
 * @throws {TypeError} If called with no arguments or any operand is not a valid `{ num: bigint, den: bigint }`.
 * @throws {RangeError} If any operand has `den === 0n`.
 */
export function multiplyRationalRecursive(...args) {
  if (args.length === 0) {
    throw new TypeError('multiplyRationalRecursive requires at least one rational argument or an array of rationals');
  }

  const operands = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;

  if (operands.length === 0) {
    return { num: 1n, den: 1n };
  }

  // Validate and normalize every operand up front so invalid inputs are never
  // masked by zero short-circuiting.
  const normalized = new Array(operands.length);
  for (let i = 0; i < operands.length; i += 1) {
    normalized[i] = normalizeRational(operands[i], i);
  }

  return productDivideAndConquer(normalized, 0, normalized.length - 1);
}
