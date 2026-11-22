/**
 * Computes the exact divergence ∇·F(point) = Σ_i ∂F_i/∂x_i of an n-dimensional
 * polynomial vector field evaluated at an exact BigInt point.
 *
 * Each component F_i is represented as a finite sum (series) of monomial terms
 * `{ coeff, powers }`, representing `coeff * Π_j x_j^{powers[j]}`.
 * Partial derivatives are evaluated in exact closed form over BigInt:
 *
 *   ∂/∂x_i (c * Π_j x_j^{p_j}) = (c * p_i) * x_i^{p_i - 1} * Π_{j != i} x_j^{p_j}
 *
 * with the standard polynomial convention 0^0 = 1.
 *
 * @typedef {Object} PolynomialTerm
 * @property {bigint} coeff - Exact BigInt coefficient of the monomial.
 * @property {Array<number|bigint>} powers - Non-negative integer exponents, one per dimension.
 *
 * @param {Array<Array<PolynomialTerm>>} field - n-dimensional polynomial vector field (length n >= 1).
 * @param {Array<bigint>} point - Evaluation point in Z^n (length n).
 * @returns {bigint} Exact BigInt scalar value of the divergence ∇·F(point).
 * @throws {TypeError} If any argument, component, term, coefficient, exponent, or coordinate has an invalid type.
 * @throws {RangeError} If the field is empty, dimensions do not match, or any exponent is negative or not a safe integer.
 */
export function divergenceBigIntSeries(field, point) {
	if (!Array.isArray(field)) {
		throw new TypeError('field must be an array of component polynomials')
	}
	const dim = field.length
	if (dim === 0) {
		throw new RangeError('field must have at least one dimension')
	}
	if (!Array.isArray(point)) {
		throw new TypeError('point must be an array of BigInt coordinates')
	}
	if (point.length !== dim) {
		throw new RangeError(
			`point length (${point.length}) must match field dimension (${dim})`,
		)
	}
	for (let j = 0; j < dim; j++) {
		if (typeof point[j] !== 'bigint') {
			throw new TypeError(`point[${j}] must be a BigInt`)
		}
	}

	// Validate all components, terms, and exponents upfront so malformed terms
	// are never silently skipped (even when coeff === 0n or power === 0n).
	const normalizedField = new Array(dim)
	for (let i = 0; i < dim; i++) {
		const component = field[i]
		if (!Array.isArray(component)) {
			throw new TypeError(`field[${i}] must be an array of monomial terms`)
		}
		const normalizedComponent = new Array(component.length)
		for (let t = 0; t < component.length; t++) {
			const term = component[t]
			if (term === null || typeof term !== 'object' || Array.isArray(term)) {
				throw new TypeError(
					`field[${i}][${t}] must be a monomial object { coeff, powers }`,
				)
			}
			if (typeof term.coeff !== 'bigint') {
				throw new TypeError(`field[${i}][${t}].coeff must be a BigInt`)
			}
			if (!Array.isArray(term.powers)) {
				throw new TypeError(
					`field[${i}][${t}].powers must be an array of non-negative integers`,
				)
			}
			if (term.powers.length !== dim) {
				throw new RangeError(
					`field[${i}][${t}].powers length (${term.powers.length}) must match field dimension (${dim})`,
				)
			}
			const normalizedPowers = new Array(dim)
			for (let j = 0; j < dim; j++) {
				const p = term.powers[j]
				if (typeof p === 'bigint') {
					if (p < 0n) {
						throw new RangeError(
							`field[${i}][${t}].powers[${j}] must be a non-negative integer`,
						)
					}
					normalizedPowers[j] = p
				} else if (typeof p === 'number') {
					if (!Number.isSafeInteger(p) || p < 0) {
						throw new RangeError(
							`field[${i}][${t}].powers[${j}] must be a non-negative safe integer`,
						)
					}
					normalizedPowers[j] = BigInt(p)
				} else {
					throw new TypeError(
						`field[${i}][${t}].powers[${j}] must be a number or BigInt`,
					)
				}
			}
			normalizedComponent[t] = {
				coeff: term.coeff,
				powers: normalizedPowers,
			}
		}
		normalizedField[i] = normalizedComponent
	}

	let divergence = 0n
	for (let i = 0; i < dim; i++) {
		const component = normalizedField[i]
		for (let t = 0; t < component.length; t++) {
			const { coeff, powers } = component[t]
			const pi = powers[i]
			if (coeff === 0n || pi === 0n) {
				continue
			}

			let termValue = coeff * pi
			for (let j = 0; j < dim; j++) {
				const exp = j === i ? pi - 1n : powers[j]
				if (exp === 0n) {
					continue
				}
				const base = point[j]
				if (base === 0n) {
					termValue = 0n
					break
				}
				termValue *= bigIntPow(base, exp)
			}
			divergence += termValue
		}
	}

	return divergence
}

/**
 * Exact BigInt exponentiation with polynomial convention 0n ** 0n === 1n
 * and fast paths for trivial bases.
 *
 * @param {bigint} base
 * @param {bigint} exp - Non-negative integer exponent.
 * @returns {bigint}
 */
function bigIntPow(base, exp) {
	if (exp === 0n) return 1n
	if (base === 0n) return 0n
	if (base === 1n) return 1n
	if (base === -1n) return (exp & 1n) === 0n ? 1n : -1n
	return base ** exp
}
