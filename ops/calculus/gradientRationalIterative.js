/**
 * Exact rational number representation in lowest terms.
 * @typedef {{ num: bigint, den: bigint }} Rational
 */

/**
 * Compute absolute value of a BigInt.
 * @param {bigint} value
 * @returns {bigint}
 */
function absBigInt(value) {
	return value < 0n ? -value : value
}

/**
 * Compute greatest common divisor of two BigInts using an iterative Euclidean algorithm.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
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
 * Validate and reduce a rational number `{ num: bigint, den: bigint }` to lowest terms
 * with a strictly positive denominator (`den > 0n`). Zero is normalized to `{ num: 0n, den: 1n }`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Rational}
 */
function normalizeRational(value, label) {
	if (value === null || typeof value !== 'object') {
		throw new TypeError(`${label} must be a rational object { num: bigint, den: bigint }`)
	}
	const { num, den } = /** @type {{ num?: unknown, den?: unknown }} */ (value)
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label} must have bigint num and den properties`)
	}
	if (den === 0n) {
		throw new RangeError(`${label} denominator must not be zero`)
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
 * Add two normalized rationals and return the sum in lowest terms.
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function addRational(a, b) {
	return normalizeRational(
		{ num: a.num * b.den + b.num * a.den, den: a.den * b.den },
		'sum',
	)
}

/**
 * Subtract two normalized rationals (`a - b`) and return the difference in lowest terms.
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function subRational(a, b) {
	return normalizeRational(
		{ num: a.num * b.den - b.num * a.den, den: a.den * b.den },
		'difference',
	)
}

/**
 * Divide two normalized rationals (`a / b`) and return the quotient in lowest terms.
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function divRational(a, b) {
	if (b.num === 0n) {
		throw new RangeError('Division by zero rational')
	}
	return normalizeRational(
		{ num: a.num * b.den, den: a.den * b.num },
		'quotient',
	)
}

/**
 * Compute the gradient of a scalar function `f(point)` at a rational `point`
 * using straightforward iterative central finite differences over exact rationals:
 *
 *   (∇f(x))_i = (f(x + h * e_i) - f(x - h * e_i)) / (2 * h)
 *
 * All arithmetic is performed exactly with `BigInt` rationals and every component
 * of the returned gradient is reduced to lowest terms with `den > 0n`.
 * For any affine or quadratic polynomial `f`, the central-difference gradient is
 * mathematically identical to the exact analytical gradient for every positive `h`.
 *
 * @param {(point: Rational[]) => Rational} f - Scalar function taking a rational vector and returning a rational.
 * @param {Rational[]} point - Evaluation point as an array of `{ num: bigint, den: bigint }`.
 * @param {Rational} [h={ num: 1n, den: 1000n }] - Strictly positive rational step size.
 * @returns {Rational[]} Gradient vector of `{ num: bigint, den: bigint }` in lowest terms.
 */
export function gradientRationalIterative(f, point, h = { num: 1n, den: 1000n }) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}
	if (!Array.isArray(point)) {
		throw new TypeError('point must be an array of rationals')
	}

	const step = normalizeRational(h, 'step size h')
	if (step.num <= 0n) {
		throw new RangeError('step size h must be strictly positive')
	}

	const dimension = point.length
	const basePoint = new Array(dimension)
	for (let i = 0; i < dimension; i += 1) {
		basePoint[i] = normalizeRational(point[i], `point[${i}]`)
	}

	const twoH = normalizeRational({ num: 2n * step.num, den: step.den }, '2 * h')
	const gradient = new Array(dimension)

	for (let i = 0; i < dimension; i += 1) {
		const plusPoint = basePoint.slice()
		plusPoint[i] = addRational(basePoint[i], step)

		const minusPoint = basePoint.slice()
		minusPoint[i] = subRational(basePoint[i], step)

		const fPlus = normalizeRational(f(plusPoint), `f(point + h * e_${i})`)
		const fMinus = normalizeRational(f(minusPoint), `f(point - h * e_${i})`)
		const diff = subRational(fPlus, fMinus)

		gradient[i] = divRational(diff, twoH)
	}

	return gradient
}
