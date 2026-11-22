/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 * Exact rational number in canonical lowest terms (`den > 0n`,
 * `gcd(|num|, den) === 1n`, and zero represented as `{ num: 0n, den: 1n }`).
 */

/**
 * Computes the greatest common divisor of two BigInt values using the
 * Euclidean algorithm. Always returns a non-negative BigInt.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

/**
 * Normalizes a numerator/denominator pair into canonical lowest terms with
 * `den > 0n` and zero represented as `{ num: 0n, den: 1n }`.
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
	const g = gcdBigInt(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Validates and normalizes a single rational input object.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Rational}
 * @throws {TypeError} If value is not an object with BigInt `num` and `den`.
 * @throws {RangeError} If `den === 0n`.
 */
function validateRational(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be a rational object { num: BigInt, den: BigInt }`)
	}
	const { num, den } = value
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label} must have BigInt num and den properties`)
	}
	if (den === 0n) {
		throw new RangeError(`${label} denominator must not be zero (0n)`)
	}
	return normalizeRational(num, den)
}

/**
 * Validates a 3D vector of exact rationals and returns a normalized copy.
 *
 * @param {unknown} vec
 * @param {string} name
 * @returns {[Rational, Rational, Rational]}
 * @throws {TypeError} If `vec` is not an Array or any component is not a valid rational object.
 * @throws {RangeError} If `vec.length !== 3` or any component has `den === 0n`.
 */
function validateVector3(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${name} must be an Array of length 3`)
	}
	if (vec.length !== 3) {
		throw new RangeError(`${name} must have length 3, got ${vec.length}`)
	}
	return [
		validateRational(vec[0], `${name}[0]`),
		validateRational(vec[1], `${name}[1]`),
		validateRational(vec[2], `${name}[2]`),
	]
}

/**
 * Multiplies two normalized rationals with cross-cancellation to keep
 * intermediate BigInt magnitudes minimal.
 *
 * @param {Rational} x
 * @param {Rational} y
 * @returns {Rational}
 */
function mulRational(x, y) {
	if (x.num === 0n || y.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const g1 = gcdBigInt(x.num, y.den)
	const g2 = gcdBigInt(y.num, x.den)
	return {
		num: (x.num / g1) * (y.num / g2),
		den: (x.den / g2) * (y.den / g1),
	}
}

/**
 * Subtracts two normalized rationals (`x - y`) using their least common
 * denominator and returns the exact result in canonical lowest terms.
 *
 * @param {Rational} x
 * @param {Rational} y
 * @returns {Rational}
 */
function subRational(x, y) {
	if (y.num === 0n) {
		return { num: x.num, den: x.den }
	}
	if (x.num === 0n) {
		return { num: -y.num, den: y.den }
	}
	const g = gcdBigInt(x.den, y.den)
	const dx = x.den / g
	const dy = y.den / g
	return normalizeRational(x.num * dy - y.num * dx, dx * y.den)
}

/**
 * Computes the exact 3D cross product `a × b` of two length-3 vectors of exact
 * rational numbers.
 *
 * Algorithm:
 * Uses the exact closed-form Levi-Civita / 2×2 determinant minor identity over Q:
 *   `(a × b)_0 = a_1 * b_2 - a_2 * b_1`
 *   `(a × b)_1 = a_2 * b_0 - a_0 * b_2`
 *   `(a × b)_2 = a_0 * b_1 - a_1 * b_0`
 * Each input rational is first canonicalized, intermediate products use
 * cross-cancellation, and differences use LCM denominators followed by GCD
 * reduction so every output component is guaranteed to be in lowest terms with
 * `den > 0n` and `{ num: 0n, den: 1n }` for zero.
 *
 * @param {[Rational, Rational, Rational]} a - First 3D rational vector.
 * @param {[Rational, Rational, Rational]} b - Second 3D rational vector.
 * @returns {[Rational, Rational, Rational]} Exact 3D cross product `a × b` in lowest terms.
 * @throws {TypeError} If `a` or `b` is not an Array, or any component is not a rational object with BigInt `num` and `den`.
 * @throws {RangeError} If `a` or `b` does not have length 3, or any component has `den === 0n`.
 */
export function crossProductRationalSeries(a, b) {
	const [a0, a1, a2] = validateVector3(a, 'a')
	const [b0, b1, b2] = validateVector3(b, 'b')

	return [
		subRational(mulRational(a1, b2), mulRational(a2, b1)),
		subRational(mulRational(a2, b0), mulRational(a0, b2)),
		subRational(mulRational(a0, b1), mulRational(a1, b0)),
	]
}
