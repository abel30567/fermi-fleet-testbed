/**
 * Exact rational arithmetic helpers and arccos(x) series evaluation.
 */

/**
 * Computes the non-negative greatest common divisor of two BigInts.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
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
 * Normalizes a rational num / den into lowest terms with den > 0n.
 * Zero is canonicalized as { num: 0n, den: 1n }.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
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
	const g = gcd(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Adds two normalized exact rationals.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function addRational(a, b) {
	const g = gcd(a.den, b.den)
	const aDenDiv = a.den / g
	const bDenDiv = b.den / g
	return normalizeRational(a.num * bDenDiv + b.num * aDenDiv, aDenDiv * b.den)
}

/**
 * Subtracts two normalized exact rationals (a - b).
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function subRational(a, b) {
	const g = gcd(a.den, b.den)
	const aDenDiv = a.den / g
	const bDenDiv = b.den / g
	return normalizeRational(a.num * bDenDiv - b.num * aDenDiv, aDenDiv * b.den)
}

/**
 * Multiplies two normalized exact rationals.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function mulRational(a, b) {
	if (a.num === 0n || b.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const g1 = gcd(a.num, b.den)
	const g2 = gcd(b.num, a.den)
	return normalizeRational(
		(a.num / g1) * (b.num / g2),
		(a.den / g2) * (b.den / g1),
	)
}

/**
 * Computes arctan(1 / m) via the alternating Gregory-Leibniz series:
 *   arctan(1 / m) = sum_{k=0}^{terms-1} (-1)^k / ((2k + 1) * m^(2k + 1))
 *
 * @param {bigint} m - Positive integer reciprocal argument (m >= 2n).
 * @param {number} terms - Number of series terms (>= 1).
 * @returns {{ num: bigint, den: bigint }}
 */
function arctanReciprocalSeries(m, terms) {
	let sum = { num: 0n, den: 1n }
	const mSq = m * m
	let power = m

	for (let k = 0; k < terms; k++) {
		const denom = BigInt(2 * k + 1) * power
		const term = { num: k % 2 === 0 ? 1n : -1n, den: denom }
		sum = addRational(sum, term)
		power *= mSq
	}

	return sum
}

/**
 * Computes pi / 2 as an exact rational approximation using Machin's formula:
 *   pi / 4 = 4 * arctan(1 / 5) - arctan(1 / 239)
 *   pi / 2 = 8 * arctan(1 / 5) - 2 * arctan(1 / 239)
 *
 * @param {number} terms - Number of terms in each arctan series (>= 1).
 * @returns {{ num: bigint, den: bigint }}
 */
function computePiHalf(terms) {
	const atan5 = arctanReciprocalSeries(5n, terms)
	const atan239 = arctanReciprocalSeries(239n, terms)
	const left = mulRational({ num: 8n, den: 1n }, atan5)
	const right = mulRational({ num: 2n, den: 1n }, atan239)
	return subRational(left, right)
}

/**
 * Computes arcsin(x) via its Maclaurin series over exact rationals:
 *   arcsin(x) = sum_{k=0}^{terms-1} ((2k)! / (4^k * (k!)^2 * (2k + 1))) * x^(2k + 1)
 *
 * Uses the recurrence c_0 = 1, c_k = c_{k-1} * (2k - 1) / (2k).
 *
 * @param {{ num: bigint, den: bigint }} x - Normalized rational with |x| < 1.
 * @param {number} terms - Number of series terms (>= 1).
 * @returns {{ num: bigint, den: bigint }}
 */
function computeArcsinSeries(x, terms) {
	if (x.num === 0n) {
		return { num: 0n, den: 1n }
	}

	const xSq = mulRational(x, x)
	let coeff = { num: 1n, den: 1n }
	let xPow = x
	let sum = x

	for (let k = 1; k < terms; k++) {
		const twoK = BigInt(2 * k)
		coeff = mulRational(coeff, normalizeRational(twoK - 1n, twoK))
		xPow = mulRational(xPow, xSq)
		const term = mulRational(
			coeff,
			mulRational(xPow, { num: 1n, den: twoK + 1n }),
		)
		sum = addRational(sum, term)
	}

	return sum
}

/**
 * Computes arccos(x) over exact rationals using the identity:
 *   arccos(x) = pi / 2 - arcsin(x)
 *
 * Algorithm:
 * - Validates `x` as `{ num: BigInt, den: BigInt }` with `den !== 0n` and `|x| <= 1`,
 *   and validates `terms` as a positive integer.
 * - Handles exact boundary cases:
 *   - `x = 1` returns exact `{ num: 0n, den: 1n }`.
 *   - `x = -1` returns `pi` computed as `2 * (pi / 2)` via Machin's formula,
 *     preserving the exact reflection identity `arccos(1) + arccos(-1) = pi`.
 * - For `|x| < 1`, evaluates `pi / 2` via Machin's formula
 *   `pi / 2 = 8 * arctan(1/5) - 2 * arctan(1/239)` with `terms` terms, and subtracts
 *   the `terms`-term Maclaurin rational series for `arcsin(x)`:
 *   `arcsin(x) = sum_{k=0}^{terms-1} ((2k)! / (4^k * (k!)^2 * (2k + 1))) * x^(2k + 1)`.
 * - Because the `arcsin` partial sum is strictly odd (`arcsin(-x) = -arcsin(x)`),
 *   the reflection identity `arccos(x) + arccos(-x) = pi` holds identically for all
 *   `|x| <= 1` and every `terms >= 1`.
 *
 * @param {{ num: bigint, den: bigint }} x - Exact rational input satisfying |x| <= 1.
 * @param {number} [terms=12] - Number of series terms to evaluate (positive integer >= 1).
 * @returns {{ num: bigint, den: bigint }} Exact rational approximation of arccos(x) in lowest
 *   terms (`den > 0n`, `gcd(|num|, den) === 1n`, zero as `{ num: 0n, den: 1n }`).
 * @throws {TypeError} If `x` is not a `{ num: bigint, den: bigint }` object or `terms` is not a number.
 * @throws {RangeError} If `x.den === 0n`, `|x| > 1`, or `terms` is not a positive integer.
 */
export function arccosRationalSeries(x, terms = 12) {
	if (
		x === null ||
		typeof x !== 'object' ||
		typeof x.num !== 'bigint' ||
		typeof x.den !== 'bigint'
	) {
		throw new TypeError(
			'Input x must be a rational object with BigInt num and den properties',
		)
	}

	if (typeof terms !== 'number') {
		throw new TypeError('Parameter terms must be a positive integer')
	}
	if (!Number.isInteger(terms) || terms < 1) {
		throw new RangeError('Parameter terms must be a positive integer (>= 1)')
	}

	const normX = normalizeRational(x.num, x.den)
	const absNum = normX.num < 0n ? -normX.num : normX.num
	if (absNum > normX.den) {
		throw new RangeError('Input x must satisfy |x| <= 1 for arccos(x)')
	}

	// Exact boundary: arccos(1) = 0
	if (normX.num === normX.den) {
		return { num: 0n, den: 1n }
	}

	const piHalf = computePiHalf(terms)

	// Exact boundary: arccos(-1) = pi = 2 * (pi / 2)
	if (normX.num === -normX.den) {
		return mulRational({ num: 2n, den: 1n }, piHalf)
	}

	// Exact center: arccos(0) = pi / 2
	if (normX.num === 0n) {
		return piHalf
	}

	const asinX = computeArcsinSeries(normX, terms)
	return subRational(piHalf, asinX)
}
