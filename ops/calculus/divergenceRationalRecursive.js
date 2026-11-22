/**
 * Exact rational vector calculus divergence using a recursive divide-and-conquer
 * decomposition over the vector field components.
 *
 * All rationals are represented as `{ num: bigint, den: bigint }`. Inputs may be
 * unreduced or have negative denominators (as long as `den !== 0n`), and every
 * returned rational is normalized to lowest terms with `den > 0n` (with zero
 * represented canonically as `{ num: 0n, den: 1n }`).
 *
 * @typedef {{ num: bigint, den: bigint }} Rational
 */

/** @type {Rational} */
const DEFAULT_STEP = Object.freeze({ num: 1n, den: 1000n })

/**
 * Compute the absolute value of a BigInt.
 *
 * @param {bigint} value
 * @returns {bigint}
 */
function absBigInt(value) {
	return value < 0n ? -value : value
}

/**
 * Compute the greatest common divisor of two non-negative BigInts recursively
 * via the Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdRecursive(a, b) {
	if (b === 0n) {
		return a
	}
	return gcdRecursive(b, a % b)
}

/**
 * Validate and normalize a rational `{ num: bigint, den: bigint }` into lowest
 * terms with `den > 0n`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Rational}
 */
function validateAndNormalizeRational(value, label) {
	if (value === null || typeof value !== 'object') {
		throw new TypeError(`${label} must be an object with bigint num and den properties`)
	}
	const { num, den } = /** @type {{ num?: unknown, den?: unknown }} */ (value)
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label} must have bigint num and den properties`)
	}
	if (den === 0n) {
		throw new RangeError(`${label} denominator must not be zero`)
	}
	return normalizeNormalizedParts(num, den)
}

/**
 * Reduce `(num, den)` with `den !== 0n` to lowest terms with `den > 0n`.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function normalizeNormalizedParts(num, den) {
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const divisor = gcdRecursive(absBigInt(n), d)
	return { num: n / divisor, den: d / divisor }
}

/**
 * Add two normalized rationals and return a normalized rational.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function addRational(a, b) {
	const g = gcdRecursive(a.den, b.den)
	const leftDenFactor = b.den / g
	const rightDenFactor = a.den / g
	const num = a.num * leftDenFactor + b.num * rightDenFactor
	const den = rightDenFactor * b.den
	return normalizeNormalizedParts(num, den)
}

/**
 * Subtract two normalized rationals (`a - b`) and return a normalized rational.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function subRational(a, b) {
	return addRational(a, { num: -b.num, den: b.den })
}

/**
 * Divide two normalized rationals (`a / b`, with `b.num !== 0n`) and return a
 * normalized rational.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function divRational(a, b) {
	if (b.num === 0n) {
		throw new RangeError('Division by zero rational')
	}
	return normalizeNormalizedParts(a.num * b.den, a.den * b.num)
}

/**
 * Create a fresh shifted copy of `point` with `point[index]` replaced by `newCoord`.
 *
 * @param {Rational[]} point
 * @param {number} index
 * @param {Rational} newCoord
 * @returns {Rational[]}
 */
function clonePointWithCoord(point, index, newCoord) {
	const copy = new Array(point.length)
	for (let i = 0; i < point.length; i++) {
		if (i === index) {
			copy[i] = { num: newCoord.num, den: newCoord.den }
		} else {
			copy[i] = { num: point[i].num, den: point[i].den }
		}
	}
	return copy
}

/**
 * Compute the exact rational central-difference partial derivative of `componentFn`
 * along coordinate `index` at `point`:
 *
 *   (F_i(point + h * e_i) - F_i(point - h * e_i)) / (2 * h)
 *
 * @param {(point: Rational[]) => Rational} componentFn
 * @param {Rational[]} point
 * @param {number} index
 * @param {Rational} step
 * @param {Rational} twoStep
 * @returns {Rational}
 */
function partialDerivativeAt(componentFn, point, index, step, twoStep) {
	const plusPoint = clonePointWithCoord(point, index, addRational(point[index], step))
	const minusPoint = clonePointWithCoord(point, index, subRational(point[index], step))

	const fPlus = validateAndNormalizeRational(
		componentFn(plusPoint),
		`field[${index}](x + h*e_${index})`
	)
	const fMinus = validateAndNormalizeRational(
		componentFn(minusPoint),
		`field[${index}](x - h*e_${index})`
	)

	return divRational(subRational(fPlus, fMinus), twoStep)
}

/**
 * Recursively divide the component index interval `[start, end)` in half and sum
 * the exact rational partial derivatives bottom-up.
 *
 * @param {Array<(point: Rational[]) => Rational>} field
 * @param {Rational[]} point
 * @param {Rational} step
 * @param {Rational} twoStep
 * @param {number} start
 * @param {number} end
 * @returns {Rational}
 */
function sumPartialDerivativesRecursive(field, point, step, twoStep, start, end) {
	if (end - start === 1) {
		return partialDerivativeAt(field[start], point, start, step, twoStep)
	}
	const mid = start + ((end - start) >> 1)
	const leftSum = sumPartialDerivativesRecursive(field, point, step, twoStep, start, mid)
	const rightSum = sumPartialDerivativesRecursive(field, point, step, twoStep, mid, end)
	return addRational(leftSum, rightSum)
}

/**
 * Compute the divergence of an n-dimensional vector field over exact rationals
 * using a recursive divide-and-conquer decomposition across vector components:
 *
 *   div(F)(x) = sum_{i=0}^{n-1} (F_i(x + h * e_i) - F_i(x - h * e_i)) / (2 * h)
 *
 * This central difference is algebraically exact for all constant, linear, and
 * quadratic polynomial vector fields for any positive rational step `h`, and
 * evaluates exact rational finite-difference divergence for general rational
 * vector fields.
 *
 * @param {Array<(point: Rational[]) => Rational>} field
 *   Non-empty array of `n` component functions mapping a point (`Rational[]`) to a `Rational`.
 * @param {Rational[]} point
 *   Evaluation point of length `n`, where each coordinate is `{ num: bigint, den: bigint }`.
 * @param {Rational} [step={ num: 1n, den: 1000n }]
 *   Strictly positive rational finite-difference step size `h`.
 * @returns {Rational}
 *   Exact divergence as a normalized rational `{ num: bigint, den: bigint }` in lowest
 *   terms with `den > 0n`.
 */
export function divergenceRationalRecursive(field, point, step = DEFAULT_STEP) {
	if (!Array.isArray(field)) {
		throw new TypeError('field must be an array of component functions')
	}
	if (field.length === 0) {
		throw new RangeError('field must contain at least one component function')
	}
	for (let i = 0; i < field.length; i++) {
		if (typeof field[i] !== 'function') {
			throw new TypeError(`field[${i}] must be a function`)
		}
	}

	if (!Array.isArray(point)) {
		throw new TypeError('point must be an array of rationals')
	}
	if (point.length !== field.length) {
		throw new RangeError(
			`point dimension (${point.length}) must match field dimension (${field.length})`
		)
	}

	const normalizedPoint = new Array(point.length)
	for (let i = 0; i < point.length; i++) {
		normalizedPoint[i] = validateAndNormalizeRational(point[i], `point[${i}]`)
	}

	const normalizedStep = validateAndNormalizeRational(step, 'step')
	if (normalizedStep.num <= 0n) {
		throw new RangeError('step must be strictly positive')
	}

	const twoStep = normalizeNormalizedParts(normalizedStep.num * 2n, normalizedStep.den)
	return sumPartialDerivativesRecursive(
		field,
		normalizedPoint,
		normalizedStep,
		twoStep,
		0,
		field.length
	)
}
