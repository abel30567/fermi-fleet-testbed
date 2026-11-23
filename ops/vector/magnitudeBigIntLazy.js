/**
 * Fixed-point scale factor (10^18) used for non-integer vector magnitudes.
 * @type {bigint}
 */
const SCALE = 10n ** 18n;

/**
 * Squared fixed-point scale factor (10^36), so sqrt(sumSq * SCALE_SQ) = sqrt(sumSq) * 10^18.
 * @type {bigint}
 */
const SCALE_SQ = SCALE * SCALE;

/**
 * Computes the exact floor integer square root of a non-negative BigInt using
 * Newton's method with a bit-length upper-bound initial estimate.
 *
 * @param {bigint} n - Non-negative BigInt.
 * @returns {bigint} Floor of sqrt(n).
 */
function isqrtFloor(n) {
	if (n < 2n) {
		return n;
	}

	const hex = n.toString(16);
	const topNibble = parseInt(hex[0], 16);
	const bitLength = BigInt(hex.length - 1) * 4n + BigInt(32 - Math.clz32(topNibble));

	// 2^ceil(bitLength / 2) is strictly greater than sqrt(n), ensuring monotonic convergence.
	let x = 1n << ((bitLength + 1n) >> 1n);
	while (true) {
		const next = (x + n / x) >> 1n;
		if (next >= x) {
			return x;
		}
		x = next;
	}
}

/**
 * Computes the exact rounded integer square root of a non-negative BigInt.
 * Because sqrt(n) for integer n is never an exact half-integer (k + 0.5),
 * nearest-integer rounding is unambiguous: round up iff n - r^2 > r.
 *
 * @param {bigint} n - Non-negative BigInt.
 * @returns {bigint} Nearest integer to sqrt(n).
 */
function isqrtRounded(n) {
	if (n === 0n) {
		return 0n;
	}
	const r = isqrtFloor(n);
	return n - r * r > r ? r + 1n : r;
}

/**
 * Computes the Euclidean magnitude (L2 norm) of a vector of exact BigInt integers,
 * returned as a fixed-point BigInt scaled by 10^18 (rounded to the nearest unit).
 *
 * Consumes the input iterable lazily in O(1) auxiliary memory without materializing
 * the sequence, accumulating the exact sum of squares before taking the scaled
 * integer square root `round(sqrt(sum(v_i^2) * 10^36))`.
 *
 * @param {Iterable<bigint>} vector - An iterable (e.g. Array, Generator, Set, BigInt64Array) yielding BigInt components.
 * @returns {bigint} Exact fixed-point magnitude scaled by 10^18 (0n for an empty or zero vector).
 * @throws {TypeError} If `vector` is not an iterable object (or is a string) or yields any non-BigInt element.
 */
export function magnitudeBigIntLazy(vector) {
	if (
		vector === null ||
		vector === undefined ||
		typeof vector === 'string' ||
		typeof vector[Symbol.iterator] !== 'function'
	) {
		throw new TypeError('vector must be an iterable of BigInt values');
	}

	let sumSq = 0n;
	let index = 0;

	for (const component of vector) {
		if (typeof component !== 'bigint') {
			throw new TypeError(
				`vector element at index ${index} must be a BigInt, received ${component === null ? 'null' : typeof component}`
			);
		}
		sumSq += component * component;
		index += 1;
	}

	if (sumSq === 0n) {
		return 0n;
	}

	return isqrtRounded(sumSq * SCALE_SQ);
}
