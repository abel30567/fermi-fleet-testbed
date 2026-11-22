/**
 * @typedef {object} Rational
 * @property {bigint} num - Numerator as a BigInt.
 * @property {bigint} den - Non-zero denominator as a BigInt.
 */

/**
 * Computes the greatest common divisor of two BigInts using the iterative
 * Euclidean algorithm. Always returns a non-negative BigInt.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
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
 * Validates that a value is a well-formed rational object `{ num: BigInt, den: BigInt }`
 * with a non-zero denominator.
 *
 * @param {unknown} value
 * @param {string} label
 * @param {number} index
 * @throws {TypeError} If value is not an object with BigInt `num` and `den` properties.
 * @throws {RangeError} If `den` is `0n`.
 */
function validateRational(value, label, index) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label}[${index}] must be a rational object { num: BigInt, den: BigInt }`)
	}
	if (typeof value.num !== 'bigint' || typeof value.den !== 'bigint') {
		throw new TypeError(`${label}[${index}] must have BigInt num and den properties`)
	}
	if (value.den === 0n) {
		throw new RangeError(`${label}[${index}].den must not be 0n`)
	}
}

/**
 * Computes the exact dot product of two equal-length vectors of rational numbers
 * `{ num: BigInt, den: BigInt }`, returning the result in lowest terms with `den > 0n`.
 *
 * Uses straightforward iterative accumulation and an iterative Euclidean GCD
 * to keep intermediate fractions reduced at every step.
 *
 * For empty vectors (`[]`, `[]`), returns `{ num: 0n, den: 1n }`.
 *
 * @param {readonly Rational[]} a - First rational vector.
 * @param {readonly Rational[]} b - Second rational vector (must match `a.length`).
 * @returns {Rational} Exact dot product in lowest terms with `den > 0n` (and `num: 0n, den: 1n` for zero).
 * @throws {TypeError} If `a` or `b` is not an array, or any element is not a valid rational object.
 * @throws {RangeError} If `a.length !== b.length`, or any element has `den === 0n`.
 */
export function dotProductRationalIterative(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument must be an array of rationals')
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument must be an array of rationals')
	}
	if (a.length !== b.length) {
		throw new RangeError(`Vector lengths must match: received ${a.length} and ${b.length}`)
	}

	let accNum = 0n
	let accDen = 1n

	for (let i = 0; i < a.length; i++) {
		const left = a[i]
		const right = b[i]
		validateRational(left, 'a', i)
		validateRational(right, 'b', i)

		let termNum = left.num * right.num
		if (termNum === 0n) {
			continue
		}

		let termDen = left.den * right.den
		if (termDen < 0n) {
			termNum = -termNum
			termDen = -termDen
		}

		const termGcd = gcdIterative(termNum, termDen)
		termNum /= termGcd
		termDen /= termGcd

		const denGcd = gcdIterative(accDen, termDen)
		const accScale = termDen / denGcd
		const termScale = accDen / denGcd

		accNum = accNum * accScale + termNum * termScale
		if (accNum === 0n) {
			accDen = 1n
		} else {
			accDen = termScale * termDen
			const accGcd = gcdIterative(accNum, accDen)
			accNum /= accGcd
			accDen /= accGcd
		}
	}

	return { num: accNum, den: accDen }
}
