/**
 * Computes the divergence of a vector field F = (F_0, ..., F_{n-1}) at a point
 * over exact rationals using recursive divide-and-conquer coordinate reduction
 * and exact central finite differences.
 *
 * For a vector field F: Q^n -> Q^n and step h > 0, each partial derivative is
 * approximated with exact rational arithmetic:
 *   dF_i / dx_i (x) ≈ (F_i(x + h e_i) - F_i(x - h e_i)) / (2h)
 * which is exact for all polynomial vector fields of degree <= 2.
 *
 * The coordinate contributions are combined recursively by splitting [lo, hi)
 * at the midpoint, keeping intermediate BigInt denominators balanced.
 *
 * @typedef {{ num: bigint, den: bigint }} Rational
 *
 * @param {Array<(point: Rational[]) => Rational>} components
 *   Non-empty array of scalar component functions F_i(point) -> Rational.
 * @param {Rational[]} point
 *   Evaluation point in Q^n, same length as `components`.
 * @param {Rational} [step={ num: 1n, den: 1000n }]
 *   Positive rational step size h > 0 for central differences.
 * @returns {Rational}
 *   The divergence as a normalized exact rational `{ num, den }` in lowest
 *   terms with `den > 0n`.
 * @throws {TypeError} If arguments or component return values have invalid types.
 * @throws {RangeError} If dimensions mismatch, are empty, denominators are zero,
 *   or `step` is not strictly positive.
 */
export function divergenceRationalRecursive(
	components,
	point,
	step = { num: 1n, den: 1000n },
) {
	if (!Array.isArray(components)) {
		throw new TypeError('components must be an array of functions')
	}
	if (components.length === 0) {
		throw new RangeError('components must be non-empty')
	}
	for (let i = 0; i < components.length; i++) {
		if (typeof components[i] !== 'function') {
			throw new TypeError(`components[${i}] must be a function`)
		}
	}

	if (!Array.isArray(point)) {
		throw new TypeError('point must be an array of rationals')
	}
	if (point.length !== components.length) {
		throw new RangeError(
			`point length (${point.length}) must match components length (${components.length})`,
		)
	}

	const normalizedPoint = new Array(point.length)
	for (let i = 0; i < point.length; i++) {
		normalizedPoint[i] = normalizeRational(point[i], `point[${i}]`)
	}

	const normalizedStep = normalizeRational(step, 'step')
	if (normalizedStep.num <= 0n) {
		throw new RangeError('step must be strictly positive')
	}

	const twoStep = normalizeRational(
		{ num: 2n * normalizedStep.num, den: normalizedStep.den },
		'twoStep',
	)

	return sumPartialsRecursive(
		components,
		normalizedPoint,
		normalizedStep,
		twoStep,
		0,
		components.length,
	)
}

/**
 * Recursively sums partial derivatives over coordinate range [lo, hi)
 * using divide-and-conquer pairwise rational addition.
 *
 * @param {Array<(point: Rational[]) => Rational>} components
 * @param {Rational[]} point
 * @param {Rational} step
 * @param {Rational} twoStep
 * @param {number} lo
 * @param {number} hi
 * @returns {Rational}
 */
function sumPartialsRecursive(components, point, step, twoStep, lo, hi) {
	if (hi - lo === 1) {
		return centralPartial(components[lo], point, lo, step, twoStep)
	}
	const mid = (lo + hi) >>> 1
	const left = sumPartialsRecursive(components, point, step, twoStep, lo, mid)
	const right = sumPartialsRecursive(components, point, step, twoStep, mid, hi)
	return ratAdd(left, right)
}

/**
 * Computes the exact-rational central difference for coordinate `index`.
 *
 * @param {(point: Rational[]) => Rational} fn
 * @param {Rational[]} point
 * @param {number} index
 * @param {Rational} step
 * @param {Rational} twoStep
 * @returns {Rational}
 */
function centralPartial(fn, point, index, step, twoStep) {
	const xPlus = point.slice()
	xPlus[index] = ratAdd(point[index], step)

	const xMinus = point.slice()
	xMinus[index] = ratSub(point[index], step)

	const fPlus = normalizeRational(fn(xPlus), `components[${index}](x + h)`)
	const fMinus = normalizeRational(fn(xMinus), `components[${index}](x - h)`)

	const diff = ratSub(fPlus, fMinus)
	return ratDiv(diff, twoStep)
}

/**
 * Recursive Euclidean greatest common divisor for non-negative BigInts.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	if (b === 0n) {
		return a
	}
	return gcdBigInt(b, a % b)
}

/**
 * Validates and reduces a rational `{ num: bigint, den: bigint }` to lowest
 * terms with `den > 0n` (and `0n / 1n` for zero).
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Rational}
 */
function normalizeRational(value, label) {
	if (
		value === null ||
		typeof value !== 'object' ||
		typeof value.num !== 'bigint' ||
		typeof value.den !== 'bigint'
	) {
		throw new TypeError(
			`${label} must be an object with bigint properties { num, den }`,
		)
	}
	if (value.den === 0n) {
		throw new RangeError(`${label} denominator must not be zero`)
	}
	if (value.num === 0n) {
		return { num: 0n, den: 1n }
	}

	let num = value.num
	let den = value.den
	if (den < 0n) {
		num = -num
		den = -den
	}
	const absNum = num < 0n ? -num : num
	const g = gcdBigInt(absNum, den)
	return { num: num / g, den: den / g }
}

/**
 * Exact addition of two normalized rationals.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function ratAdd(a, b) {
	const g = gcdBigInt(a.den, b.den)
	const num = a.num * (b.den / g) + b.num * (a.den / g)
	const den = (a.den / g) * b.den
	return normalizeRational({ num, den }, 'sum')
}

/**
 * Exact subtraction of two normalized rationals.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function ratSub(a, b) {
	return ratAdd(a, { num: -b.num, den: b.den })
}

/**
 * Exact division of two normalized rationals.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function ratDiv(a, b) {
	if (b.num === 0n) {
		throw new RangeError('division by zero rational')
	}
	return normalizeRational(
		{ num: a.num * b.den, den: a.den * b.num },
		'quotient',
	)
}
