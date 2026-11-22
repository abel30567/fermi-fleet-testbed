/**
 * @typedef {object} Rational
 * @property {bigint} num - Exact integer numerator.
 * @property {bigint} den - Exact non-zero integer denominator (strictly positive in canonical form).
 */

/**
 * Computes the absolute value of a BigInt.
 *
 * @param {bigint} value - The BigInt value.
 * @returns {bigint} Non-negative magnitude of `value`.
 */
function absBigInt(value) {
	return value < 0n ? -value : value;
}

/**
 * Computes the greatest common divisor of two non-negative BigInts
 * using the iterative Euclidean algorithm.
 *
 * @param {bigint} a - Non-negative BigInt.
 * @param {bigint} b - Non-negative BigInt.
 * @returns {bigint} Greatest common divisor `gcd(a, b) >= 0n`.
 */
function gcdBigInt(a, b) {
	let x = a;
	let y = b;
	while (y !== 0n) {
		const r = x % y;
		x = y;
		y = r;
	}
	return x;
}

/**
 * Validates and normalizes an input rational `{num: bigint, den: bigint}` into
 * canonical lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`, zero as `{num: 0n, den: 1n}`).
 *
 * @param {Rational} value - Input rational to validate and normalize.
 * @param {string} name - Parameter name for descriptive error messages.
 * @returns {Rational} Normalized rational in canonical lowest terms.
 * @throws {TypeError} If `value` is not a plain rational object with BigInt `num` and `den`.
 * @throws {RangeError} If `value.den === 0n`.
 */
function normalizeRational(value, name) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${name} must be an object of shape { num: BigInt, den: BigInt }`);
	}
	const { num, den } = value;
	if (typeof num !== 'bigint') {
		throw new TypeError(`${name}.num must be a BigInt`);
	}
	if (typeof den !== 'bigint') {
		throw new TypeError(`${name}.den must be a BigInt`);
	}
	if (den === 0n) {
		throw new RangeError(`${name}.den must be non-zero`);
	}

	if (num === 0n) {
		return { num: 0n, den: 1n };
	}

	const signedNum = den < 0n ? -num : num;
	const positiveDen = den < 0n ? -den : den;
	const g = gcdBigInt(absBigInt(signedNum), positiveDen);

	return {
		num: signedNum / g,
		den: positiveDen / g,
	};
}

/**
 * Multiplies two exact rational numbers represented as `{num: BigInt, den: BigInt}`,
 * returning their exact product in canonical lowest terms (`den > 0n`,
 * `gcd(|num|, den) === 1n`, and zero represented as `{num: 0n, den: 1n}`).
 *
 * Algorithm:
 * 1. Validate both inputs and normalize each to canonical lowest terms `(n1, d1)`
 *    and `(n2, d2)` with `d1 > 0n`, `d2 > 0n`, `gcd(|n1|, d1) === 1n`, `gcd(|n2|, d2) === 1n`.
 * 2. If either numerator is `0n`, return `{num: 0n, den: 1n}`.
 * 3. Apply the closed-form cross-cancellation identity:
 *      `g1 = gcd(|n1|, d2)`
 *      `g2 = gcd(|n2|, d1)`
 *      `num = (n1 / g1) * (n2 / g2)`
 *      `den = (d1 / g2) * (d2 / g1)`
 *    Because each input is already reduced and cross-factors are cancelled prior to
 *    multiplication, intermediate products remain minimal and the result is guaranteed
 *    to be in canonical lowest terms with `den > 0n`.
 *
 * @param {Rational} a - First rational factor `{num: bigint, den: bigint}` with `den !== 0n`.
 * @param {Rational} b - Second rational factor `{num: bigint, den: bigint}` with `den !== 0n`.
 * @returns {Rational} Exact product `a * b` in canonical lowest terms.
 * @throws {TypeError} If `a` or `b` is not an object with BigInt `num` and `den` properties.
 * @throws {RangeError} If `a.den === 0n` or `b.den === 0n`.
 */
export function multiplyRationalSeries(a, b) {
	const left = normalizeRational(a, 'a');
	const right = normalizeRational(b, 'b');

	if (left.num === 0n || right.num === 0n) {
		return { num: 0n, den: 1n };
	}

	const g1 = gcdBigInt(absBigInt(left.num), right.den);
	const g2 = gcdBigInt(absBigInt(right.num), left.den);

	return {
		num: (left.num / g1) * (right.num / g2),
		den: (left.den / g2) * (right.den / g1),
	};
}
