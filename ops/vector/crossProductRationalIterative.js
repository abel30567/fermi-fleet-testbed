/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 * An exact rational number represented as a numerator and denominator of type BigInt.
 */

/**
 * Computes the greatest common divisor of two BigInts using the iterative Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative greatest common divisor of `a` and `b`.
 */
function gcdIterative(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b

	while (y !== 0n) {
		const remainder = x % y
		x = y
		y = remainder
	}

	return x
}

/**
 * Normalizes a rational number `(num / den)` to lowest terms with a strictly positive denominator.
 * Zero is canonicalized to `{ num: 0n, den: 1n }`.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function normalizeRational(num, den) {
	if (den === 0n) {
		throw new RangeError('Rational denominator must not be 0n')
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

	const g = gcdIterative(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Validates that a value is a 3D vector of exact rationals `{ num: bigint, den: bigint }`
 * with non-zero denominators, returning a normalized copy of the vector.
 *
 * @param {unknown} vec
 * @param {string} name
 * @returns {[Rational, Rational, Rational]}
 */
function validateAndNormalizeVector3(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${name} must be a 3-element array of rational objects`)
	}
	if (vec.length !== 3) {
		throw new RangeError(`${name} must have length 3, received length ${vec.length}`)
	}

	const normalized = new Array(3)
	for (let i = 0; i < 3; i++) {
		const entry = vec[i]
		if (entry === null || typeof entry !== 'object') {
			throw new TypeError(`${name}[${i}] must be a rational object { num: bigint, den: bigint }`)
		}
		if (typeof entry.num !== 'bigint' || typeof entry.den !== 'bigint') {
			throw new TypeError(
				`${name}[${i}] must have BigInt properties num and den`
			)
		}
		if (entry.den === 0n) {
			throw new RangeError(`${name}[${i}].den must not be 0n`)
		}
		normalized[i] = normalizeRational(entry.num, entry.den)
	}

	return /** @type {[Rational, Rational, Rational]} */ (normalized)
}

/**
 * Computes the exact 3D cross product `a × b` of two 3-element vectors of exact rationals
 * `{ num: bigint, den: bigint }` using an iterative loop and iterative Euclidean GCD reduction.
 *
 * Each output component is returned in lowest terms with `den > 0n` (and `{ num: 0n, den: 1n }`
 * when the component is zero).
 *
 * @param {readonly [Rational, Rational, Rational]} a First 3D rational vector.
 * @param {readonly [Rational, Rational, Rational]} b Second 3D rational vector.
 * @returns {[Rational, Rational, Rational]} The exact 3D cross product `a × b` in lowest terms.
 * @throws {TypeError} If either argument is not an array or contains invalid rational objects.
 * @throws {RangeError} If either vector does not have length 3 or contains a denominator equal to `0n`.
 */
export function crossProductRationalIterative(a, b) {
	const va = validateAndNormalizeVector3(a, 'a')
	const vb = validateAndNormalizeVector3(b, 'b')

	const result = new Array(3)
	for (let i = 0; i < 3; i++) {
		const j = (i + 1) % 3
		const k = (i + 2) % 3

		// Component i = va[j] * vb[k] - va[k] * vb[j]
		const left = normalizeRational(va[j].num * vb[k].num, va[j].den * vb[k].den)
		const right = normalizeRational(va[k].num * vb[j].num, va[k].den * vb[j].den)

		const commonDenGcd = gcdIterative(left.den, right.den)
		const leftScale = right.den / commonDenGcd
		const rightScale = left.den / commonDenGcd

		const diffNum = left.num * leftScale - right.num * rightScale
		const diffDen = left.den * leftScale

		result[i] = normalizeRational(diffNum, diffDen)
	}

	return /** @type {[Rational, Rational, Rational]} */ (result)
}
