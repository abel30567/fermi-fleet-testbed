/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 */

/**
 * @typedef {object} MagnitudeOptions
 * @property {number} [iterations] - Maximum number of Heron/Newton-Raphson iterations
 *   for non-perfect-square norms (non-negative integer; defaults to 10, or 20 when
 *   tolerance is provided without an explicit iteration count).
 * @property {Rational} [tolerance] - Optional strictly positive exact rational error
 *   tolerance; iteration stops early once |approx - sqrt(sumSq)| <= tolerance.
 */

/**
 * Compute the non-negative greatest common divisor of two BigInts iteratively.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function bigIntGcd(a, b) {
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
 * Compute the exact integer square root floor(sqrt(n)) for a non-negative BigInt
 * using iterative Newton's method.
 *
 * @param {bigint} n
 * @returns {bigint}
 */
function bigIntSqrt(n) {
	if (n < 0n) {
		throw new RangeError('Cannot compute integer square root of a negative BigInt')
	}
	if (n < 2n) {
		return n
	}
	const bitLength = n.toString(2).length
	let x = 1n << BigInt(Math.floor((bitLength + 1) / 2))
	while (true) {
		const next = (x + n / x) >> 1n
		if (next >= x) {
			return x
		}
		x = next
	}
}

/**
 * Reduce a rational number num / den to lowest terms with den > 0n (and 0n / 1n for zero).
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function reduceRational(num, den) {
	if (den === 0n) {
		throw new RangeError('Rational denominator must be non-zero')
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
	const g = bigIntGcd(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Validate and normalize an exact rational input object.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Rational}
 */
function validateRational(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be an object with BigInt num and den properties`)
	}
	if (typeof value.num !== 'bigint' || typeof value.den !== 'bigint') {
		throw new TypeError(`${label}.num and ${label}.den must be BigInt values`)
	}
	if (value.den === 0n) {
		throw new RangeError(`${label}.den must be non-zero`)
	}
	return reduceRational(value.num, value.den)
}

/**
 * Add two reduced rational numbers and return the reduced sum.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function addRationals(a, b) {
	if (a.num === 0n) {
		return b
	}
	if (b.num === 0n) {
		return a
	}
	const g = bigIntGcd(a.den, b.den)
	const aDenReduced = a.den / g
	const bDenReduced = b.den / g
	const num = a.num * bDenReduced + b.num * aDenReduced
	const den = aDenReduced * b.den
	return reduceRational(num, den)
}

/**
 * Check whether |x - sqrt(sumSq)| <= tolerance using exact rational arithmetic.
 * Requires x > 0, sumSq > 0, tolerance > 0.
 *
 * @param {Rational} x
 * @param {Rational} sumSq
 * @param {Rational} tolerance
 * @returns {boolean}
 */
function isWithinTolerance(x, sumSq, tolerance) {
	const xSqLeft = x.num * x.num * sumSq.den
	const xSqRight = sumSq.num * x.den * x.den

	if (xSqLeft >= xSqRight) {
		// x >= sqrt(sumSq): check x - tolerance <= sqrt(sumSq)
		const diffNum = x.num * tolerance.den - tolerance.num * x.den
		if (diffNum <= 0n) {
			return true
		}
		const diffDen = x.den * tolerance.den
		return diffNum * diffNum * sumSq.den <= sumSq.num * diffDen * diffDen
	}

	// x < sqrt(sumSq): check sqrt(sumSq) <= x + tolerance
	const sumNum = x.num * tolerance.den + tolerance.num * x.den
	const sumDen = x.den * tolerance.den
	return sumSq.num * sumDen * sumDen <= sumNum * sumNum * sumSq.den
}

/**
 * Compute the Euclidean magnitude (L2 norm) of a vector over exact rationals
 * `{ num: BigInt, den: BigInt }` in lowest terms, using an iterative approach.
 *
 * Accumulates `sumSq = sum(v_i^2)` in exact reduced rationals. If `sumSq` is zero,
 * returns `{ num: 0n, den: 1n }`. If `sumSq.num` and `sumSq.den` are exact BigInt
 * perfect squares, returns the exact reduced rational square root. Otherwise,
 * refines an integer-sqrt initial guess via iterative Heron/Newton-Raphson rational
 * square root steps and returns the reduced rational approximation.
 *
 * @param {Rational[]} vector - Non-empty array of exact rational components.
 * @param {MagnitudeOptions} [options] - Optional iteration/tolerance settings for
 *   irrational norms.
 * @returns {Rational} Reduced exact rational `{ num, den }` with `den > 0n` and `num >= 0n`.
 * @throws {TypeError} If `vector`, any element, or `options` has an invalid type.
 * @throws {RangeError} If `vector` is empty, a denominator is zero, `iterations` is
 *   not a non-negative integer, or `tolerance` is not strictly positive.
 */
export function magnitudeRationalIterative(vector, options) {
	if (!Array.isArray(vector)) {
		throw new TypeError('vector must be an array of exact rationals')
	}
	if (vector.length === 0) {
		throw new RangeError('vector must be non-empty')
	}

	let maxIterations = 10
	let tolerance = null

	if (options !== undefined) {
		if (options === null || typeof options !== 'object' || Array.isArray(options)) {
			throw new TypeError('options must be a plain object when provided')
		}
		if (options.tolerance !== undefined) {
			tolerance = validateRational(options.tolerance, 'options.tolerance')
			if (tolerance.num <= 0n) {
				throw new RangeError('options.tolerance must be strictly positive')
			}
			maxIterations = 20
		}
		if (options.iterations !== undefined) {
			if (typeof options.iterations !== 'number') {
				throw new TypeError('options.iterations must be a non-negative integer')
			}
			if (!Number.isInteger(options.iterations) || options.iterations < 0) {
				throw new RangeError('options.iterations must be a non-negative integer')
			}
			maxIterations = options.iterations
		}
	}

	let sumSq = { num: 0n, den: 1n }
	for (let i = 0; i < vector.length; i += 1) {
		const component = validateRational(vector[i], `vector[${i}]`)
		if (component.num !== 0n) {
			const squared = {
				num: component.num * component.num,
				den: component.den * component.den,
			}
			sumSq = addRationals(sumSq, squared)
		}
	}

	if (sumSq.num === 0n) {
		return { num: 0n, den: 1n }
	}

	const numRoot = bigIntSqrt(sumSq.num)
	const denRoot = bigIntSqrt(sumSq.den)

	if (numRoot * numRoot === sumSq.num && denRoot * denRoot === sumSq.den) {
		return reduceRational(numRoot, denRoot)
	}

	// Initial guess numRoot / denRoot is guaranteed positive and within a factor of 2 of sqrt(sumSq).
	let approx = reduceRational(numRoot, denRoot)

	if (tolerance !== null && isWithinTolerance(approx, sumSq, tolerance)) {
		return approx
	}

	for (let iter = 0; iter < maxIterations; iter += 1) {
		const u = approx.num
		const v = approx.den
		const nextNum = sumSq.den * u * u + sumSq.num * v * v
		const nextDen = 2n * sumSq.den * u * v
		approx = reduceRational(nextNum, nextDen)

		if (tolerance !== null && isWithinTolerance(approx, sumSq, tolerance)) {
			break
		}
	}

	return approx
}
