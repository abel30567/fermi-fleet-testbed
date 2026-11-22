/**
 * Compute exact integer power `base ** exp` for BigInt `base` and non-negative BigInt `exp`.
 * Uses the algebraic convention `0n ** 0n === 1n` required for polynomial evaluation and
 * closed-form monomial differentiation (e.g., d/dx [x^1] = 1 * x^0 = 1 at x = 0).
 *
 * @param {bigint} base
 * @param {bigint} exp - Non-negative integer exponent.
 * @returns {bigint}
 */
function bigintPow(base, exp) {
	if (exp === 0n) return 1n
	if (base === 0n) return 0n
	if (base === 1n) return 1n
	if (base === -1n) return (exp & 1n) === 0n ? 1n : -1n

	let result = 1n
	let b = base
	let e = exp
	while (e > 0n) {
		if ((e & 1n) === 1n) {
			result *= b
		}
		e >>= 1n
		if (e > 0n) {
			b *= b
		}
	}
	return result
}

/**
 * Validate and normalize a single monomial exponent to a non-negative BigInt.
 *
 * @param {unknown} exp
 * @param {number} termIndex
 * @param {number} dimIndex
 * @returns {bigint}
 */
function normalizeExponent(exp, termIndex, dimIndex) {
	if (typeof exp === 'bigint') {
		if (exp < 0n) {
			throw new RangeError(
				`terms[${termIndex}].powers[${dimIndex}] must be a non-negative integer`,
			)
		}
		return exp
	}
	if (typeof exp === 'number') {
		if (!Number.isSafeInteger(exp) || exp < 0) {
			throw new RangeError(
				`terms[${termIndex}].powers[${dimIndex}] must be a non-negative safe integer`,
			)
		}
		return BigInt(exp)
	}
	throw new TypeError(
		`terms[${termIndex}].powers[${dimIndex}] must be a bigint or non-negative safe integer number`,
	)
}

/**
 * Compute the exact gradient ∇f(point) = [∂f/∂x_0, ..., ∂f/∂x_{n-1}] of a multivariate
 * polynomial scalar field over BigInt integers using closed-form monomial partial
 * differentiation.
 *
 * The polynomial is represented as a sum of monomial terms:
 *   f(x_0, ..., x_{n-1}) = Σ_t coeff_t * Π_{j=0}^{n-1} x_j^{powers_t[j]}
 *
 * Each partial derivative is evaluated exactly in arbitrary-precision BigInt arithmetic:
 *   ∂f/∂x_i(x) = Σ_{t : p_{t,i} >= 1} coeff_t * p_{t,i} * x_i^{p_{t,i} - 1} * Π_{j != i} x_j^{p_{t,j}}
 *
 * @param {Array<{ coeff: bigint, powers: Array<bigint | number> }>} terms
 *   Array of polynomial monomial terms. An empty array represents the zero field.
 * @param {bigint[]} point
 *   Non-empty BigInt coordinate vector `[x_0, ..., x_{n-1}]` at which to evaluate ∇f.
 * @returns {bigint[]} Exact BigInt gradient vector `[∂f/∂x_0, ..., ∂f/∂x_{n-1}]`.
 * @throws {TypeError} If `terms`, `point`, term objects, coefficients, coordinates, or power types are invalid.
 * @throws {RangeError} If `point` is empty, `powers.length !== point.length`, or any exponent is negative/non-integer/unsafe.
 */
export function gradientBigIntSeries(terms, point) {
	if (!Array.isArray(terms)) {
		throw new TypeError('terms must be an array')
	}
	if (!Array.isArray(point)) {
		throw new TypeError('point must be an array of BigInt coordinates')
	}
	const dim = point.length
	if (dim === 0) {
		throw new RangeError('point must be a non-empty coordinate vector')
	}
	for (let i = 0; i < dim; i++) {
		if (typeof point[i] !== 'bigint') {
			throw new TypeError(`point[${i}] must be a bigint`)
		}
	}

	const grad = new Array(dim).fill(0n)

	for (let t = 0; t < terms.length; t++) {
		const term = terms[t]
		if (term === null || typeof term !== 'object' || Array.isArray(term)) {
			throw new TypeError(`terms[${t}] must be a plain object { coeff, powers }`)
		}
		if (typeof term.coeff !== 'bigint') {
			throw new TypeError(`terms[${t}].coeff must be a bigint`)
		}
		if (!Array.isArray(term.powers)) {
			throw new TypeError(`terms[${t}].powers must be an array`)
		}
		if (term.powers.length !== dim) {
			throw new RangeError(
				`terms[${t}].powers length (${term.powers.length}) must match point dimension (${dim})`,
			)
		}

		const exponents = new Array(dim)
		for (let j = 0; j < dim; j++) {
			exponents[j] = normalizeExponent(term.powers[j], t, j)
		}

		const coeff = term.coeff
		if (coeff === 0n) {
			continue
		}

		// Precompute x_j^{p_j} along with prefix and suffix products so that
		// Π_{j != i} x_j^{p_j} = prefix[i] * suffix[i + 1] without division (safe at x_j = 0n).
		const values = new Array(dim)
		const prefix = new Array(dim + 1)
		const suffix = new Array(dim + 1)

		prefix[0] = 1n
		for (let j = 0; j < dim; j++) {
			values[j] = bigintPow(point[j], exponents[j])
			prefix[j + 1] = prefix[j] * values[j]
		}

		suffix[dim] = 1n
		for (let j = dim - 1; j >= 0; j--) {
			suffix[j] = suffix[j + 1] * values[j]
		}

		for (let i = 0; i < dim; i++) {
			const p = exponents[i]
			if (p === 0n) {
				continue
			}
			const otherFactors = prefix[i] * suffix[i + 1]
			if (otherFactors === 0n) {
				continue
			}
			const reducedPower = bigintPow(point[i], p - 1n)
			grad[i] += coeff * p * reducedPower * otherFactors
		}
	}

	return grad
}
