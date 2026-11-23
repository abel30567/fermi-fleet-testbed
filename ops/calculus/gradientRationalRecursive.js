/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 * Exact rational number in lowest terms with strictly positive denominator (`den > 0n`).
 */

/** @type {Rational} */
const DEFAULT_STEP = Object.freeze({ num: 1n, den: 1000000n })

/**
 * Computes the absolute value of a BigInt.
 * @param {bigint} value
 * @returns {bigint}
 */
function absBigInt(value) {
	return value < 0n ? -value : value
}

/**
 * Computes the greatest common divisor of two non-negative BigInts recursively.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdRecursive(a, b) {
	return b === 0n ? a : gcdRecursive(b, a % b)
}

/**
 * Normalizes a rational pair `(num, den)` to lowest terms with `den > 0n`.
 * Zero is always normalized to `{ num: 0n, den: 1n }`.
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function normalizeRational(num, den) {
	if (den === 0n) {
		throw new RangeError('Rational denominator must not be zero')
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	const signedNum = den < 0n ? -num : num
	const positiveDen = den < 0n ? -den : den
	const divisor = gcdRecursive(absBigInt(signedNum), positiveDen)
	return {
		num: signedNum / divisor,
		den: positiveDen / divisor,
	}
}

/**
 * Validates and normalizes an input rational object `{ num: BigInt, den: BigInt }`.
 * @param {unknown} value
 * @param {string} label
 * @returns {Rational}
 */
function validateRational(value, label) {
	if (
		value === null ||
		typeof value !== 'object' ||
		typeof value.num !== 'bigint' ||
		typeof value.den !== 'bigint'
	) {
		throw new TypeError(`${label} must be an object with BigInt properties { num, den }`)
	}
	if (value.den === 0n) {
		throw new RangeError(`${label} denominator must not be zero`)
	}
	return normalizeRational(value.num, value.den)
}

/**
 * Adds two normalized rationals.
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function ratAdd(a, b) {
	return normalizeRational(a.num * b.den + b.num * a.den, a.den * b.den)
}

/**
 * Subtracts two normalized rationals (`a - b`).
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function ratSub(a, b) {
	return normalizeRational(a.num * b.den - b.num * a.den, a.den * b.den)
}

/**
 * Divides two normalized rationals (`a / b`).
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function ratDiv(a, b) {
	if (b.num === 0n) {
		throw new RangeError('Division by zero in rational arithmetic')
	}
	return normalizeRational(a.num * b.den, a.den * b.num)
}

/**
 * Recursively validates and normalizes a slice of point coordinates via divide-and-conquer.
 * @param {unknown[]} point
 * @param {number} lo
 * @param {number} hi
 * @returns {Rational[]}
 */
function normalizePointRecursive(point, lo, hi) {
	const len = hi - lo
	if (len === 0) return []
	if (len === 1) {
		return [validateRational(point[lo], `point[${lo}]`)]
	}
	const mid = lo + Math.floor(len / 2)
	return [
		...normalizePointRecursive(point, lo, mid),
		...normalizePointRecursive(point, mid, hi),
	]
}

/**
 * Evaluates a shifted copy of `point` with coordinate `index` offset by `delta`.
 * Produces fresh objects so user callbacks cannot mutate shared state.
 * @param {Rational[]} point
 * @param {number} index
 * @param {Rational} delta
 * @returns {Rational[]}
 */
function shiftCoordinate(point, index, delta) {
	const shifted = point.map((coord) => ({ num: coord.num, den: coord.den }))
	shifted[index] = ratAdd(point[index], delta)
	return shifted
}

/**
 * Computes the central finite-difference approximation for partial derivative `index`
 * with exact rational step `step`: `(f(x + h*e_i) - f(x - h*e_i)) / (2h)`.
 * @param {(point: Rational[]) => Rational} fn
 * @param {Rational[]} point
 * @param {number} index
 * @param {Rational} step
 * @returns {Rational}
 */
function centralDifference(fn, point, index, step) {
	const negStep = { num: -step.num, den: step.den }
	const fPlus = validateRational(
		fn(shiftCoordinate(point, index, step)),
		`fn(point + h*e_${index})`,
	)
	const fMinus = validateRational(
		fn(shiftCoordinate(point, index, negStep)),
		`fn(point - h*e_${index})`,
	)
	const twoStep = normalizeRational(2n * step.num, step.den)
	return ratDiv(ratSub(fPlus, fMinus), twoStep)
}

/**
 * Recursively builds the initial column `[D(h), D(h/2), ..., D(h/2^depth)]`
 * for Richardson extrapolation.
 * @param {(point: Rational[]) => Rational} fn
 * @param {Rational[]} point
 * @param {number} index
 * @param {Rational} step
 * @param {number} remaining
 * @returns {Rational[]}
 */
function buildDifferenceColumn(fn, point, index, step, remaining) {
	const current = centralDifference(fn, point, index, step)
	if (remaining === 0) {
		return [current]
	}
	const halfStep = normalizeRational(step.num, step.den * 2n)
	return [current, ...buildDifferenceColumn(fn, point, index, halfStep, remaining - 1)]
}

/**
 * Recursively reduces one Richardson extrapolation row using factor `4^level`.
 * @param {Rational[]} row
 * @param {bigint} weight
 * @param {bigint} denom
 * @param {number} lo
 * @param {number} hi
 * @returns {Rational[]}
 */
function combineRichardsonSlice(row, weight, denom, lo, hi) {
	const len = hi - lo
	if (len === 0) return []
	if (len === 1) {
		const fine = row[lo + 1]
		const coarse = row[lo]
		const scaledFine = normalizeRational(weight * fine.num, fine.den)
		const diff = ratSub(scaledFine, coarse)
		return [normalizeRational(diff.num, diff.den * denom)]
	}
	const mid = lo + Math.floor(len / 2)
	return [
		...combineRichardsonSlice(row, weight, denom, lo, mid),
		...combineRichardsonSlice(row, weight, denom, mid, hi),
	]
}

/**
 * Recursively applies Richardson extrapolation across levels until a single
 * exact rational estimate remains.
 * @param {Rational[]} row
 * @param {number} level
 * @returns {Rational}
 */
function extrapolateRecursive(row, level) {
	if (row.length === 1) {
		return row[0]
	}
	const weight = 4n ** BigInt(level)
	const denom = weight - 1n
	const nextRow = combineRichardsonSlice(row, weight, denom, 0, row.length - 1)
	return extrapolateRecursive(nextRow, level + 1)
}

/**
 * Computes the gradient of a scalar function `f: Q^n -> Q` at `point` over exact
 * rationals `{ num: BigInt, den: BigInt }` in lowest terms (`den > 0n`), using a
 * recursive divide-and-conquer implementation across coordinate dimensions.
 *
 * Each partial derivative is computed via exact-rational central differences:
 * `(f(x + h * e_i) - f(x - h * e_i)) / (2h)`, which is mathematically exact for
 * all linear and quadratic multivariate polynomials for any step `h > 0`.
 * Optional recursive Richardson extrapolation (`richardsonDepth > 0`) eliminates
 * higher even-order truncation terms, yielding exact results for polynomials up
 * to degree `2 * (richardsonDepth + 1)`.
 *
 * @param {(point: Rational[]) => Rational} fn - Scalar function mapping a vector of exact rationals to an exact rational.
 * @param {Rational[]} point - Evaluation point as an array of rationals `{ num: BigInt, den: BigInt }`. An empty array yields `[]`.
 * @param {Rational} [step={ num: 1n, den: 1000000n }] - Strictly positive exact rational finite-difference step size `h`.
 * @param {number} [richardsonDepth=0] - Non-negative integer depth for recursive Richardson extrapolation (`0` = plain central difference).
 * @returns {Rational[]} Gradient vector of exact rationals in lowest terms with `den > 0n`.
 * @throws {TypeError} If `fn` is not a function, `point` is not an array, any rational is malformed, or `richardsonDepth` is not an integer.
 * @throws {RangeError} If any rational has a zero denominator, `step <= 0`, or `richardsonDepth` is negative.
 */
export function gradientRationalRecursive(
	fn,
	point,
	step = DEFAULT_STEP,
	richardsonDepth = 0,
) {
	if (typeof fn !== 'function') {
		throw new TypeError('fn must be a function')
	}
	if (!Array.isArray(point)) {
		throw new TypeError('point must be an array of rationals')
	}

	const normalizedStep = validateRational(step, 'step')
	if (normalizedStep.num <= 0n) {
		throw new RangeError('step must be strictly positive')
	}

	if (typeof richardsonDepth !== 'number' || !Number.isInteger(richardsonDepth)) {
		throw new TypeError('richardsonDepth must be an integer')
	}
	if (richardsonDepth < 0) {
		throw new RangeError('richardsonDepth must be a non-negative integer')
	}

	const normalizedPoint = normalizePointRecursive(point, 0, point.length)

	/**
	 * Divide-and-conquer computation of partial derivatives for coordinates `[lo, hi)`.
	 * @param {number} lo
	 * @param {number} hi
	 * @returns {Rational[]}
	 */
	function computeGradientSlice(lo, hi) {
		const len = hi - lo
		if (len === 0) return []
		if (len === 1) {
			if (richardsonDepth === 0) {
				return [centralDifference(fn, normalizedPoint, lo, normalizedStep)]
			}
			const column = buildDifferenceColumn(
				fn,
				normalizedPoint,
				lo,
				normalizedStep,
				richardsonDepth,
			)
			return [extrapolateRecursive(column, 1)]
		}
		const mid = lo + Math.floor(len / 2)
		return [
			...computeGradientSlice(lo, mid),
			...computeGradientSlice(mid, hi),
		]
	}

	return computeGradientSlice(0, normalizedPoint.length)
}
