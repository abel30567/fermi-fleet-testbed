/**
 * Compute the greatest common divisor of two non-negative BigInts using the Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcd(a, b) {
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
 * Validate and normalize a rational object `{ num: bigint, den: bigint }` into lowest terms
 * with a strictly positive denominator.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {{ num: bigint, den: bigint }}
 */
function normalizeRational(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be a { num: bigint, den: bigint } object`);
	}
	const { num, den } = value;
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label}.num and ${label}.den must be BigInts`);
	}
	if (den === 0n) {
		throw new RangeError(`${label}.den must not be 0n`);
	}
	if (num === 0n) {
		return { num: 0n, den: 1n };
	}
	let n = num;
	let d = den;
	if (d < 0n) {
		n = -n;
		d = -d;
	}
	const g = gcd(n, d);
	return { num: n / g, den: d / g };
}

/**
 * Add two normalized rationals `p1/q1` and `p2/q2` using the reduced common-denominator
 * identity (Knuth TAOCP Vol. 2, 4.5.1):
 *
 *   Let g = gcd(q1, q2), q1' = q1 / g, q2' = q2 / g.
 *   N = p1 * q2' + p2 * q1'
 *   Since gcd(p1, q1) = gcd(p2, q2) = gcd(q1', q2') = 1, any common divisor of N and
 *   lcm(q1, q2) = q1' * q2' * g must divide g. Thus h = gcd(|N|, g) suffices for
 *   complete reduction to lowest terms: (N / h) / (q1' * q2' * (g / h)).
 *
 * @param {{ num: bigint, den: bigint }} r1
 * @param {{ num: bigint, den: bigint }} r2
 * @returns {{ num: bigint, den: bigint }}
 */
function addNormalizedRationals(r1, r2) {
	const g = gcd(r1.den, r2.den);
	const q1 = r1.den / g;
	const q2 = r2.den / g;
	const num = r1.num * q2 + r2.num * q1;
	if (num === 0n) {
		return { num: 0n, den: 1n };
	}
	const h = gcd(num, g);
	return {
		num: num / h,
		den: q1 * q2 * (g / h),
	};
}

/**
 * Compute exact element-wise addition of two rational vectors `a` and `b`,
 * where each component is `{ num: bigint, den: bigint }`.
 *
 * Each component of the returned vector is normalized in lowest terms with
 * `den > 0n` and `gcd(|num|, den) === 1n` (with zero represented as `{ num: 0n, den: 1n }`).
 * Uses the closed-form reduced common-denominator identity for exact addition.
 *
 * @param {Array<{ num: bigint, den: bigint }>} a - First rational vector.
 * @param {Array<{ num: bigint, den: bigint }>} b - Second rational vector (same length as `a`).
 * @returns {Array<{ num: bigint, den: bigint }>} Element-wise sum vector in lowest terms.
 * @throws {TypeError} If inputs are not arrays or contain invalid rational entries.
 * @throws {RangeError} If vector lengths differ or any entry has a zero denominator.
 */
export function vectorAddRationalSeries(a, b) {
	if (!Array.isArray(a) || !Array.isArray(b)) {
		throw new TypeError('Both inputs must be arrays of rational objects');
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Vector length mismatch: expected equal lengths, got ${a.length} and ${b.length}`
		);
	}

	const result = new Array(a.length);
	for (let i = 0; i < a.length; i++) {
		const ra = normalizeRational(a[i], `a[${i}]`);
		const rb = normalizeRational(b[i], `b[${i}]`);
		result[i] = addNormalizedRationals(ra, rb);
	}
	return result;
}
