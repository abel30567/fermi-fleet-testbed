/**
 * Computes the absolute value of a BigInt.
 *
 * @param {bigint} value - The BigInt value.
 * @returns {bigint} The non-negative magnitude of `value`.
 */
function absBigInt(value) {
	return value < 0n ? -value : value;
}

/**
 * Computes the greatest common divisor of two BigInts using the iterative
 * Euclidean algorithm.
 *
 * @param {bigint} a - First integer.
 * @param {bigint} b - Second integer.
 * @returns {bigint} Non-negative greatest common divisor of `a` and `b`.
 */
function gcdBigInt(a, b) {
	let x = absBigInt(a);
	let y = absBigInt(b);
	while (y !== 0n) {
		const remainder = x % y;
		x = y;
		y = remainder;
	}
	return x;
}

/**
 * Validates that an input represents an exact rational `{ num: bigint, den: bigint }`
 * with a non-zero denominator.
 *
 * @param {unknown} value - Candidate rational object.
 * @param {string} name - Parameter name for error messages.
 * @throws {TypeError} If `value` is not a non-null non-array object or if `num`/`den` are not BigInts.
 * @throws {RangeError} If `value.den` is `0n`.
 */
function validateRational(value, name) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${name} must be an object with BigInt properties { num, den }`);
	}
	if (typeof value.num !== 'bigint') {
		throw new TypeError(`${name}.num must be a BigInt`);
	}
	if (typeof value.den !== 'bigint') {
		throw new TypeError(`${name}.den must be a BigInt`);
	}
	if (value.den === 0n) {
		throw new RangeError(`${name}.den must not be 0n`);
	}
}

/**
 * Reduces a rational `(num, den)` with `den !== 0n` to canonical lowest terms
 * with positive denominator (`den > 0n`, `gcd(|num|, den) === 1n`, zero as `0n / 1n`).
 *
 * @param {bigint} num - Numerator.
 * @param {bigint} den - Non-zero denominator.
 * @returns {{ num: bigint, den: bigint }} Canonical reduced rational.
 */
function normalizeRational(num, den) {
	if (num === 0n) {
		return { num: 0n, den: 1n };
	}
	let n = num;
	let d = den;
	if (d < 0n) {
		n = -n;
		d = -d;
	}
	const divisor = gcdBigInt(n, d);
	return { num: n / divisor, den: d / divisor };
}

/**
 * Subtracts two exact rational numbers `a - b`, returning the difference in
 * canonical lowest terms.
 *
 * Algorithm:
 * 1. Validate both operands as `{ num: BigInt, den: BigInt }` with `den !== 0n`
 *    and normalize each operand to canonical lowest terms with positive denominator.
 * 2. Apply the closed-form GCD/LCM-reduced subtraction identity:
 *    `g = gcd(d1, d2)`, `num = n1 * (d2 / g) - n2 * (d1 / g)`, `den = (d1 / g) * d2`.
 * 3. Canonicalize zero to `{ num: 0n, den: 1n }`, otherwise divide both `num` and `den`
 *    by `gcd(|num|, den)`.
 *
 * @param {{ num: bigint, den: bigint }} a - Minuend rational number.
 * @param {{ num: bigint, den: bigint }} b - Subtrahend rational number.
 * @returns {{ num: bigint, den: bigint }} Exact difference `a - b` in canonical lowest terms
 *   (`den > 0n`, `gcd(|num|, den) === 1n`, zero represented as `{ num: 0n, den: 1n }`).
 * @throws {TypeError} If `a` or `b` is not an object with BigInt `num` and `den` properties.
 * @throws {RangeError} If `a.den === 0n` or `b.den === 0n`.
 */
export function subtractRationalSeries(a, b) {
	validateRational(a, 'a');
	validateRational(b, 'b');

	const { num: n1, den: d1 } = normalizeRational(a.num, a.den);
	const { num: n2, den: d2 } = normalizeRational(b.num, b.den);

	const g = gcdBigInt(d1, d2);
	const d1Reduced = d1 / g;
	const d2Reduced = d2 / g;
	const num = n1 * d2Reduced - n2 * d1Reduced;

	if (num === 0n) {
		return { num: 0n, den: 1n };
	}

	const den = d1Reduced * d2;
	const r = gcdBigInt(num, den);
	return { num: num / r, den: den / r };
}
