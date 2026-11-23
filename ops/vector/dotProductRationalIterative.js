/**
 * Exact rational number represented by arbitrary-precision BigInt numerator and denominator.
 *
 * @typedef {Object} Rational
 * @property {bigint} num - The numerator.
 * @property {bigint} den - The non-zero denominator.
 */

/**
 * Computes the non-negative greatest common divisor of two BigInt values
 * using the iterative Euclidean algorithm.
 *
 * @param {bigint} x
 * @param {bigint} y
 * @returns {bigint}
 */
function gcdBigInt(x, y) {
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
 * Validates that a value is a well-formed Rational ({ num: bigint, den: bigint })
 * with a non-zero denominator.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Rational}
 */
function validateRational(value, label) {
	if (value === null || typeof value !== 'object') {
		throw new TypeError(`${label} must be an object with bigint num and den properties`)
	}
	const { num, den } = /** @type {{ num: unknown, den: unknown }} */ (value)
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label}.num and ${label}.den must be BigInt values`)
	}
	if (den === 0n) {
		throw new RangeError(`${label}.den must not be 0n`)
	}
	return { num, den }
}

/**
 * Computes the dot product of two vectors of exact rational numbers
 * `{ num: bigint, den: bigint }` using a straightforward iterative accumulation,
 * returning the result in canonical lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`,
 * and `{ num: 0n, den: 1n }` when zero).
 *
 * Input rationals may be unreduced or have negative denominators, provided each
 * `num` and `den` is a `BigInt` and `den !== 0n`. Input arrays and objects are not mutated.
 *
 * @param {Rational[]} a - First vector of exact rationals.
 * @param {Rational[]} b - Second vector of exact rationals (same length as `a`).
 * @returns {Rational} Exact dot product in lowest terms.
 * @throws {TypeError} If `a` or `b` is not an array, contains holes, or has invalid rational entries.
 * @throws {RangeError} If `a` and `b` have different lengths or any entry has a zero denominator.
 */
export function dotProductRationalIterative(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument must be an array')
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument must be an array')
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Vector lengths must match (received ${a.length} and ${b.length})`
		)
	}

	let accNum = 0n
	let accDen = 1n

	for (let i = 0; i < a.length; i++) {
		if (!(i in a)) {
			throw new TypeError(`a[${i}] must not be a sparse array hole`)
		}
		if (!(i in b)) {
			throw new TypeError(`b[${i}] must not be a sparse array hole`)
		}

		const ai = validateRational(a[i], `a[${i}]`)
		const bi = validateRational(b[i], `b[${i}]`)

		if (ai.num === 0n || bi.num === 0n) {
			continue
		}

		let prodNum = ai.num * bi.num
		let prodDen = ai.den * bi.den
		if (prodDen < 0n) {
			prodNum = -prodNum
			prodDen = -prodDen
		}

		const prodGcd = gcdBigInt(prodNum, prodDen)
		prodNum /= prodGcd
		prodDen /= prodGcd

		const denGcd = gcdBigInt(accDen, prodDen)
		const leftScale = prodDen / denGcd
		const rightScale = accDen / denGcd

		const sumNum = accNum * leftScale + prodNum * rightScale
		if (sumNum === 0n) {
			accNum = 0n
			accDen = 1n
		} else {
			const sumDen = rightScale * prodDen
			const sumGcd = gcdBigInt(sumNum, sumDen)
			accNum = sumNum / sumGcd
			accDen = sumDen / sumGcd
		}
	}

	return { num: accNum, den: accDen }
}
