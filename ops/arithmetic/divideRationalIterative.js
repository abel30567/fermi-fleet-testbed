/**
 * Computes the greatest common divisor of two BigInt values using the
 * iterative Euclidean algorithm.
 *
 * @param {bigint} a - First integer.
 * @param {bigint} b - Second integer.
 * @returns {bigint} Non-negative greatest common divisor of `a` and `b`.
 */
function gcdIterative(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;

	while (y !== 0n) {
		const remainder = x % y;
		x = y;
		y = remainder;
	}

	return x;
}

/**
 * Validates that a value is a well-formed exact rational `{ num: bigint, den: bigint }`
 * with a non-zero denominator.
 *
 * @param {unknown} value - Candidate rational object.
 * @param {string} name - Parameter name for error reporting.
 * @throws {TypeError} If `value` is not an object with `bigint` `num` and `den` fields.
 * @throws {RangeError} If `value.den` is `0n`.
 */
function assertRational(value, name) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${name} must be a rational object { num: bigint, den: bigint }`);
	}
	if (typeof value.num !== 'bigint') {
		throw new TypeError(`${name}.num must be a bigint`);
	}
	if (typeof value.den !== 'bigint') {
		throw new TypeError(`${name}.den must be a bigint`);
	}
	if (value.den === 0n) {
		throw new RangeError(`${name}.den must not be 0n`);
	}
}

/**
 * Divides two exact rational numbers `a / b` and returns the quotient in lowest
 * terms with a strictly positive denominator, using an iterative Euclidean GCD
 * reduction.
 *
 * Input rationals do not need to be pre-reduced or sign-normalized, provided
 * their denominators are non-zero and the divisor `b` is non-zero.
 *
 * @typedef {{ num: bigint, den: bigint }} Rational
 * @param {Rational} a - Dividend rational `{ num: bigint, den: bigint }`.
 * @param {Rational} b - Divisor rational `{ num: bigint, den: bigint }` (must be non-zero).
 * @returns {Rational} Exact quotient `a / b` in lowest terms with `den > 0n` (and `0n / 1n` when zero).
 * @throws {TypeError} If `a` or `b` is not a valid `{ num: bigint, den: bigint }` object.
 * @throws {RangeError} If either denominator is `0n`, or if `b.num` is `0n` (division by zero).
 */
export function divideRationalIterative(a, b) {
	assertRational(a, 'a');
	assertRational(b, 'b');

	if (b.num === 0n) {
		throw new RangeError('Division by zero: b.num must not be 0n');
	}

	if (a.num === 0n) {
		return { num: 0n, den: 1n };
	}

	let num = a.num * b.den;
	let den = a.den * b.num;

	if (den < 0n) {
		num = -num;
		den = -den;
	}

	const divisor = gcdIterative(num, den);

	return {
		num: num / divisor,
		den: den / divisor,
	};
}
