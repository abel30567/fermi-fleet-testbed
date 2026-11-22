/**
 * @typedef {object} Rational
 * @property {bigint} num - The numerator as a BigInt.
 * @property {bigint} den - The denominator as a non-zero BigInt.
 */

/**
 * @typedef {object} NthRootOptions
 * @property {Rational} [tolerance={ num: 1n, den: 1000000000000000000n }] - Maximum
 *   allowed absolute error |result - rational^(1/n)| for irrational roots. Must be a
 *   strictly positive rational.
 * @property {number} [maxIterations=1000] - Maximum number of Newton iterations to
 *   perform when approximating a non-perfect nth root. Must be a positive safe integer.
 */

const DEFAULT_TOLERANCE = Object.freeze({ num: 1n, den: 10n ** 18n })
const DEFAULT_MAX_ITERATIONS = 1000

/**
 * Computes the greatest common divisor of two BigInt values using the iterative
 * Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative GCD.
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
 * Normalizes a rational number to lowest terms with a strictly positive denominator.
 *
 * @param {bigint} num
 * @param {bigint} den - Must be non-zero.
 * @returns {Rational}
 */
function normalizeRational(num, den) {
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const divisor = gcdBigInt(n, d)
	return { num: n / divisor, den: d / divisor }
}

/**
 * Validates that a value is a well-formed rational `{ num: bigint, den: bigint }`
 * with `den !== 0n`, and returns its normalized form.
 *
 * @param {unknown} value
 * @param {string} name - Parameter name for error messages.
 * @returns {Rational}
 */
function validateRational(value, name) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${name} must be an object with { num: bigint, den: bigint }`)
	}
	const { num, den } = /** @type {{ num: unknown, den: unknown }} */ (value)
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${name}.num and ${name}.den must both be BigInt values`)
	}
	if (den === 0n) {
		throw new RangeError(`${name}.den must not be zero`)
	}
	return normalizeRational(num, den)
}

/**
 * Validates the root degree `n`, accepting a positive safe integer number or BigInt.
 *
 * @param {unknown} n
 * @returns {bigint}
 */
function validateDegree(n) {
	if (typeof n === 'bigint') {
		if (n < 1n) {
			throw new RangeError('Root degree n must be a positive integer >= 1')
		}
		return n
	}
	if (typeof n === 'number') {
		if (!Number.isSafeInteger(n) || n < 1) {
			throw new RangeError('Root degree n must be a positive safe integer >= 1')
		}
		return BigInt(n)
	}
	throw new TypeError('Root degree n must be a positive integer (number or BigInt)')
}

/**
 * Validates the optional options object.
 *
 * @param {unknown} options
 * @returns {{ tolerance: Rational, maxIterations: number }}
 */
function validateOptions(options) {
	if (options === undefined) {
		return { tolerance: DEFAULT_TOLERANCE, maxIterations: DEFAULT_MAX_ITERATIONS }
	}
	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be a plain object')
	}

	const opts = /** @type {{ tolerance?: unknown, maxIterations?: unknown }} */ (options)

	let tolerance = DEFAULT_TOLERANCE
	if (opts.tolerance !== undefined) {
		tolerance = validateRational(opts.tolerance, 'options.tolerance')
		if (tolerance.num <= 0n) {
			throw new RangeError('options.tolerance must be strictly positive')
		}
	}

	let maxIterations = DEFAULT_MAX_ITERATIONS
	if (opts.maxIterations !== undefined) {
		if (typeof opts.maxIterations !== 'number') {
			throw new TypeError('options.maxIterations must be a positive safe integer')
		}
		if (!Number.isSafeInteger(opts.maxIterations) || opts.maxIterations < 1) {
			throw new RangeError('options.maxIterations must be a positive safe integer')
		}
		maxIterations = opts.maxIterations
	}

	return { tolerance, maxIterations }
}

/**
 * Computes the integer floor of `value^(1/n)` using iterative Newton's method.
 * Starting from an upper bound `2^ceil(bitLength(value) / n)`, the sequence
 * strictly decreases until convergence at `floor(value^(1/n))`.
 *
 * @param {bigint} value - Non-negative integer.
 * @param {bigint} n - Positive integer root degree >= 1.
 * @param {number} [maxIterations=Infinity] - Maximum number of Newton iterations.
 * @returns {{ root: bigint, converged: boolean }}
 */
function integerNthRoot(value, n, maxIterations = Infinity) {
	if (value === 0n) {
		return { root: 0n, converged: true }
	}
	if (n === 1n || value === 1n) {
		return { root: value, converged: true }
	}

	const bitLength = BigInt(value.toString(2).length)
	if (bitLength <= n) {
		return { root: 1n, converged: true }
	}

	const nMinus1 = n - 1n
	const shift = (bitLength + nMinus1) / n
	let x = 1n << shift

	for (let iter = 0; iter < maxIterations; iter += 1) {
		const xPow = x ** nMinus1
		const xNext = (nMinus1 * x + value / xPow) / n
		if (xNext >= x) {
			return { root: x, converged: true }
		}
		x = xNext
	}

	return { root: x, converged: false }
}

/**
 * Computes the real `n`-th root of an exact rational number `{ num: BigInt, den: BigInt }`
 * using a straightforward iterative Newton's method.
 *
 * - Normalizes the input rational and always returns a rational in lowest terms with `den > 0n`.
 * - Supports any positive integer degree `n >= 1` (as a safe integer `number` or `bigint`).
 * - Throws a `RangeError` for even roots of negative rationals.
 * - Returns the exact rational root whenever the input is a perfect `n`-th power.
 * - Otherwise computes a scaled iterative Newton approximation rounded to the nearest
 *   grid point within `options.tolerance` (default `10^-18`).
 *
 * @param {Rational} rational - Input rational number `{ num: bigint, den: bigint }` with `den !== 0n`.
 * @param {number | bigint} n - Positive integer root degree (`n >= 1`).
 * @param {NthRootOptions} [options] - Optional approximation controls (`tolerance`, `maxIterations`).
 * @returns {Rational} The `n`-th root in lowest terms with `den > 0n`.
 * @throws {TypeError} If `rational`, `n`, or `options` have invalid types.
 * @throws {RangeError} If `rational.den === 0n`, `n < 1`, `n` is non-integer/unsafe,
 *   `rational < 0` with even `n`, or `options` values are out of range.
 */
export function nthRootRationalIterative(rational, n, options) {
	const normalized = validateRational(rational, 'rational')
	const rootDegree = validateDegree(n)
	const { tolerance, maxIterations } = validateOptions(options)

	if (rootDegree === 1n || normalized.num === 0n) {
		return normalized
	}

	const isNegative = normalized.num < 0n
	if (isNegative && rootDegree % 2n === 0n) {
		throw new RangeError('Cannot compute an even root of a negative rational number')
	}

	const sign = isNegative ? -1n : 1n
	const absNum = isNegative ? -normalized.num : normalized.num
	const den = normalized.den

	if (absNum === 1n && den === 1n) {
		return { num: sign, den: 1n }
	}

	// Exact rational root check: since gcd(absNum, den) === 1, absNum/den is a
	// perfect nth power iff both absNum and den are perfect nth powers.
	const { root: numRoot } = integerNthRoot(absNum, rootDegree)
	if (numRoot ** rootDegree === absNum) {
		const { root: denRoot } = integerNthRoot(den, rootDegree)
		if (denRoot ** rootDegree === den) {
			return { num: sign * numRoot, den: denRoot }
		}
	}

	// Irrational root: compute scaled iterative Newton approximation with scale >= 1 / tolerance.
	const scale = (tolerance.den + tolerance.num - 1n) / tolerance.num
	const scaledNum = absNum * scale ** rootDegree
	const scaledFloor = scaledNum / den

	const { root: k, converged } = integerNthRoot(scaledFloor, rootDegree, maxIterations)

	let bestK = k
	if (converged) {
		// Choose the closer of k/scale and (k+1)/scale by comparing (p/q) against ((2k+1)/(2*scale))^n.
		const midpointLhs = (2n * k + 1n) ** rootDegree * den
		const midpointRhs = scaledNum << rootDegree
		if (midpointLhs <= midpointRhs) {
			bestK = k + 1n
		}
	}

	return normalizeRational(sign * bestK, scale)
}
