const SCALE = 10n ** 18n;
const SCALE_CUBED = SCALE ** 3n;

/**
 * Computes the cube root of an exact BigInt integer as a fixed-point BigInt
 * scaled by 10^18, using a straightforward iterative Newton-Raphson method.
 *
 * Results are truncated toward zero: for any integer `x`, let `r = |result|`.
 * Then `r^3 <= |x| * 10^54 < (r + 1)^3`, and `result` has the same sign as `x`.
 * For exact perfect cubes `x = k^3`, the result is exact: `k * 10^18`.
 *
 * @param {bigint} x - Exact BigInt integer whose cube root to compute.
 * @returns {bigint} Fixed-point cube root of `x`, scaled by `10n ** 18n`.
 * @throws {TypeError} If `x` is not a `bigint`.
 */
export function cbrtBigIntIterative(x) {
  if (typeof x !== 'bigint') {
    throw new TypeError(`Expected a bigint argument, received ${typeof x}`);
  }

  if (x === 0n) {
    return 0n;
  }

  const negative = x < 0n;
  const target = (negative ? -x : x) * SCALE_CUBED;

  // Initial upper bound: 2^ceil(bitLength(target) / 3) > target^(1/3).
  const bitLength = BigInt(target.toString(2).length);
  let guess = 1n << ((bitLength + 2n) / 3n);

  // Iterative integer Newton-Raphson for f(g) = g^3 - target.
  // Starting strictly above floor(target^(1/3)), each step decreases strictly
  // until reaching the exact integer cube root, where next >= guess.
  while (true) {
    const next = (2n * guess + target / (guess * guess)) / 3n;
    if (next >= guess) {
      return negative ? -guess : guess;
    }
    guess = next;
  }
}
