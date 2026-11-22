/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 */

/**
 * @typedef {object} SqrtRationalOptions
 * @property {number} [iterations] - Maximum number of Heron (Newton-Raphson)
 *   iterations to perform for irrational square roots (positive safe integer).
 *   Defaults to `6` when `tolerance` is omitted, or `20` when `tolerance` is
 *   provided.
 * @property {Rational} [tolerance] - Optional strictly positive rational
 *   absolute error bound. When provided, iteration terminates as soon as
 *   `|x - sqrt(r)| <= tolerance`.
 */

const DEFAULT_ITERATIONS = 6
const DEFAULT_TOLERANCE_MAX_ITERATIONS = 20

/**
 * Computes the non-negative greatest common divisor of two BigInts using the
 * iterative Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcd(a, b) {
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
 * Validates that a value is a rational object `{ num: bigint, den: bigint }`
 * with a non-zero denominator and returns its canonical reduced form with
 * `den > 0n`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Rational}
 */
function validateAndReduceRational(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be an object with bigint num and den`)
	}
	const { num, den } = value
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label}.num and ${label}.den must be BigInts`)
	}
	if (den === 0n) {
		throw new RangeError(`${label}.den must not be zero`)
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
 * Computes the integer square root `floor(sqrt(n))` for a non-negative BigInt
 * using iterative Newton's method.
 *
 * @param {bigint} n
 * @returns {bigint}
 */
function isqrt(n) {
	if (n === 0n) {
		return 0n
	}
	if (n < 4n) {
		return 1n
	}
	const bitLength = n.toString(2).length
	let x0 = 1n << BigInt((bitLength + 1) >> 1)
	let x1 = (x0 + n / x0) >> 1n
	while (x1 < x0) {
		x0 = x1
		x1 = (x0 + n / x0) >> 1n
	}
	return x0
}

/**
 * Checks in exact rational arithmetic whether `|x - sqrt(r)| <= tol` for
 * strictly positive rationals `x`, `r`, and `tol`.
 *
 * Because `sqrt(r) > 0`, `x > 0`, and `tol > 0`:
 *   `|x - sqrt(r)| <= tol`
 *   `<=> (x <= tol || (x - tol)^2 <= r) && r <= (x + tol)^2`.
 *
 * @param {Rational} x
 * @param {Rational} r
 * @param {Rational} tol
 * @returns {boolean}
 */
function isWithinTolerance(x, r, tol) {
	const commonDen = x.den * tol.den
	const xScaled = x.num * tol.den
	const tolScaled = tol.num * x.den

	const sumNum = xScaled + tolScaled
	if (r.num * commonDen * commonDen > sumNum * sumNum * r.den) {
		return false
	}

	if (xScaled <= tolScaled) {
		return true
	}

	const diffNum = xScaled - tolScaled
	return diffNum * diffNum * r.den <= r.num * commonDen * commonDen
}

/**
 * Computes the principal square root of a non-negative exact rational number
 * represented as `{ num: BigInt, den: BigInt }` using an iterative algorithm.
 *
 * - Returns `{ num: 0n, den: 1n }` when the rational equals zero.
 * - Returns the exact reduced square root whenever both the reduced numerator
 *   and reduced denominator are perfect squares.
 * - Otherwise performs iterative Heron (Newton-Raphson) refinement starting
 *   from `isqrt(num) / isqrt(den)` until `iterations` steps have completed or
 *   the optional `tolerance` bound is satisfied.
 * - Always returns a rational in lowest terms with `den > 0n`.
 *
 * @param {Rational} rational - Non-negative rational `{ num: bigint, den: bigint }`.
 * @param {SqrtRationalOptions} [options] - Optional iteration/precision controls.
 * @returns {Rational} Reduced rational square root (exact when rational, otherwise
 *   iteratively approximated) with `den > 0n`.
 * @throws {TypeError} If `rational`, its fields, or `options` have invalid types.
 * @throws {RangeError} If `rational.den === 0n`, `rational` is negative,
 *   `iterations` is not a positive safe integer, or `tolerance` is not positive.
 */
export function sqrtRationalIterative(rational, options) {
	const reduced = validateAndReduceRational(rational, 'rational')
	if (reduced.num < 0n) {
		throw new RangeError('Cannot compute square root of a negative rational')
	}

	if (
		options !== undefined &&
		(options === null || typeof options !== 'object' || Array.isArray(options))
	) {
		throw new TypeError('options must be an object')
	}

	let tolerance = null
	if (options?.tolerance !== undefined) {
		tolerance = validateAndReduceRational(options.tolerance, 'options.tolerance')
		if (tolerance.num <= 0n) {
			throw new RangeError('options.tolerance must be strictly positive')
		}
	}

	let maxIterations =
		tolerance !== null ? DEFAULT_TOLERANCE_MAX_ITERATIONS : DEFAULT_ITERATIONS
	if (options?.iterations !== undefined) {
		if (typeof options.iterations !== 'number') {
			throw new TypeError('options.iterations must be a number')
		}
		if (!Number.isSafeInteger(options.iterations) || options.iterations < 1) {
			throw new RangeError('options.iterations must be a positive safe integer')
		}
		maxIterations = options.iterations
	}

	if (reduced.num === 0n) {
		return { num: 0n, den: 1n }
	}

	const { num: p, den: q } = reduced
	const sn = isqrt(p)
	const sd = isqrt(q)

	// Because gcd(p, q) === 1n, sqrt(p / q) is rational iff p and q are both
	// perfect squares, and gcd(sn, sd) === 1n is then guaranteed.
	if (sn * sn === p && sd * sd === q) {
		return { num: sn, den: sd }
	}

	const initGcd = gcd(sn, sd)
	let x = { num: sn / initGcd, den: sd / initGcd }

	if (tolerance !== null && isWithinTolerance(x, reduced, tolerance)) {
		return x
	}

	for (let i = 0; i < maxIterations; i++) {
		// Heron step: x_{k+1} = (x_k + (p/q) / x_k) / 2
		const nextNum = q * x.num * x.num + p * x.den * x.den
		const nextDen = 2n * q * x.num * x.den
		const g = gcd(nextNum, nextDen)
		x = { num: nextNum / g, den: nextDen / g }

		if (tolerance !== null && isWithinTolerance(x, reduced, tolerance)) {
			break
		}
	}

	return x
}
