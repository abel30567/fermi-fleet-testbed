/**
 * Exact rational dot product over `{ num: bigint, den: bigint }` vectors using
 * cross-canceled multiplication, common-denominator grouping, denominator-ordered
 * pairwise tree summation, and Knuth's reduced rational addition to minimize
 * intermediate BigInt expression swell.
 *
 * @typedef {Object} Rational
 * @property {bigint} num - Exact BigInt numerator.
 * @property {bigint} den - Non-zero exact BigInt denominator.
 */

/**
 * Computes the absolute value of a BigInt.
 *
 * @param {bigint} value
 * @returns {bigint}
 */
function absBigInt(value) {
	return value < 0n ? -value : value
}

/**
 * Computes the non-negative greatest common divisor of two non-negative BigInts
 * using an iterative Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcd(a, b) {
	let x = a
	let y = b
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

/**
 * Validates an input rational object and normalizes it to canonical lowest terms
 * with strictly positive denominator (and `{ num: 0n, den: 1n }` for zero).
 *
 * @param {unknown} value
 * @param {string} vectorName
 * @param {number} index
 * @returns {Rational}
 */
function normalizeRational(value, vectorName, index) {
	if (value === null || typeof value !== 'object') {
		throw new TypeError(
			`${vectorName}[${index}] must be a rational object { num: bigint, den: bigint }`,
		)
	}

	const { num, den } = /** @type {{ num: unknown, den: unknown }} */ (value)

	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(
			`${vectorName}[${index}] must have bigint properties 'num' and 'den'`,
		)
	}

	if (den === 0n) {
		throw new RangeError(`${vectorName}[${index}] has a zero denominator`)
	}

	if (num === 0n) {
		return { num: 0n, den: 1n }
	}

	const signedNum = den < 0n ? -num : num
	const positiveDen = den < 0n ? -den : den
	const divisor = gcd(absBigInt(signedNum), positiveDen)

	return {
		num: signedNum / divisor,
		den: positiveDen / divisor,
	}
}

/**
 * Multiplies two already-reduced rationals using cross-cancellation so the
 * product is in lowest terms with minimal intermediate BigInt growth.
 *
 * @param {Rational} x
 * @param {Rational} y
 * @returns {Rational}
 */
function multiplyReduced(x, y) {
	if (x.num === 0n || y.num === 0n) {
		return { num: 0n, den: 1n }
	}

	const g1 = gcd(absBigInt(x.num), y.den)
	const g2 = gcd(absBigInt(y.num), x.den)

	return {
		num: (x.num / g1) * (y.num / g2),
		den: (x.den / g2) * (y.den / g1),
	}
}

/**
 * Adds two already-reduced rationals using Knuth's exact reduced addition
 * algorithm (TAOCP Vol. 2, Section 4.5.1), avoiding full-denominator GCDs.
 *
 * @param {Rational} x
 * @param {Rational} y
 * @returns {Rational}
 */
function addReduced(x, y) {
	if (x.num === 0n) {
		return y
	}
	if (y.num === 0n) {
		return x
	}

	const d1 = gcd(x.den, y.den)
	if (d1 === 1n) {
		const num = x.num * y.den + y.num * x.den
		if (num === 0n) {
			return { num: 0n, den: 1n }
		}
		return { num, den: x.den * y.den }
	}

	const xDenReduced = x.den / d1
	const yDenReduced = y.den / d1
	const t = x.num * yDenReduced + y.num * xDenReduced

	if (t === 0n) {
		return { num: 0n, den: 1n }
	}

	const d2 = gcd(absBigInt(t), d1)
	return {
		num: t / d2,
		den: xDenReduced * (y.den / d2),
	}
}

/**
 * Computes the exact dot product of two vectors of rational numbers
 * `{ num: bigint, den: bigint }`, returning the result in canonical lowest
 * terms (`den > 0n`, `gcd(|num|, den) === 1n`, and `{ num: 0n, den: 1n }` for
 * zero).
 *
 * Robustness strategy:
 * 1. Validates and normalizes every input element (including negative or
 *    unreduced fractions) before arithmetic.
 * 2. Cross-cancels factors during each product to prevent unnecessary growth.
 * 3. Accumulates products sharing the same denominator directly before reducing.
 * 4. Orders remaining terms by ascending denominator magnitude and reduces them
 *    via an iterative pairwise binary tree using Knuth's reduced addition,
 *    preventing catastrophic cancellation and limiting intermediate swell.
 *
 * @param {Rational[]} a - First rational vector.
 * @param {Rational[]} b - Second rational vector (must match `a.length`).
 * @returns {Rational} Exact dot product in lowest terms.
 * @throws {TypeError} If inputs are not arrays or contain invalid rational elements.
 * @throws {RangeError} If vector lengths differ or any element has `den === 0n`.
 */
export function dotProductRationalStable(a, b) {
	if (!Array.isArray(a) || !Array.isArray(b)) {
		throw new TypeError('Both vector arguments must be arrays')
	}

	if (a.length !== b.length) {
		throw new RangeError(
			`Vector length mismatch: ${a.length} !== ${b.length}`,
		)
	}

	const len = a.length
	if (len === 0) {
		return { num: 0n, den: 1n }
	}

	/** @type {Map<bigint, bigint>} */
	const byDenominator = new Map()

	for (let i = 0; i < len; i++) {
		if (!(i in a)) {
			throw new TypeError(`a[${i}] is missing (sparse array not supported)`)
		}
		if (!(i in b)) {
			throw new TypeError(`b[${i}] is missing (sparse array not supported)`)
		}

		const ra = normalizeRational(a[i], 'a', i)
		const rb = normalizeRational(b[i], 'b', i)
		const prod = multiplyReduced(ra, rb)

		if (prod.num !== 0n) {
			const prev = byDenominator.get(prod.den) ?? 0n
			byDenominator.set(prod.den, prev + prod.num)
		}
	}

	/** @type {Rational[]} */
	const terms = []
	for (const [den, num] of byDenominator) {
		if (num === 0n) {
			continue
		}
		const divisor = gcd(absBigInt(num), den)
		terms.push({
			num: num / divisor,
			den: den / divisor,
		})
	}

	if (terms.length === 0) {
		return { num: 0n, den: 1n }
	}

	// Order by ascending denominator magnitude so smaller denominators combine
	// first in the pairwise tree, minimizing intermediate BigInt swell.
	terms.sort((x, y) => (x.den < y.den ? -1 : x.den > y.den ? 1 : 0))

	let level = terms
	while (level.length > 1) {
		/** @type {Rational[]} */
		const next = []
		for (let i = 0; i < level.length; i += 2) {
			if (i + 1 < level.length) {
				next.push(addReduced(level[i], level[i + 1]))
			} else {
				next.push(level[i])
			}
		}
		level = next
	}

	return { num: level[0].num, den: level[0].den }
}
