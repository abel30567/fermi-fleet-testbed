/**
 * Compute the greatest common divisor of two BigInt values using the iterative
 * Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative GCD of `a` and `b`.
 */
function gcd(a, b) {
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
 * Normalize a rational number to lowest terms with a strictly positive denominator.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
function normalizeRational(num, den) {
	if (den === 0n) {
		throw new RangeError('Denominator must not be zero')
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	if (den < 0n) {
		num = -num
		den = -den
	}
	const g = gcd(num, den)
	return { num: num / g, den: den / g }
}

/**
 * Add two normalized rationals and return the sum in lowest terms.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function addRational(a, b) {
	if (a.num === 0n) return b
	if (b.num === 0n) return a
	const g = gcd(a.den, b.den)
	const aDenReduced = a.den / g
	const bDenReduced = b.den / g
	const num = a.num * bDenReduced + b.num * aDenReduced
	const den = aDenReduced * b.den
	return normalizeRational(num, den)
}

/**
 * Compute ln(mNum / mDen) for a reduced positive rational m near 1 using the
 * iterative hyperbolic arctangent series:
 *
 *   ln(m) = 2 * sum_{k=0}^{terms-1} (u^(2k+1)) / (2k + 1),  u = (m - 1) / (m + 1)
 *
 * @param {bigint} mNum Positive numerator.
 * @param {bigint} mDen Positive denominator.
 * @param {number} terms Number of series terms (>= 1).
 * @returns {{ num: bigint, den: bigint }}
 */
function lnNearOne(mNum, mDen, terms) {
	if (mNum === mDen) {
		return { num: 0n, den: 1n }
	}

	const u = normalizeRational(mNum - mDen, mNum + mDen)
	const u2Num = u.num * u.num
	const u2Den = u.den * u.den

	let powNum = u.num
	let powDen = u.den
	let sum = { num: 0n, den: 1n }

	for (let k = 0; k < terms; k++) {
		const odd = BigInt(2 * k + 1)
		const term = normalizeRational(powNum, powDen * odd)
		sum = addRational(sum, term)

		if (k + 1 < terms) {
			powNum *= u2Num
			powDen *= u2Den
		}
	}

	return normalizeRational(sum.num * 2n, sum.den)
}

/**
 * Compute ln(num / den) for a reduced rational strictly greater than 1.
 *
 * Performs exact binary range reduction `num / den = m * 2^k` with `m in [3/4, 3/2)`
 * so that `|u| = |(m - 1) / (m + 1)| < 1/5`, ensuring rapid convergence of the
 * iterative series. Computes `ln(2)` via `ln(4/3) + ln(3/2)` when `k !== 0n`.
 *
 * @param {bigint} num Positive numerator (num > den).
 * @param {bigint} den Positive denominator.
 * @param {number} terms Number of series terms (>= 1).
 * @returns {{ num: bigint, den: bigint }}
 */
function lnGreaterThanOne(num, den, terms) {
	let k = BigInt(num.toString(2).length) - BigInt(den.toString(2).length)
	let mNum = num
	let mDen = den << k

	while (mNum * 2n >= mDen * 3n) {
		mDen <<= 1n
		k += 1n
	}
	while (mNum * 4n < mDen * 3n) {
		mNum <<= 1n
		k -= 1n
	}

	const m = normalizeRational(mNum, mDen)
	const lnM = lnNearOne(m.num, m.den, terms)

	if (k === 0n) {
		return lnM
	}

	const ln2 = addRational(lnNearOne(4n, 3n, terms), lnNearOne(3n, 2n, terms))
	const kLn2 = normalizeRational(k * ln2.num, ln2.den)
	return addRational(lnM, kLn2)
}

/**
 * Compute the natural logarithm `ln(x)` over exact rationals represented as
 * `{ num: bigint, den: bigint }`, returning a rational approximation in lowest
 * terms with a positive denominator using a straightforward iterative series.
 *
 * For `x = 1`, returns `{ num: 0n, den: 1n }` exactly. For `0 < x < 1`, applies
 * `ln(x) = -ln(1/x)` to preserve exact antisymmetry. For `x > 1`, reduces `x`
 * into `[3/4, 3/2)` by powers of two and evaluates the iterative series
 * `2 * sum_{k=0}^{terms-1} ((m - 1)/(m + 1))^(2k+1) / (2k + 1)`.
 *
 * @param {{ num: bigint, den: bigint }} x Strictly positive rational number.
 * @param {number} [terms=20] Positive safe integer number of series iterations.
 * @returns {{ num: bigint, den: bigint }} Rational approximation of `ln(x)` in lowest terms.
 * @throws {TypeError} If `x` is not an object with BigInt `num` and `den`, or `terms` is not a number.
 * @throws {RangeError} If `x.den === 0n`, `x <= 0`, or `terms` is not a positive safe integer.
 */
export function lnRationalIterative(x, terms = 20) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('Input rational must be a non-null object with BigInt num and den')
	}
	if (typeof x.num !== 'bigint' || typeof x.den !== 'bigint') {
		throw new TypeError('Rational num and den must both be BigInt values')
	}
	if (typeof terms !== 'number') {
		throw new TypeError('terms must be a number')
	}
	if (!Number.isSafeInteger(terms) || terms < 1) {
		throw new RangeError('terms must be a positive safe integer')
	}

	const normalized = normalizeRational(x.num, x.den)
	if (normalized.num <= 0n) {
		throw new RangeError('Input rational must be strictly positive')
	}

	if (normalized.num === normalized.den) {
		return { num: 0n, den: 1n }
	}

	if (normalized.num < normalized.den) {
		const res = lnGreaterThanOne(normalized.den, normalized.num, terms)
		return { num: -res.num, den: res.den }
	}

	return lnGreaterThanOne(normalized.num, normalized.den, terms)
}
