/**
 * Computes the greatest common divisor of two BigInt values iteratively.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative GCD of |a| and |b|.
 */
function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const remainder = x % y
		x = y
		y = remainder
	}
	return x
}

/**
 * Constructs a canonical reduced rational `{ num: bigint, den: bigint }`
 * in lowest terms with `den > 0n` (and `{ num: 0n, den: 1n }` for zero).
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
function reduceRational(num, den) {
	if (den === 0n) {
		throw new RangeError('Rational denominator must be non-zero')
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	const sign = den < 0n ? -1n : 1n
	const signedNum = num * sign
	const positiveDen = den * sign
	const divisor = gcdBigInt(signedNum, positiveDen)
	return {
		num: signedNum / divisor,
		den: positiveDen / divisor,
	}
}

/**
 * Validates and normalizes an input rational object `{ num: bigint, den: bigint }`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {{ num: bigint, den: bigint }}
 */
function parseRational(value, label) {
	if (typeof value !== 'object' || value === null) {
		throw new TypeError(`${label} must be an object of shape { num: bigint, den: bigint }`)
	}
	const { num, den } = value
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label} must have BigInt num and den properties`)
	}
	if (den === 0n) {
		throw new RangeError(`${label} denominator must be non-zero`)
	}
	return reduceRational(num, den)
}

/**
 * Adds two exact rationals and returns the result in lowest terms.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function addRational(a, b) {
	return reduceRational(a.num * b.den + b.num * a.den, a.den * b.den)
}

/**
 * Subtracts rational `b` from `a` and returns the result in lowest terms.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function subRational(a, b) {
	return reduceRational(a.num * b.den - b.num * a.den, a.den * b.den)
}

/**
 * Divides rational `a` by non-zero rational `b` and returns the result in lowest terms.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function divRational(a, b) {
	if (b.num === 0n) {
		throw new RangeError('Division by zero rational')
	}
	return reduceRational(a.num * b.den, a.den * b.num)
}

/**
 * Evaluates a vector field at a rational point and validates the returned rational vector.
 *
 * @param {(point: Array<{ num: bigint, den: bigint }>) => Array<{ num: bigint, den: bigint }>} field
 * @param {Array<{ num: bigint, den: bigint }>} point
 * @param {number} dim
 * @returns {Array<{ num: bigint, den: bigint }>}
 */
function evaluateField(field, point, dim) {
	const result = field(point)
	if (!Array.isArray(result)) {
		throw new TypeError('Vector field must return an array of rationals')
	}
	if (result.length !== dim) {
		throw new RangeError(
			`Vector field output dimension (${result.length}) must match point dimension (${dim})`,
		)
	}
	const normalized = new Array(dim)
	for (let i = 0; i < dim; i++) {
		normalized[i] = parseRational(result[i], `field(point)[${i}]`)
	}
	return normalized
}

/**
 * Computes the divergence (∑_i ∂F_i/∂x_i) of a rational vector field `F` at `point`
 * over exact rationals `{ num: bigint, den: bigint }` in lowest terms, using a
 * straightforward iterative central-difference implementation:
 *
 *   div(F)(x) = ∑_{i=0}^{n-1} (F_i(x + h·e_i) - F_i(x - h·e_i)) / (2h)
 *
 * Exact for all polynomial vector fields of degree <= 2 along each coordinate axis,
 * and O(h^2)-accurate over exact rationals for general rational vector fields.
 *
 * @param {(point: Array<{ num: bigint, den: bigint }>) => Array<{ num: bigint, den: bigint }>} field
 *   Vector field mapping an n-dimensional rational point to an n-dimensional rational vector.
 * @param {Array<{ num: bigint, den: bigint }>} point
 *   Non-empty array of exact rationals representing the evaluation point.
 * @param {{ num: bigint, den: bigint }} [h={ num: 1n, den: 1000n }]
 *   Strictly positive rational step size used for central differences.
 * @returns {{ num: bigint, den: bigint }}
 *   Exact rational divergence in canonical lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`).
 */
export function divergenceRationalIterative(field, point, h = { num: 1n, den: 1000n }) {
	if (typeof field !== 'function') {
		throw new TypeError('field must be a function')
	}
	if (!Array.isArray(point)) {
		throw new TypeError('point must be an array of rationals')
	}
	const dim = point.length
	if (dim === 0) {
		throw new RangeError('point must be a non-empty array')
	}

	const basePoint = new Array(dim)
	for (let i = 0; i < dim; i++) {
		basePoint[i] = parseRational(point[i], `point[${i}]`)
	}

	const step = parseRational(h, 'h')
	if (step.num <= 0n) {
		throw new RangeError('Step size h must be strictly positive')
	}

	const twoH = reduceRational(step.num * 2n, step.den)
	let total = { num: 0n, den: 1n }

	for (let i = 0; i < dim; i++) {
		const plusPoint = basePoint.slice()
		plusPoint[i] = addRational(basePoint[i], step)
		const fPlus = evaluateField(field, plusPoint, dim)

		const minusPoint = basePoint.slice()
		minusPoint[i] = subRational(basePoint[i], step)
		const fMinus = evaluateField(field, minusPoint, dim)

		const diff = subRational(fPlus[i], fMinus[i])
		const partial = divRational(diff, twoH)
		total = addRational(total, partial)
	}

	return total
}
