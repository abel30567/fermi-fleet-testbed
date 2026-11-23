/**
 * Default relative-error tolerance (`1 / 10^18`) for iterative rational square root.
 * @type {{ num: bigint, den: bigint }}
 */
const DEFAULT_TOLERANCE = Object.freeze({ num: 1n, den: 10n ** 18n })

/**
 * Computes the greatest common divisor of two BigInts using the iterative
 * Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative greatest common divisor.
 */
function gcdBigInt(a, b) {
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
 * Normalizes a rational number `num / den` into lowest terms with a positive
 * denominator.
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
	const g = gcdBigInt(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Validates and normalizes a `{ num: bigint, den: bigint }` rational input.
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {{ num: bigint, den: bigint }}
 */
function validateRational(value, name) {
	if (
		value === null ||
		typeof value !== 'object' ||
		Array.isArray(value)
	) {
		throw new TypeError(`${name} must be an object with bigint num and den properties`)
	}
	const { num, den } = value
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${name}.num and ${name}.den must both be BigInt values`)
	}
	if (den === 0n) {
		throw new RangeError(`${name}.den must not be zero`)
	}
	return normalizeRational(num, den)
}

/**
 * Computes the floor integer square root `floor(sqrt(n))` for a non-negative
 * BigInt using iterative integer Newton's method.
 *
 * @param {bigint} n - Non-negative integer.
 * @returns {bigint} Largest integer `k` such that `k * k <= n`.
 */
function isqrtBigInt(n) {
	if (n < 2n) {
		return n
	}
	const bitLen = BigInt(n.toString(2).length)
	let x = 1n << ((bitLen + 1n) >> 1n)
	while (true) {
		const next = (x + n / x) >> 1n
		if (next >= x) {
			return x
		}
		x = next
	}
}

/**
 * Validates optional convergence settings.
 *
 * @param {unknown} options
 * @returns {{ tolerance: { num: bigint, den: bigint } | null, iterations: number | null }}
 */
function validateOptions(options) {
	if (options === undefined) {
		return { tolerance: DEFAULT_TOLERANCE, iterations: null }
	}
	if (
		options === null ||
		typeof options !== 'object' ||
		Array.isArray(options)
	) {
		throw new TypeError('options must be a plain object when provided')
	}

	const hasTolerance = options.tolerance !== undefined
	const hasIterations = options.iterations !== undefined

	let tolerance = null
	if (hasTolerance) {
		tolerance = validateRational(options.tolerance, 'options.tolerance')
		if (tolerance.num <= 0n) {
			throw new RangeError('options.tolerance must be strictly positive')
		}
	}

	let iterations = null
	if (hasIterations) {
		if (typeof options.iterations !== 'number') {
			throw new TypeError('options.iterations must be a non-negative safe integer')
		}
		if (!Number.isSafeInteger(options.iterations) || options.iterations < 0) {
			throw new RangeError('options.iterations must be a non-negative safe integer')
		}
		iterations = options.iterations
	}

	if (!hasTolerance && !hasIterations) {
		tolerance = DEFAULT_TOLERANCE
	}

	return { tolerance, iterations }
}

/**
 * Computes the square root of a non-negative exact rational number
 * `{ num: BigInt, den: BigInt }` in lowest terms using a straightforward
 * iterative Babylonian (Heron / Newton-Raphson) method.
 *
 * - Normalizes the input rational to lowest terms with a positive denominator.
 * - Returns `{ num: 0n, den: 1n }` when the input is zero.
 * - Returns the exact reduced rational square root whenever the reduced
 *   numerator and denominator are both perfect squares.
 * - For non-square positive rationals, starts from the reduced integer-root
 *   estimate `floor(sqrt(num)) / floor(sqrt(den))` (guaranteed within a factor
 *   of 2 of the true root) and iterates `x_{k+1} = (x_k + r / x_k) / 2` in
 *   exact reduced rational arithmetic until the relative error meets
 *   `tolerance` (`|x - sqrt(r)| / sqrt(r) <= tolerance`, default `1 / 10^18`)
 *   and/or `iterations` steps have completed.
 *
 * @param {{ num: bigint, den: bigint }} r - Non-negative rational number.
 * @param {object} [options] - Optional convergence configuration.
 * @param {{ num: bigint, den: bigint }} [options.tolerance] - Positive rational
 *   relative-error bound (defaults to `{ num: 1n, den: 10n ** 18n }` when
 *   neither `tolerance` nor `iterations` is specified).
 * @param {number} [options.iterations] - Non-negative safe integer number of
 *   Heron iterations to run (upper bound when combined with `tolerance`).
 * @returns {{ num: bigint, den: bigint }} Square root as a normalized rational
 *   `{ num, den }` in lowest terms with `den > 0n`.
 * @throws {TypeError} If `r` or `options` (or their properties) have invalid types.
 * @throws {RangeError} If `r` is negative, has zero denominator, or option
 *   values are out of range.
 */
export function sqrtRationalIterative(r, options) {
	const { num: p, den: q } = validateRational(r, 'r')
	const { tolerance, iterations } = validateOptions(options)

	if (p < 0n) {
		throw new RangeError('Cannot compute real square root of a negative rational')
	}
	if (p === 0n) {
		return { num: 0n, den: 1n }
	}

	const ip = isqrtBigInt(p)
	const iq = isqrtBigInt(q)

	// Exact rational square: since gcd(p, q) === 1, gcd(ip, iq) === 1 already.
	if (ip * ip === p && iq * iq === q) {
		return { num: ip, den: iq }
	}

	let x = normalizeRational(ip, iq)
	if (iterations === 0) {
		return x
	}

	// Precompute (1 + tol)^2 = (tol.den + tol.num)^2 / tol.den^2 for exact
	// relative-error checks after Heron steps (where x > sqrt(r) by AM-GM).
	let tolSumSq = 0n
	let tolDenSq = 0n
	if (tolerance !== null) {
		const tolSum = tolerance.den + tolerance.num
		tolSumSq = tolSum * tolSum
		tolDenSq = tolerance.den * tolerance.den
	}

	let step = 0
	while (true) {
		// Heron step: x_{k+1} = (x_k + r / x_k) / 2 = (a^2 * q + p * b^2) / (2 * a * b * q)
		const a = x.num
		const b = x.den
		const nextNum = a * a * q + p * b * b
		const nextDen = 2n * a * b * q
		x = normalizeRational(nextNum, nextDen)
		step += 1

		// Exact hit (defensive; non-square rationals cannot hit exactly)
		if (x.num * x.num * q === p * x.den * x.den) {
			return x
		}

		// After >= 1 Heron step, x > sqrt(r), so:
		// (x - sqrt(r)) / sqrt(r) <= tol  <=>  x^2 <= (1 + tol)^2 * r
		if (tolerance !== null) {
			const lhs = x.num * x.num * tolDenSq * q
			const rhs = x.den * x.den * tolSumSq * p
			if (lhs <= rhs) {
				return x
			}
		}

		if (iterations !== null && step >= iterations) {
			return x
		}
	}
}
