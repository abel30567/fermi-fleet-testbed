/**
 * Exact rational arithmetic helpers.
 */

/**
 * Returns the absolute value of a BigInt.
 * @param {bigint} n
 * @returns {bigint}
 */
function absBigInt(n) {
	return n < 0n ? -n : n
}

/**
 * Computes the greatest common divisor of two non-negative BigInts.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = a
	let y = b
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

/**
 * Normalizes a rational number (num / den) to lowest terms with den > 0n
 * and canonical zero { num: 0n, den: 1n }.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
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
	const g = gcdBigInt(absBigInt(n), d)
	return { num: n / g, den: d / g }
}

/**
 * Validates and normalizes an input rational object `{ num: bigint, den: bigint }`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {{ num: bigint, den: bigint }}
 */
function validateRational(value, label) {
	if (value === null || typeof value !== 'object') {
		throw new TypeError(`${label} must be a rational object { num: BigInt, den: BigInt }`)
	}
	if (typeof value.num !== 'bigint' || typeof value.den !== 'bigint') {
		throw new TypeError(`${label}.num and ${label}.den must be BigInt values`)
	}
	if (value.den === 0n) {
		throw new RangeError(`${label}.den must not be 0n`)
	}
	return normalizeRational(value.num, value.den)
}

/**
 * Adds two normalized rationals and returns the normalized sum.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function addRational(a, b) {
	if (a.num === 0n) {
		return { num: b.num, den: b.den }
	}
	if (b.num === 0n) {
		return { num: a.num, den: a.den }
	}
	const g = gcdBigInt(a.den, b.den)
	const aDenReduced = a.den / g
	const bDenReduced = b.den / g
	const num = a.num * bDenReduced + b.num * aDenReduced
	const den = aDenReduced * b.den
	return normalizeRational(num, den)
}

/**
 * Multiplies two normalized rationals and returns the normalized product.
 * Uses cross-cancellation before multiplying to keep intermediate integers small.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function mulRational(a, b) {
	if (a.num === 0n || b.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const g1 = gcdBigInt(absBigInt(a.num), b.den)
	const g2 = gcdBigInt(absBigInt(b.num), a.den)
	const num = (a.num / g1) * (b.num / g2)
	const den = (a.den / g2) * (b.den / g1)
	return { num, den }
}

/**
 * Computes an exact non-negative integer power of a normalized rational, using a per-coordinate cache.
 * Follows the power-series convention 0^0 = 1.
 *
 * @param {{ num: bigint, den: bigint }} base - Normalized rational base.
 * @param {number} exp - Non-negative safe integer exponent.
 * @param {Map<number, { num: bigint, den: bigint }>} cache - Cache for this coordinate.
 * @returns {{ num: bigint, den: bigint }}
 */
function powRationalCached(base, exp, cache) {
	const cached = cache.get(exp)
	if (cached !== undefined) {
		return cached
	}
	let result
	if (exp === 0) {
		result = { num: 1n, den: 1n }
	} else if (base.num === 0n) {
		result = { num: 0n, den: 1n }
	} else {
		const e = BigInt(exp)
		// Since gcd(|base.num|, base.den) === 1n and base.den > 0n,
		// (base.num ** e) / (base.den ** e) is already in lowest terms with den > 0n.
		result = { num: base.num ** e, den: base.den ** e }
	}
	cache.set(exp, result)
	return result
}

/**
 * Computes the exact gradient vector `[df/dx_0, ..., df/dx_{n-1}]` of a multivariate
 * rational polynomial / truncated power series evaluated at a rational point vector.
 *
 * The function `f(x_0, ..., x_{n-1})` is represented as a sum of monomial terms:
 *   `f(x) = sum_m (coeff_m * prod_{j=0}^{n-1} x_j^{powers_{m,j}})`
 *
 * Algorithm:
 *   By linearity and the power rule, each monomial term contributes to the i-th partial
 *   derivative (when `powers[i] >= 1`):
 *     `coeff * powers[i] * x_i^{powers[i] - 1} * prod_{j != i} x_j^{powers[j]}`
 *   For each term, prefix and suffix products of `x_j^{powers[j]}` are computed in O(n)
 *   rational multiplications so that `prod_{j != i} x_j^{powers[j]} = prefix[i] * suffix[i + 1]`
 *   without division by zero when coordinates equal 0. Coordinate powers are memoized per
 *   variable across terms, and all intermediate and final rationals are kept in lowest terms.
 *
 * @param {Array<{ coeff: { num: bigint, den: bigint }, powers: number[] }>} terms
 *   Array of monomial terms defining the multivariate polynomial or truncated power series.
 *   Each term has a rational `coeff` and an array `powers` of non-negative safe integers
 *   whose length matches `point.length`. An empty `terms` array represents the zero function.
 * @param {Array<{ num: bigint, den: bigint }>} point
 *   Non-empty array of exact rational coordinates `[x_0, ..., x_{n-1}]` at which to evaluate
 *   the gradient.
 * @returns {Array<{ num: bigint, den: bigint }>}
 *   Gradient vector `[df/dx_0, ..., df/dx_{n-1}]` where every entry is a normalized exact
 *   rational `{ num: bigint, den: bigint }` in lowest terms (`den > 0n`,
 *   `gcd(|num|, den) === 1n`, zero is `{ num: 0n, den: 1n }`).
 * @throws {TypeError}
 *   If `terms` or `point` is not an Array, if any term is not an object, if any `powers`
 *   entry is not a number or `powers` is not an Array, or if any rational lacks BigInt
 *   `num`/`den` fields.
 * @throws {RangeError}
 *   If `point` is empty, if any rational has `den === 0n`, if any `term.powers.length`
 *   does not equal `point.length`, or if any exponent is negative or not a safe integer.
 */
export function gradientRationalSeries(terms, point) {
	if (!Array.isArray(terms)) {
		throw new TypeError('terms must be an array')
	}
	if (!Array.isArray(point)) {
		throw new TypeError('point must be an array')
	}
	const dim = point.length
	if (dim === 0) {
		throw new RangeError('point must be a non-empty array of rationals')
	}

	// Validate and normalize every coordinate of point.
	const normPoint = new Array(dim)
	const powerCaches = new Array(dim)
	for (let j = 0; j < dim; j++) {
		normPoint[j] = validateRational(point[j], `point[${j}]`)
		const cache = new Map()
		cache.set(0, { num: 1n, den: 1n })
		cache.set(1, normPoint[j])
		powerCaches[j] = cache
	}

	// Validate all terms upfront so malformed zero-coefficient terms are still caught.
	const normTerms = new Array(terms.length)
	for (let t = 0; t < terms.length; t++) {
		const term = terms[t]
		if (term === null || typeof term !== 'object') {
			throw new TypeError(`terms[${t}] must be an object { coeff, powers }`)
		}
		const coeff = validateRational(term.coeff, `terms[${t}].coeff`)
		if (!Array.isArray(term.powers)) {
			throw new TypeError(`terms[${t}].powers must be an array of non-negative integers`)
		}
		if (term.powers.length !== dim) {
			throw new RangeError(
				`terms[${t}].powers length (${term.powers.length}) must match point length (${dim})`,
			)
		}
		const powers = new Array(dim)
		for (let j = 0; j < dim; j++) {
			const p = term.powers[j]
			if (typeof p !== 'number') {
				throw new TypeError(`terms[${t}].powers[${j}] must be a number`)
			}
			if (!Number.isSafeInteger(p) || p < 0) {
				throw new RangeError(
					`terms[${t}].powers[${j}] must be a non-negative safe integer`,
				)
			}
			powers[j] = p
		}
		normTerms[t] = { coeff, powers }
	}

	// Initialize gradient vector to zeros (distinct objects).
	const grad = new Array(dim)
	for (let i = 0; i < dim; i++) {
		grad[i] = { num: 0n, den: 1n }
	}

	const factorVals = new Array(dim)
	const prefix = new Array(dim + 1)
	const suffix = new Array(dim + 1)
	prefix[0] = { num: 1n, den: 1n }
	suffix[dim] = { num: 1n, den: 1n }

	for (let t = 0; t < normTerms.length; t++) {
		const { coeff, powers } = normTerms[t]
		if (coeff.num === 0n) {
			continue
		}

		// Evaluate x_j^{powers[j]} for each coordinate j.
		for (let j = 0; j < dim; j++) {
			factorVals[j] = powRationalCached(normPoint[j], powers[j], powerCaches[j])
		}

		// Build prefix and suffix products:
		//   prefix[i]     = prod_{j < i} x_j^{powers[j]}
		//   suffix[i + 1] = prod_{j > i} x_j^{powers[j]}
		for (let j = 0; j < dim; j++) {
			prefix[j + 1] = mulRational(prefix[j], factorVals[j])
		}
		for (let j = dim - 1; j >= 0; j--) {
			suffix[j] = mulRational(suffix[j + 1], factorVals[j])
		}

		// Accumulate partial derivative contribution for each variable i.
		for (let i = 0; i < dim; i++) {
			const p = powers[i]
			if (p === 0) {
				continue
			}
			const otherFactors = mulRational(prefix[i], suffix[i + 1])
			if (otherFactors.num === 0n) {
				continue
			}
			const derivPower = powRationalCached(normPoint[i], p - 1, powerCaches[i])
			if (derivPower.num === 0n) {
				continue
			}
			const coeffTimesP = mulRational(coeff, { num: BigInt(p), den: 1n })
			const contribution = mulRational(
				mulRational(coeffTimesP, derivPower),
				otherFactors,
			)
			grad[i] = addRational(grad[i], contribution)
		}
	}

	return grad
}
