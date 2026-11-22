/**
 * Fixed-point scaling factor (10^18) used for non-integer BigInt results.
 * A returned value `r` represents the real number `r / 10^18`.
 * @type {bigint}
 */
export const SCALE = 10n ** 18n;

const SCALE_SQUARED = SCALE * SCALE;

/**
 * Computes the exact bit length of a positive BigInt.
 *
 * @param {bigint} n - Positive BigInt (> 0n).
 * @returns {number} Number of bits required to represent `n`.
 */
function bitLength(n) {
	const hex = n.toString(16);
	const topNibble = parseInt(hex[0], 16);
	return (hex.length - 1) * 4 + (32 - Math.clz32(topNibble));
}

/**
 * Recursively computes the exact integer floor square root `floor(sqrt(n))`
 * for a non-negative BigInt using divide-and-conquer bit-length halving
 * combined with a single exact Newton-Raphson refinement step.
 *
 * For `n >= 4n` with bit length `b`, let `s = floor((b + 1) / 4)`.
 * Recursively computing `h = floor(sqrt(n >> (2 * s)))` yields an initial
 * approximation `x0 = h << s` satisfying `0 <= sqrt(n) - x0 < 2^s` and
 * `x0 >= 2^floor((b - 1) / 2)`. One Newton step
 * `x1 = (x0 + n / x0) >> 1n` is guaranteed to lie in `{r, r + 1}` where
 * `r = floor(sqrt(n))`, so a single overshoot check produces the exact root.
 *
 * Recursion depth is O(log(bitLength(n))).
 *
 * @param {bigint} n - Non-negative BigInt.
 * @returns {bigint} Exact `floor(sqrt(n))`.
 */
function floorSqrtRecursive(n) {
	if (n < 2n) {
		return n;
	}
	if (n < 4n) {
		return 1n;
	}

	const bits = bitLength(n);
	const shift = BigInt((bits + 1) >> 2);
	const highRoot = floorSqrtRecursive(n >> (shift << 1n));
	const x0 = highRoot << shift;
	const x1 = (x0 + n / x0) >> 1n;

	return x1 * x1 > n ? x1 - 1n : x1;
}

/**
 * Recursively computes the exact sum of squares of `vector[start..end]`
 * using divide-and-conquer binary splitting, validating each element is a BigInt.
 *
 * Recursion depth is O(log(vector.length)).
 *
 * @param {readonly bigint[]} vector - Non-empty array of BigInt components.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Inclusive end index.
 * @returns {bigint} Exact sum of squares over `[start, end]`.
 * @throws {TypeError} If any element in the range is not a BigInt.
 */
function sumOfSquaresRecursive(vector, start, end) {
	if (start === end) {
		const component = vector[start];
		if (typeof component !== 'bigint') {
			throw new TypeError(
				`Vector element at index ${start} must be a BigInt, received ${typeof component}`,
			);
		}
		return component * component;
	}

	const mid = start + ((end - start) >>> 1);
	return (
		sumOfSquaresRecursive(vector, start, mid) +
		sumOfSquaresRecursive(vector, mid + 1, end)
	);
}

/**
 * Computes the Euclidean magnitude (L2 norm) of a vector of exact BigInt
 * integers, returned as a fixed-point BigInt scaled by `SCALE = 10n ** 18n`
 * and rounded to the nearest integer (0.5 ULP exact).
 *
 * Algorithm:
 * 1. Validates that `vector` is a non-empty Array of BigInt values.
 * 2. Computes `sumSq = sum(v_i^2)` via divide-and-conquer binary-splitting
 *    recursion (`sumOfSquaresRecursive`, O(log n) stack depth).
 * 3. Scales `sumSq` by `4 * SCALE^2` (providing an internal half-ULP binary
 *    guard bit prior to the square root) and evaluates `q = floor(sqrt(4 * sumSq * SCALE^2))`
 *    via divide-and-conquer recursive integer square root (`floorSqrtRecursive`,
 *    O(log(bits)) stack depth).
 * 4. Rounds via `(q + 1n) >> 1n`, which is provably exact to the nearest
 *    scaled integer because `sqrt(sumSq * SCALE^2)` can never equal a half-integer.
 *
 * @param {readonly bigint[]} vector - Non-empty array of BigInt vector components.
 * @returns {bigint} Fixed-point BigInt representing `round(||vector||_2 * 10^18)`.
 * @throws {TypeError} If `vector` is not an Array or contains any non-BigInt element.
 * @throws {RangeError} If `vector` is empty.
 */
export function magnitudeBigIntRecursive(vector) {
	if (!Array.isArray(vector)) {
		throw new TypeError(
			`Expected vector to be an Array of BigInt values, received ${vector === null ? 'null' : typeof vector}`,
		);
	}
	if (vector.length === 0) {
		throw new RangeError('Vector must not be empty');
	}

	const sumSq = sumOfSquaresRecursive(vector, 0, vector.length - 1);
	if (sumSq === 0n) {
		return 0n;
	}

	// Shift left by 2 bits (multiply by 4) to retain an exact half-ULP guard bit
	// before taking the integer square root: floor(sqrt(4 * sumSq * SCALE^2)).
	const scaledWithGuard = (sumSq * SCALE_SQUARED) << 2n;
	const guardedRoot = floorSqrtRecursive(scaledWithGuard);
	return (guardedRoot + 1n) >> 1n;
}
