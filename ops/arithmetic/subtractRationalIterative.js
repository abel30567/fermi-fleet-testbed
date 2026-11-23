/**
 * Exact rational subtraction using a straightforward iterative implementation.
 *
 * Rationals are represented as `{ num: bigint, den: bigint }` and results are
 * always returned in canonical lowest terms with a strictly positive denominator
 * (`den > 0n`), `gcd(|num|, den) === 1n`, and zero normalized to `{ num: 0n, den: 1n }`.
 *
 * @module ops/arithmetic/subtractRationalIterative
 */

/**
 * @typedef {object} Rational
 * @property {bigint} num - Numerator of the rational number.
 * @property {bigint} den - Non-zero denominator of the rational number.
 */

/**
 * Computes the greatest common divisor of two BigInt values using the
 * iterative Euclidean algorithm.
 *
 * @param {bigint} x - First integer.
 * @param {bigint} y - Second integer.
 * @returns {bigint} Non-negative greatest common divisor of `x` and `y`.
 */
function gcdIterative(x, y) {
	let a = x < 0n ? -x : x;
	let b = y < 0n ? -y : y;
	while (b !== 0n) {
		const remainder = a % b;
		a = b;
		b = remainder;
	}
	return a;
}

/**
 * Validates that an input value is a well-formed `{ num: bigint, den: bigint }`
 * rational object with a non-zero denominator.
 *
 * @param {unknown} value - Value to validate.
 * @param {string} name - Parameter name for error messages.
 * @throws {TypeError} If `value` is not a non-null plain-like object or its fields are not BigInts.
 * @throws {RangeError} If `value.den` is `0n`.
 */
function validateRational(value, name) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${name} must be an object with shape { num: bigint, den: bigint }`);
	}
	if (typeof value.num !== 'bigint' || typeof value.den !== 'bigint') {
		throw new TypeError(`${name}.num and ${name}.den must both be BigInt values`);
	}
	if (value.den === 0n) {
		throw new RangeError(`${name}.den must not be 0n`);
	}
}

/**
 * Subtracts exact rational `b` from exact rational `a` (`a - b`), returning
 * the result in canonical lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`).
 *
 * Accepts unreduced inputs and negative denominators without mutating either input.
 *
 * @param {Rational} a - Minuend as `{ num: bigint, den: bigint }`.
 * @param {Rational} b - Subtrahend as `{ num: bigint, den: bigint }`.
 * @returns {Rational} Exact difference `a - b` in lowest terms.
 * @throws {TypeError} If `a` or `b` is not an object with BigInt `num` and `den`.
 * @throws {RangeError} If `a.den` or `b.den` is `0n`.
 */
export function subtractRationalIterative(a, b) {
	validateRational(a, 'a');
	validateRational(b, 'b');

	const aNum = a.den < 0n ? -a.num : a.num;
	const aDen = a.den < 0n ? -a.den : a.den;
	const bNum = b.den < 0n ? -b.num : b.num;
	const bDen = b.den < 0n ? -b.den : b.den;

	const denGcd = gcdIterative(aDen, bDen);
	const aScale = bDen / denGcd;
	const bScale = aDen / denGcd;

	const rawNum = aNum * aScale - bNum * bScale;
	const rawDen = aDen * aScale;

	if (rawNum === 0n) {
		return { num: 0n, den: 1n };
	}

	const resGcd = gcdIterative(rawNum, rawDen);
	return {
		num: rawNum / resGcd,
		den: rawDen / resGcd,
	};
}
