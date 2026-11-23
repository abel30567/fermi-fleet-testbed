/**
 * Fixed-point scale factor (10^18) for exact BigInt square roots.
 * A returned BigInt `r` represents the real value `r / 10^18`,
 * satisfying `r^2 <= n * 10^36 < (r + 1)^2`.
 */
const SCALE_SQUARED = 10n ** 36n;

/**
 * Computes the exact integer square root `floor(sqrt(m))` of a non-negative BigInt `m`
 * using Newton's method with a bit-length upper-bound initial estimate.
 *
 * @param {bigint} m - Non-negative BigInt.
 * @returns {bigint} Exact `floor(sqrt(m))`.
 */
function isqrt(m) {
	if (m === 0n) return 0n;
	if (m < 4n) return 1n;

	const hex = m.toString(16);
	const bitLength =
		BigInt(hex.length - 1) * 4n +
		BigInt(32 - Math.clz32(Number.parseInt(hex[0], 16)));

	// Initial estimate x = 2^ceil(bitLength / 2) strictly exceeds sqrt(m),
	// guaranteeing monotonic convergence to floor(sqrt(m)).
	let x = 1n << ((bitLength + 1n) >> 1n);
	let y = (x + m / x) >> 1n;

	while (y < x) {
		x = y;
		y = (x + m / x) >> 1n;
	}

	return x;
}

/**
 * Validates a single BigInt operand and computes its fixed-point square root
 * scaled by 10^18.
 *
 * @param {unknown} value - Candidate non-negative BigInt.
 * @returns {bigint} `floor(sqrt(value * 10^36))`.
 * @throws {TypeError} If `value` is not a BigInt.
 * @throws {RangeError} If `value` is negative.
 */
function sqrtSingleBigInt(value) {
	if (typeof value !== 'bigint') {
		throw new TypeError(
			`sqrtBigIntLazy expects a BigInt (or an iterable of BigInts), received ${
				value === null ? 'null' : typeof value
			}`,
		);
	}
	if (value < 0n) {
		throw new RangeError(
			`sqrtBigIntLazy cannot compute square root of negative BigInt: ${value}`,
		);
	}
	if (value === 0n) return 0n;
	return isqrt(value * SCALE_SQUARED);
}

/**
 * Lazily consumes an iterable of non-negative BigInts and yields each element's
 * fixed-point square root scaled by 10^18.
 *
 * @param {Iterable<bigint>} iterable - Source iterable of non-negative BigInts.
 * @yields {bigint} `floor(sqrt(n * 10^36))` for each `n` in `iterable`.
 */
function* sqrtBigIntStream(iterable) {
	for (const item of iterable) {
		yield sqrtSingleBigInt(item);
	}
}

/**
 * Computes the square root over exact non-negative BigInt integers, returning
 * fixed-point BigInt values scaled by `10^18` (i.e., `floor(sqrt(n * 10^36))`,
 * satisfying `r^2 <= n * 10^36 < (r + 1)^2`).
 *
 * Accepts either:
 * - A single non-negative `bigint`, returning its scaled fixed-point `bigint` square root directly.
 * - Any iterable object of non-negative `bigint`s (e.g., Array, Set, Generator, BigUint64Array),
 *   returning a lazy `Generator<bigint>` that consumes input elements one at a time on demand.
 *
 * @overload
 * @param {bigint} input - A single non-negative BigInt.
 * @returns {bigint} Fixed-point square root scaled by 10^18.
 *
 * @overload
 * @param {Iterable<bigint>} input - An iterable of non-negative BigInts.
 * @returns {Generator<bigint, void, undefined>} Lazy generator yielding fixed-point square roots scaled by 10^18.
 *
 * @param {bigint | Iterable<bigint>} input - A non-negative BigInt or an iterable of non-negative BigInts.
 * @returns {bigint | Generator<bigint, void, undefined>} Scaled BigInt result or lazy generator of scaled BigInt results.
 * @throws {TypeError} If `input` is neither a BigInt nor a non-string iterable object, or if any yielded element is not a BigInt.
 * @throws {RangeError} If `input` or any yielded element is a negative BigInt.
 */
export function sqrtBigIntLazy(input) {
	if (typeof input === 'bigint') {
		return sqrtSingleBigInt(input);
	}

	if (
		input !== null &&
		typeof input === 'object' &&
		!(input instanceof String) &&
		typeof input[Symbol.iterator] === 'function'
	) {
		return sqrtBigIntStream(input);
	}

	throw new TypeError(
		`sqrtBigIntLazy expects a BigInt or an iterable of BigInts, received ${
			input === null ? 'null' : input instanceof String ? 'String' : typeof input
		}`,
	);
}
