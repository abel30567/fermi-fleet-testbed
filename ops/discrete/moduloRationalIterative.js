/**
 * Computes the greatest common divisor of two BigInts iteratively using the
 * Euclidean algorithm.
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
 * Validates and normalizes a rational number `{ num, den }` to lowest terms
 * with a strictly positive denominator.
 *
 * @param {{ num: bigint, den: bigint }} value - Candidate rational object.
 * @param {string} name - Parameter name for error reporting.
 * @returns {{ num: bigint, den: bigint }} Reduced rational with `den > 0n`.
 * @throws {TypeError} If `value` is not a non-null object with BigInt `num` and `den`.
 * @throws {RangeError} If `value.den === 0n`.
 */
function validateAndNormalizeRational(value, name) {
	if (typeof value !== 'object' || value === null) {
		throw new TypeError(`${name} must be a non-null object with { num: bigint, den: bigint }`);
	}
	const { num, den } = value;
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${name}.num and ${name}.den must both be BigInt values`);
	}
	if (den === 0n) {
		throw new RangeError(`${name}.den must be non-zero`);
	}
	if (num === 0n) {
		return { num: 0n, den: 1n };
	}

	const sign = den < 0n ? -1n : 1n;
	const signedNum = num * sign;
	const posDen = den * sign;
	const g = gcdIterative(signedNum, posDen);
	return { num: signedNum / g, den: posDen / g };
}

/**
 * Computes the exact floored modulo of two rational numbers:
 *
 *   `a mod b = a - floor(a / b) * b`
 *
 * Convention:
 * - Uses floored division (Knuth / Python modulo semantics), so the remainder `r`
 *   has the same sign as the divisor `b` (or is zero):
 *   - When `b > 0`: `0 <= r < b`
 *   - When `b < 0`: `b < r <= 0`
 * - In all cases, `(a - r) / b = floor(a / b)` is an exact integer.
 * - The returned rational `{ num, den }` is always reduced to lowest terms using
 *   an iterative Euclidean GCD with a strictly positive denominator (`den > 0n`),
 *   and zero is canonically represented as `{ num: 0n, den: 1n }`.
 * - Inputs need not be pre-reduced and may have negative denominators; they are
 *   validated and normalized before computation.
 *
 * @param {{ num: bigint, den: bigint }} a - Dividend rational `{ num, den }`.
 * @param {{ num: bigint, den: bigint }} b - Non-zero divisor rational `{ num, den }`.
 * @returns {{ num: bigint, den: bigint }} Exact remainder `a mod b` in lowest terms with `den > 0n`.
 * @throws {TypeError} If `a` or `b` is not an object with BigInt `num` and `den` fields.
 * @throws {RangeError} If either denominator is `0n` or if divisor `b` is zero (`b.num === 0n`).
 */
export function moduloRationalIterative(a, b) {
	const ra = validateAndNormalizeRational(a, 'a');
	const rb = validateAndNormalizeRational(b, 'b');

	if (rb.num === 0n) {
		throw new RangeError('Divisor b must be non-zero');
	}

	if (ra.num === 0n) {
		return { num: 0n, den: 1n };
	}

	// Exact quotient a / b = (ra.num * rb.den) / (ra.den * rb.num)
	const dividend = ra.num * rb.den;
	const divisor = ra.den * rb.num;

	// Floored integer quotient q = floor(dividend / divisor)
	let q = dividend / divisor;
	const rem = dividend % divisor;
	if (rem !== 0n && (rem < 0n) !== (divisor < 0n)) {
		q -= 1n;
	}

	// r = a - q * b = (dividend - q * divisor) / (ra.den * rb.den)
	const rNum = dividend - q * divisor;
	if (rNum === 0n) {
		return { num: 0n, den: 1n };
	}

	const rDen = ra.den * rb.den;
	const g = gcdIterative(rNum, rDen);
	return { num: rNum / g, den: rDen / g };
}
