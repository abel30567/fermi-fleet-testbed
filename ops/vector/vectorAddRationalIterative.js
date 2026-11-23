/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 * An exact rational number represented as `{ num, den }` with `BigInt` fields.
 * Normalized outputs always satisfy `den > 0n`, `gcd(|num|, den) === 1n`,
 * and represent zero as `{ num: 0n, den: 1n }`.
 */

/**
 * Computes the non-negative greatest common divisor of two BigInts using
 * the iterative Euclidean algorithm.
 *
 * @param {bigint} x
 * @param {bigint} y
 * @returns {bigint}
 */
function gcdIterative(x, y) {
	let a = x < 0n ? -x : x
	let b = y < 0n ? -y : y
	while (b !== 0n) {
		const remainder = a % b
		a = b
		b = remainder
	}
	return a
}

/**
 * Validates that a value is a valid Rational object `{ num: bigint, den: bigint }`
 * with a non-zero denominator.
 *
 * @param {unknown} value
 * @param {string} vectorName
 * @param {number} index
 * @returns {Rational}
 */
function validateRational(value, vectorName, index) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(
			`${vectorName}[${index}] must be a rational object { num: bigint, den: bigint }`
		)
	}
	const { num, den } = /** @type {Record<string, unknown>} */ (value)
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(
			`${vectorName}[${index}] must have bigint 'num' and 'den' properties`
		)
	}
	if (den === 0n) {
		throw new RangeError(`${vectorName}[${index}].den must be non-zero`)
	}
	return { num, den }
}

/**
 * Reduces a rational `(num / den)` with `den !== 0n` to canonical lowest terms
 * with a strictly positive denominator.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function normalizeRational(num, den) {
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const g = gcdIterative(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Adds two validated exact rational numbers and returns the sum in lowest terms.
 *
 * @param {Rational} r1
 * @param {Rational} r2
 * @returns {Rational}
 */
function addRationals(r1, r2) {
	const denGcd = gcdIterative(r1.den, r2.den)
	const scale1 = r2.den / denGcd
	const scale2 = r1.den / denGcd
	const num = r1.num * scale1 + r2.num * scale2
	const den = scale2 * r2.den
	return normalizeRational(num, den)
}

/**
 * Computes the element-wise sum of two vectors of exact rational numbers
 * `{ num: bigint, den: bigint }`, returning a new vector with each entry
 * reduced to canonical lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`,
 * and zero as `{ num: 0n, den: 1n }`), using a straightforward iterative loop.
 *
 * @param {Rational[]} a - First rational vector.
 * @param {Rational[]} b - Second rational vector (must match length of `a`).
 * @returns {Rational[]} Element-wise rational sum in canonical lowest terms.
 * @throws {TypeError} If `a` or `b` is not an array, or any element is not a valid `{ num: bigint, den: bigint }`.
 * @throws {RangeError} If `a` and `b` have different lengths, or any element has `den === 0n`.
 */
export function vectorAddRationalIterative(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument "a" must be an array of rationals')
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument "b" must be an array of rationals')
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Vector length mismatch: a.length (${a.length}) !== b.length (${b.length})`
		)
	}

	const result = new Array(a.length)
	for (let i = 0; i < a.length; i += 1) {
		const ra = validateRational(a[i], 'a', i)
		const rb = validateRational(b[i], 'b', i)
		result[i] = addRationals(ra, rb)
	}
	return result
}
