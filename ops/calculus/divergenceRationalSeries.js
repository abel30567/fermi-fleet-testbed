/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 * Exact rational number `num / den`. Outputs are always normalized so that
 * `den > 0n`, `gcd(|num|, den) === 1n`, and zero is `{ num: 0n, den: 1n }`.
 */

/**
 * @typedef {{ coeff: Rational, powers: number[] }} PolynomialTerm
 * A single multivariate monomial `coeff * prod_j (x_j ^ powers[j])`.
 */

/**
 * @param {bigint} value
 * @returns {bigint}
 */
function absBigInt(value) {
	return value < 0n ? -value : value
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
		const r = x % y
		x = y
		y = r
	}
	return x
}

/**
 * Normalizes a rational fraction into lowest terms with positive denominator.
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function normalizeRational(num, den) {
	if (den === 0n) {
		throw new RangeError('Rational denominator must be non-zero')
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	const sign = den < 0n ? -1n : 1n
	const signedNum = num * sign
	const posDen = den * sign
	const divisor = gcdBigInt(absBigInt(signedNum), posDen)
	return {
		num: signedNum / divisor,
		den: posDen / divisor,
	}
}

/**
 * Validates and normalizes an input Rational value.
 * @param {unknown} value
 * @param {string} label
 * @returns {Rational}
 */
function parseRational(value, label) {
	if (value === null || typeof value !== 'object') {
		throw new TypeError(`${label} must be a Rational object { num: bigint, den: bigint }`)
	}
	const { num, den } = /** @type {{ num: unknown, den: unknown }} */ (value)
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label} must have bigint num and den properties`)
	}
	if (den === 0n) {
		throw new RangeError(`${label} denominator must not be 0n`)
	}
	return normalizeRational(num, den)
}

/**
 * Adds two normalized rationals and returns the normalized sum.
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function addRational(a, b) {
	if (a.num === 0n) return b
	if (b.num === 0n) return a
	return normalizeRational(a.num * b.den + b.num * a.den, a.den * b.den)
}

/**
 * Multiplies two normalized rationals and returns the normalized product.
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function mulRational(a, b) {
	if (a.num === 0n || b.num === 0n) {
		return { num: 0n, den: 1n }
	}
	return normalizeRational(a.num * b.num, a.den * b.den)
}

/**
 * Raises a normalized rational to a non-negative integer power, using 0^0 = 1.
 * @param {Rational} base
 * @param {number} exp
 * @returns {Rational}
 */
function powRational(base, exp) {
	if (exp === 0) {
		return { num: 1n, den: 1n }
	}
	if (base.num === 0n) {
		return { num: 0n, den: 1n }
	}
	if (exp === 1) {
		return base
	}
	const e = BigInt(exp)
	// Because gcd(|base.num|, base.den) === 1n and base.den > 0n,
	// powers remain coprime with positive denominator.
	return {
		num: base.num ** e,
		den: base.den ** e,
	}
}

/**
 * Computes the exact divergence `sum_i (dF_i / dx_i)` of a multivariate
 * polynomial vector field `F = [F_0, ..., F_{d-1}]` evaluated at an exact
 * rational point `point = [x_0, ..., x_{d-1}]`.
 *
 * Each component `F_i` is an array of polynomial terms `{ coeff, powers }`
 * representing `coeff * prod_{j=0}^{d-1} x_j^{powers[j]}`. The derivative of
 * each term with respect to `x_i` is computed symbolically in closed form and
 * summed in exact rational arithmetic.
 *
 * @param {PolynomialTerm[][]} field - Non-empty array of polynomial components `[F_0, ..., F_{d-1}]`.
 * @param {Rational[]} point - Evaluation coordinates `[x_0, ..., x_{d-1}]` with `point.length === field.length`.
 * @returns {Rational} Exact divergence in lowest terms `{ num: bigint, den: bigint }` with `den > 0n`.
 * @throws {TypeError} If `field`, `point`, components, terms, powers, or rationals have invalid types.
 * @throws {RangeError} If `field` is empty, dimensions mismatch, denominators are zero, or exponents are negative/non-integer.
 */
export function divergenceRationalSeries(field, point) {
	if (!Array.isArray(field)) {
		throw new TypeError('field must be an array of polynomial components')
	}
	if (field.length === 0) {
		throw new RangeError('field must contain at least one component')
	}
	if (!Array.isArray(point)) {
		throw new TypeError('point must be an array of Rational coordinates')
	}

	const dim = field.length
	if (point.length !== dim) {
		throw new RangeError(`point length (${point.length}) must match field dimension (${dim})`)
	}

	/** @type {Rational[]} */
	const coords = new Array(dim)
	for (let j = 0; j < dim; j++) {
		coords[j] = parseRational(point[j], `point[${j}]`)
	}

	/** @type {{ coeff: Rational, powers: number[] }[][]} */
	const validatedField = new Array(dim)
	for (let i = 0; i < dim; i++) {
		const component = field[i]
		if (!Array.isArray(component)) {
			throw new TypeError(`field[${i}] must be an array of polynomial terms`)
		}
		const parsedTerms = new Array(component.length)
		for (let t = 0; t < component.length; t++) {
			const term = component[t]
			if (term === null || typeof term !== 'object') {
				throw new TypeError(`field[${i}][${t}] must be a term object { coeff, powers }`)
			}
			const coeff = parseRational(term.coeff, `field[${i}][${t}].coeff`)
			if (!Array.isArray(term.powers)) {
				throw new TypeError(`field[${i}][${t}].powers must be an array of non-negative integers`)
			}
			if (term.powers.length !== dim) {
				throw new RangeError(
					`field[${i}][${t}].powers length (${term.powers.length}) must match field dimension (${dim})`,
				)
			}
			for (let j = 0; j < dim; j++) {
				const p = term.powers[j]
				if (typeof p !== 'number') {
					throw new TypeError(`field[${i}][${t}].powers[${j}] must be a number`)
				}
				if (!Number.isSafeInteger(p) || p < 0) {
					throw new RangeError(
						`field[${i}][${t}].powers[${j}] must be a non-negative safe integer`,
					)
				}
			}
			parsedTerms[t] = { coeff, powers: term.powers }
		}
		validatedField[i] = parsedTerms
	}

	/** @type {Rational} */
	let total = { num: 0n, den: 1n }

	for (let i = 0; i < dim; i++) {
		const terms = validatedField[i]
		for (let t = 0; t < terms.length; t++) {
			const { coeff, powers } = terms[t]
			const pi = powers[i]
			if (pi === 0 || coeff.num === 0n) {
				continue
			}

			// Differentiate term with respect to x_i: coeff * pi * x_i^(pi - 1) * prod_{j != i} x_j^(powers[j])
			let termValue = mulRational(coeff, { num: BigInt(pi), den: 1n })
			let vanishes = false

			for (let j = 0; j < dim; j++) {
				const exp = j === i ? pi - 1 : powers[j]
				if (exp === 0) {
					continue
				}
				if (coords[j].num === 0n) {
					vanishes = true
					break
				}
				termValue = mulRational(termValue, powRational(coords[j], exp))
			}

			if (!vanishes) {
				total = addRational(total, termValue)
			}
		}
	}

	return normalizeRational(total.num, total.den)
}
