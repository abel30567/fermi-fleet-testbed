/**
 * Computes the absolute value of a BigInt.
 *
 * @param {bigint} value - Integer value.
 * @returns {bigint} Non-negative magnitude of `value`.
 */
function absBigInt(value) {
	return value < 0n ? -value : value
}

/**
 * Computes the greatest common divisor of two BigInts using the Euclidean algorithm.
 *
 * @param {bigint} a - First integer.
 * @param {bigint} b - Second integer.
 * @returns {bigint} Non-negative greatest common divisor `gcd(|a|, |b|)`.
 */
function gcdBigInt(a, b) {
	let x = absBigInt(a)
	let y = absBigInt(b)
	while (y !== 0n) {
		const remainder = x % y
		x = y
		y = remainder
	}
	return x
}

/**
 * Validates and normalizes a rational number `{ num, den }` into lowest terms
 * with a strictly positive denominator (`den > 0n`, `gcd(|num|, den) === 1n`,
 * and zero represented as `{ num: 0n, den: 1n }`).
 *
 * @param {unknown} value - Candidate rational object.
 * @param {string} label - Descriptive label for error messages.
 * @returns {{ num: bigint, den: bigint }} Normalized rational in lowest terms.
 * @throws {TypeError} If `value` is not an object with BigInt `num` and `den` properties.
 * @throws {RangeError} If `value.den === 0n`.
 */
function validateAndNormalizeRational(value, label) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${label} must be a rational object { num: bigint, den: bigint }`)
	}
	const { num, den } = value
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label} must have BigInt num and den properties`)
	}
	if (den === 0n) {
		throw new RangeError(`${label} denominator must be non-zero`)
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	const signedNum = den < 0n ? -num : num
	const positiveDen = den < 0n ? -den : den
	const divisor = gcdBigInt(signedNum, positiveDen)
	return {
		num: signedNum / divisor,
		den: positiveDen / divisor,
	}
}

/**
 * Computes the exact dot product (Euclidean inner product) of two rational vectors
 * of equal length:
 *
 *   dot(a, b) = sum_{i = 0}^{n - 1} (a[i] * b[i])
 *
 * Algorithm:
 * 1. Validates that `a` and `b` are arrays of matching length and that every element
 *    is a well-formed rational `{ num: bigint, den: bigint }` with `den !== 0n`.
 * 2. Evaluates the finite inner-product series term-by-term in exact arbitrary-precision
 *    rational arithmetic. For each term `a[i] * b[i]`, cross-cancels common factors
 *    `gcd(|a_i.num|, b_i.den)` and `gcd(|b_i.num|, a_i.den)` prior to multiplication so
 *    each product is already reduced.
 * 3. Accumulates each reduced term into the running sum using LCM-based denominator
 *    scaling (`lcm(accDen, termDen)`) and immediate GCD reduction to keep intermediate
 *    BigInt magnitudes minimal.
 * 4. For empty vectors (`n === 0`), returns the empty-sum identity `{ num: 0n, den: 1n }`.
 *
 * @param {Array<{ num: bigint, den: bigint }>} a - First rational vector.
 * @param {Array<{ num: bigint, den: bigint }>} b - Second rational vector (same length as `a`).
 * @returns {{ num: bigint, den: bigint }} Exact dot product in lowest terms
 *   (`den > 0n`, `gcd(|num|, den) === 1n`, zero represented as `{ num: 0n, den: 1n }`).
 * @throws {TypeError} If `a` or `b` is not an array, or any element is not a valid
 *   rational object with BigInt `num` and `den`.
 * @throws {RangeError} If `a.length !== b.length`, or any element has `den === 0n`.
 */
export function dotProductRationalSeries(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument `a` must be an array of rationals')
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument `b` must be an array of rationals')
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Vector lengths must match: received a.length=${a.length} and b.length=${b.length}`,
		)
	}

	let accNum = 0n
	let accDen = 1n

	for (let i = 0; i < a.length; i++) {
		if (!(i in a)) {
			throw new TypeError(`a[${i}] is missing (sparse array elements are not allowed)`)
		}
		if (!(i in b)) {
			throw new TypeError(`b[${i}] is missing (sparse array elements are not allowed)`)
		}

		const ra = validateAndNormalizeRational(a[i], `a[${i}]`)
		const rb = validateAndNormalizeRational(b[i], `b[${i}]`)

		if (ra.num === 0n || rb.num === 0n) {
			continue
		}

		// Cross-cancel before multiplying so termNum / termDen is already in lowest terms.
		const g1 = gcdBigInt(ra.num, rb.den)
		const g2 = gcdBigInt(rb.num, ra.den)
		const termNum = (ra.num / g1) * (rb.num / g2)
		const termDen = (ra.den / g2) * (rb.den / g1)

		// Add termNum / termDen to accNum / accDen using LCM denominator scaling.
		if (accNum === 0n) {
			accNum = termNum
			accDen = termDen
		} else {
			const gDen = gcdBigInt(accDen, termDen)
			const accScale = termDen / gDen
			const termScale = accDen / gDen
			const nextNum = accNum * accScale + termNum * termScale
			if (nextNum === 0n) {
				accNum = 0n
				accDen = 1n
			} else {
				const nextDen = termScale * termDen
				const gRes = gcdBigInt(nextNum, nextDen)
				accNum = nextNum / gRes
				accDen = nextDen / gRes
			}
		}
	}

	return { num: accNum, den: accDen }
}
