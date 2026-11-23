/**
 * Exact rational vector projection using a straightforward iterative algorithm.
 *
 * Computes the orthogonal projection of vector `u` onto non-zero vector `v`:
 *   proj_v(u) = ((u · v) / (v · v)) * v
 *
 * All vector entries are exact rational numbers represented as `{ num: BigInt, den: BigInt }`.
 * Output entries are guaranteed to be in lowest terms with strictly positive denominators,
 * and zero is represented canonically as `{ num: 0n, den: 1n }`.
 *
 * @typedef {{ num: bigint, den: bigint }} Rational
 */

/**
 * Computes the greatest common divisor of two BigInts iteratively using
 * the Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative GCD of `a` and `b`.
 */
function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const rem = x % y
		x = y
		y = rem
	}
	return x
}

/**
 * Normalizes a rational number `num / den` to lowest terms with `den > 0n`,
 * representing zero canonically as `{ num: 0n, den: 1n }`.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function normalizeRational(num, den) {
	if (den === 0n) {
		throw new RangeError('Rational denominator must not be zero')
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const g = gcdBigInt(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Validates and normalizes a single rational entry of a vector.
 *
 * @param {unknown} value
 * @param {string} vectorName
 * @param {number} index
 * @returns {Rational}
 */
function validateRational(value, vectorName, index) {
	if (value === null || typeof value !== 'object') {
		throw new TypeError(
			`${vectorName}[${index}] must be a rational object { num: bigint, den: bigint }`
		)
	}
	const { num, den } = /** @type {{ num?: unknown, den?: unknown }} */ (value)
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(
			`${vectorName}[${index}] must have bigint num and den properties`
		)
	}
	if (den === 0n) {
		throw new RangeError(
			`${vectorName}[${index}] denominator must not be zero`
		)
	}
	return normalizeRational(num, den)
}

/**
 * Adds two normalized rational numbers and returns the normalized sum.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function addRational(a, b) {
	return normalizeRational(a.num * b.den + b.num * a.den, a.den * b.den)
}

/**
 * Multiplies two normalized rational numbers and returns the normalized product.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function mulRational(a, b) {
	return normalizeRational(a.num * b.num, a.den * b.den)
}

/**
 * Divides rational `a` by non-zero rational `b` and returns the normalized quotient.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function divRational(a, b) {
	if (b.num === 0n) {
		throw new RangeError('Division by zero rational')
	}
	return normalizeRational(a.num * b.den, a.den * b.num)
}

/**
 * Projects exact rational vector `u` onto exact rational vector `v` iteratively.
 *
 * Computes `((u · v) / (v · v)) * v` using exact `BigInt` rational arithmetic.
 * Inputs are not mutated; input rationals need not be pre-reduced or have
 * positive denominators as long as denominators are non-zero `BigInt`s.
 *
 * @param {readonly Rational[]} u - Vector to be projected.
 * @param {readonly Rational[]} v - Non-zero target vector to project onto.
 * @returns {Rational[]} Projected vector in lowest terms (`den > 0n`, zero as `{ num: 0n, den: 1n }`).
 * @throws {TypeError} If `u` or `v` is not an array, contains holes, or contains invalid rational objects.
 * @throws {RangeError} If `u` and `v` have different lengths, are empty, contain a zero denominator, or `v` is the zero vector.
 */
export function projectionRationalIterative(u, v) {
	if (!Array.isArray(u)) {
		throw new TypeError('u must be an array of rational objects')
	}
	if (!Array.isArray(v)) {
		throw new TypeError('v must be an array of rational objects')
	}
	if (u.length !== v.length) {
		throw new RangeError(
			`Vector dimensions must match (got u.length=${u.length}, v.length=${v.length})`
		)
	}
	const n = u.length
	if (n === 0) {
		throw new RangeError('Vectors must be non-empty')
	}

	/** @type {Rational[]} */
	const normV = new Array(n)
	/** @type {Rational} */
	let uv = { num: 0n, den: 1n }
	/** @type {Rational} */
	let vv = { num: 0n, den: 1n }

	for (let i = 0; i < n; i++) {
		if (!(i in u)) {
			throw new TypeError(`u[${i}] must not be an empty slot`)
		}
		if (!(i in v)) {
			throw new TypeError(`v[${i}] must not be an empty slot`)
		}
		const ui = validateRational(u[i], 'u', i)
		const vi = validateRational(v[i], 'v', i)
		normV[i] = vi
		uv = addRational(uv, mulRational(ui, vi))
		vv = addRational(vv, mulRational(vi, vi))
	}

	if (vv.num === 0n) {
		throw new RangeError('Cannot project onto the zero vector')
	}

	const scale = divRational(uv, vv)

	/** @type {Rational[]} */
	const result = new Array(n)
	for (let i = 0; i < n; i++) {
		result[i] = mulRational(scale, normV[i])
	}

	return result
}
