/**
 * Exact rational number represented in lowest terms with a positive denominator.
 *
 * @typedef {Object} Rational
 * @property {bigint} num - Numerator (0n for zero).
 * @property {bigint} den - Strictly positive denominator (1n for zero), with gcd(|num|, den) === 1n.
 */

/**
 * Computes the greatest common divisor of two non-negative BigInts
 * using the Euclidean algorithm.
 *
 * @param {bigint} a - Non-negative integer.
 * @param {bigint} b - Non-negative integer.
 * @returns {bigint} Non-negative gcd(a, b).
 */
function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		const r = x % y;
		x = y;
		y = r;
	}
	return x;
}

/**
 * Normalizes an exact rational (num / den) into canonical lowest terms:
 * - `den > 0n`
 * - `gcd(|num|, den) === 1n`
 * - zero represented as `{ num: 0n, den: 1n }`
 *
 * @param {bigint} num - Numerator.
 * @param {bigint} den - Non-zero denominator.
 * @returns {Rational} Canonical lowest-terms rational.
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
	const g = gcdBigInt(n < 0n ? -n : n, d);
	return { num: n / g, den: d / g };
}

/**
 * Validates that a value is a well-formed exact rational `{ num: bigint, den: bigint }`
 * with `den !== 0n`.
 *
 * @param {unknown} value - Value to validate.
 * @param {string} label - Descriptive label for error messages.
 * @throws {TypeError} If `value` is not an object with bigint `num` and `den` properties.
 * @throws {RangeError} If `value.den === 0n`.
 */
function validateRational(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be a rational object { num: bigint, den: bigint }`);
	}
	if (typeof value.num !== 'bigint') {
		throw new TypeError(`${label}.num must be a bigint`);
	}
	if (typeof value.den !== 'bigint') {
		throw new TypeError(`${label}.den must be a bigint`);
	}
	if (value.den === 0n) {
		throw new RangeError(`${label}.den must not be 0n`);
	}
}

/**
 * Adds two exact rational numbers and returns the sum in canonical lowest terms.
 *
 * @param {Rational} r1 - First rational operand.
 * @param {Rational} r2 - Second rational operand.
 * @returns {Rational} Exact sum `r1 + r2` in lowest terms.
 */
function addRational(r1, r2) {
	const a = normalizeRational(r1.num, r1.den);
	const b = normalizeRational(r2.num, r2.den);

	if (a.num === 0n) {
		return { num: b.num, den: b.den };
	}
	if (b.num === 0n) {
		return { num: a.num, den: a.den };
	}

	const g = gcdBigInt(a.den, b.den);
	const aDenReduced = a.den / g;
	const bDenReduced = b.den / g;

	const num = a.num * bDenReduced + b.num * aDenReduced;
	const den = aDenReduced * b.den;
	return normalizeRational(num, den);
}

/**
 * Recursively adds vector slices `a[start..end)` and `b[start..end)` using
 * divide-and-conquer binary splitting.
 *
 * @param {Rational[]} a - First rational vector.
 * @param {Rational[]} b - Second rational vector.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @returns {Rational[]} Element-wise rational sum for the slice `[start, end)`.
 */
function addSliceRecursive(a, b, start, end) {
	const len = end - start;
	if (len <= 0) {
		return [];
	}
	if (len === 1) {
		const aVal = a[start];
		const bVal = b[start];
		validateRational(aVal, `a[${start}]`);
		validateRational(bVal, `b[${start}]`);
		return [addRational(aVal, bVal)];
	}

	const mid = start + Math.floor(len / 2);
	const left = addSliceRecursive(a, b, start, mid);
	const right = addSliceRecursive(a, b, mid, end);
	return left.concat(right);
}

/**
 * Computes the element-wise sum of two equal-length vectors of exact rational
 * numbers `{ num: bigint, den: bigint }` using a recursive divide-and-conquer
 * split.
 *
 * Algorithm:
 * - Validates that both inputs are arrays of identical length.
 * - Recursively splits the index range `[start, end)` at the midpoint `mid`
 *   into left `[start, mid)` and right `[mid, end)` halves until reaching
 *   single-element leaves (or the empty base case).
 * - At each leaf, validates both rational components, reduces them to lowest
 *   terms, computes their exact BigInt rational sum using `gcd(den1, den2)` to
 *   avoid unnecessary intermediate growth, and normalizes the result.
 * - Combines the left and right result halves into a newly allocated array.
 *
 * All returned rationals satisfy `den > 0n`, `gcd(|num|, den) === 1n`, and
 * zero is represented uniquely as `{ num: 0n, den: 1n }`.
 *
 * @param {Rational[]} a - First vector of exact rational numbers.
 * @param {Rational[]} b - Second vector of exact rational numbers.
 * @returns {Rational[]} New array containing the element-wise exact rational sums in lowest terms.
 * @throws {TypeError} If `a` or `b` is not an array, or any element is not a valid `{ num: bigint, den: bigint }` object.
 * @throws {RangeError} If `a.length !== b.length`, or any element has `den === 0n`.
 */
export function vectorAddRationalRecursive(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument "a" must be an array');
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument "b" must be an array');
	}
	if (a.length !== b.length) {
		throw new RangeError(`Vectors must have equal length (received ${a.length} and ${b.length})`);
	}

	return addSliceRecursive(a, b, 0, a.length);
}
