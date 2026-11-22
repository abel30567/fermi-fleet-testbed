/**
 * Compute the exact gradient vector of a multivariate polynomial scalar field
 * `f(x_0, ..., x_{d-1})` at a rational point over exact rationals
 * `{ num: BigInt, den: BigInt }` in lowest terms, using a straightforward
 * iterative algorithm.
 *
 * A multivariate polynomial is represented as an array of terms:
 * `[{ coeff: { num: BigInt, den: BigInt }, powers: [p_0, ..., p_{d-1}] }, ...]`
 * where each `p_j` is a non-negative integer (`number` or `bigint`), representing
 * `sum_t coeff_t * prod_k x_k^(p_{t,k})`.
 *
 * For each coordinate `j = 0 .. d - 1`, the partial derivative `df / dx_j` is
 * computed iteratively by summing
 * `coeff * p_j * prod_k (point[k] ^ (p_k - (k === j ? 1 : 0)))`
 * over all terms with `p_j > 0`, using the polynomial convention `0^0 = 1`.
 *
 * @typedef {{ num: bigint, den: bigint }} Rational
 * @typedef {{ coeff: Rational, powers: Array<number | bigint> }} PolynomialTerm
 *
 * @param {PolynomialTerm[]} terms - Array of polynomial terms (empty array represents the zero polynomial).
 * @param {Rational[]} point - Non-empty array of `d` exact rationals representing the evaluation point.
 * @returns {Rational[]} Array of `d` reduced exact rationals (`den > 0n`, `{ num: 0n, den: 1n }` for zero).
 * @throws {TypeError} If `terms`, `point`, term objects, rationals, or power elements have invalid types.
 * @throws {RangeError} If `point` is empty, a rational denominator is `0n`, term power dimensions do not match `point.length`, or any exponent is negative, non-integer, or an unsafe number.
 */
export function gradientRationalIterative(terms, point) {
	if (!Array.isArray(terms)) {
		throw new TypeError('terms must be an array')
	}
	if (!Array.isArray(point)) {
		throw new TypeError('point must be an array')
	}
	if (point.length === 0) {
		throw new RangeError('point must be a non-empty array of rationals')
	}

	const dim = point.length
	const normalizedPoint = new Array(dim)
	for (let k = 0; k < dim; k++) {
		normalizedPoint[k] = validateAndNormalizeRational(point[k], `point[${k}]`)
	}

	const normalizedTerms = new Array(terms.length)
	for (let t = 0; t < terms.length; t++) {
		const term = terms[t]
		if (typeof term !== 'object' || term === null || Array.isArray(term)) {
			throw new TypeError(`terms[${t}] must be a non-null object`)
		}

		const coeff = validateAndNormalizeRational(term.coeff, `terms[${t}].coeff`)

		if (!Array.isArray(term.powers)) {
			throw new TypeError(`terms[${t}].powers must be an array`)
		}
		if (term.powers.length !== dim) {
			throw new RangeError(
				`terms[${t}].powers length (${term.powers.length}) must match point dimension (${dim})`
			)
		}

		const powers = new Array(dim)
		for (let k = 0; k < dim; k++) {
			powers[k] = validatePower(term.powers[k], `terms[${t}].powers[${k}]`)
		}

		normalizedTerms[t] = { coeff, powers }
	}

	const gradient = new Array(dim)
	for (let j = 0; j < dim; j++) {
		let acc = { num: 0n, den: 1n }

		for (let t = 0; t < normalizedTerms.length; t++) {
			const { coeff, powers } = normalizedTerms[t]
			const pj = powers[j]

			if (coeff.num === 0n || pj === 0n) {
				continue
			}

			let termVal = ratMul(coeff, { num: pj, den: 1n })

			for (let k = 0; k < dim; k++) {
				const exp = k === j ? pj - 1n : powers[k]
				if (exp === 0n) {
					continue
				}
				if (normalizedPoint[k].num === 0n) {
					termVal = { num: 0n, den: 1n }
					break
				}
				const factor = ratPow(normalizedPoint[k], exp)
				termVal = ratMul(termVal, factor)
			}

			if (termVal.num !== 0n) {
				acc = ratAdd(acc, termVal)
			}
		}

		gradient[j] = acc
	}

	return gradient
}

/**
 * Validate and normalize a rational `{ num: BigInt, den: BigInt }` to lowest terms with `den > 0n`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Rational}
 */
function validateAndNormalizeRational(value, label) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${label} must be a rational object { num: bigint, den: bigint }`)
	}
	if (typeof value.num !== 'bigint' || typeof value.den !== 'bigint') {
		throw new TypeError(`${label} must have bigint num and den properties`)
	}
	if (value.den === 0n) {
		throw new RangeError(`${label}.den must not be 0n`)
	}
	return reduce(value.num, value.den)
}

/**
 * Validate a polynomial exponent and convert it to a non-negative BigInt.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {bigint}
 */
function validatePower(value, label) {
	if (typeof value === 'bigint') {
		if (value < 0n) {
			throw new RangeError(`${label} must be a non-negative integer`)
		}
		return value
	}
	if (typeof value === 'number') {
		if (!Number.isSafeInteger(value) || value < 0) {
			throw new RangeError(`${label} must be a non-negative safe integer`)
		}
		return BigInt(value)
	}
	throw new TypeError(`${label} must be a non-negative integer (number or bigint)`)
}

/**
 * Iterative Euclidean GCD on BigInts.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const rem = x % y
		x = y
		y = rem
	}
	return x
}

/**
 * Reduce `num / den` to lowest terms with `den > 0n` (and `0n / 1n` for zero).
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function reduce(num, den) {
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
 * Add two normalized rationals.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function ratAdd(a, b) {
	if (a.num === 0n) {
		return { num: b.num, den: b.den }
	}
	if (b.num === 0n) {
		return { num: a.num, den: a.den }
	}
	const g = gcd(a.den, b.den)
	const aDenReduced = a.den / g
	const bDenReduced = b.den / g
	const num = a.num * bDenReduced + b.num * aDenReduced
	const den = aDenReduced * b.den
	return reduce(num, den)
}

/**
 * Multiply two normalized rationals with cross-cancellation.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function ratMul(a, b) {
	if (a.num === 0n || b.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const g1 = gcd(a.num, b.den)
	const g2 = gcd(b.num, a.den)
	return {
		num: (a.num / g1) * (b.num / g2),
		den: (a.den / g2) * (b.den / g1),
	}
}

/**
 * Iterative exponentiation of a BigInt by a non-negative BigInt exponent.
 *
 * @param {bigint} base
 * @param {bigint} exp
 * @returns {bigint}
 */
function bigintPow(base, exp) {
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
 * Raise a normalized rational to a non-negative BigInt exponent (with `0^0 = 1`).
 *
 * @param {Rational} base
 * @param {bigint} exp
 * @returns {Rational}
 */
function ratPow(base, exp) {
	if (exp === 0n) {
		return { num: 1n, den: 1n }
	}
	if (base.num === 0n) {
		return { num: 0n, den: 1n }
	}
	return {
		num: bigintPow(base.num, exp),
		den: bigintPow(base.den, exp),
	}
}
