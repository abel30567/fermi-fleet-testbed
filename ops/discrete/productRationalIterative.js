/**
 * Exact discrete product over an iterable of exact rational numbers.
 *
 * Each rational is represented as `{ num: bigint, den: bigint }` with `den !== 0n`.
 * Results are always returned in canonical lowest terms with `den > 0n`
 * (and `{ num: 0n, den: 1n }` when the product is zero).
 *
 * @module ops/discrete/productRationalIterative
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
 * using the iterative Euclidean algorithm.
 *
 * @param {bigint} a - Non-negative integer.
 * @param {bigint} b - Non-negative integer.
 * @returns {bigint} Greatest common divisor of `a` and `b`.
 */
function gcdBigInt(a, b) {
	while (b !== 0n) {
		const remainder = a % b;
		a = b;
		b = remainder;
	}
	return a;
}

/**
 * Validates a single rational element and normalizes its sign so `den > 0n`.
 *
 * @param {unknown} item - Candidate rational element.
 * @param {number} index - Zero-based position in the iterable, for error reporting.
 * @returns {{ num: bigint, den: bigint }} Normalized `{ num, den }` with `den > 0n`.
 * @throws {TypeError} If `item` is not an object with `bigint` `num` and `den` properties.
 * @throws {RangeError} If `item.den === 0n`.
 */
function validateRational(item, index) {
	if (item === null || typeof item !== 'object') {
		throw new TypeError(
			`Expected rational object { num: bigint, den: bigint } at index ${index}`
		);
	}
	const { num, den } = item;
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(
			`Expected BigInt properties 'num' and 'den' at index ${index}`
		);
	}
	if (den === 0n) {
		throw new RangeError(`Rational denominator must not be 0n at index ${index}`);
	}
	if (den < 0n) {
		return { num: -num, den: -den };
	}
	return { num, den };
}

/**
 * Computes the exact product of an iterable of rational numbers `{ num: bigint, den: bigint }`
 * in canonical lowest terms using a straightforward iterative cross-cancelling algorithm.
 *
 * - Empty iterables return the multiplicative identity `{ num: 1n, den: 1n }`.
 * - Every element in the iterable is validated even after a zero factor is encountered.
 * - Intermediate fractions are reduced by cross-cancelling GCDs at every step to keep
 *   accumulator magnitudes minimal and preserve lowest terms throughout.
 *
 * @param {Iterable<{ num: bigint, den: bigint }>} values - Iterable of exact rationals.
 * @returns {{ num: bigint, den: bigint }} Exact product in lowest terms with `den > 0n`.
 * @throws {TypeError} If `values` is not a non-string iterable, or any element is not a valid `{ num: bigint, den: bigint }`.
 * @throws {RangeError} If any element has a zero denominator (`den === 0n`).
 */
export function productRationalIterative(values) {
	if (
		values === null ||
		values === undefined ||
		typeof values === 'string' ||
		typeof values[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(
			'Expected an iterable of rational objects { num: bigint, den: bigint }'
		);
	}

	let accNum = 1n;
	let accDen = 1n;
	let isZero = false;
	let index = 0;

	for (const item of values) {
		const { num, den } = validateRational(item, index);
		index += 1;

		if (isZero) {
			continue;
		}

		if (num === 0n) {
			accNum = 0n;
			accDen = 1n;
			isZero = true;
			continue;
		}

		// Reduce the incoming rational to lowest terms first.
		const elemGcd = gcdBigInt(absBigInt(num), den);
		let factorNum = num / elemGcd;
		let factorDen = den / elemGcd;

		// Cross-cancel against the accumulator to preserve lowest terms at every step.
		const cross1 = gcdBigInt(absBigInt(accNum), factorDen);
		if (cross1 > 1n) {
			accNum /= cross1;
			factorDen /= cross1;
		}

		const cross2 = gcdBigInt(absBigInt(factorNum), accDen);
		if (cross2 > 1n) {
			factorNum /= cross2;
			accDen /= cross2;
		}

		accNum *= factorNum;
		accDen *= factorDen;
	}

	return { num: accNum, den: accDen };
}
