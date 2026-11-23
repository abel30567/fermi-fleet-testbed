/**
 * Exact rational arithmetic and numerically robust vector field divergence.
 *
 * Computes the divergence ∇·F(x) = Σ_{i=0}^{n-1} ∂F_i/∂x_i(x) for a vector field
 * F: Q^n -> Q^n over exact rationals `{ num: BigInt, den: BigInt }` in lowest
 * terms with `den > 0n`.
 *
 * Numerical robustness features:
 * - Higher-order central finite differences with Richardson extrapolation
 *   (default 2 extrapolation levels -> 6th-order O(h^6), exact for all
 *   polynomial vector fields up to degree 6, including cubic fields).
 * - Optional adaptive Richardson refinement against an exact rational error
 *   tolerance `|R[k][k] - R[k-1][k-1]| <= tolerance`.
 * - Coordinate-aware default step sizing near zero to avoid crossing origin
 *   singularities while avoiding unnecessary scaling at large coordinates
 *   (exact BigInt arithmetic has no floating-point cancellation).
 * - Balanced pairwise (tree) summation with eager GCD reduction at every
 *   operation to minimize intermediate denominator growth.
 *
 * @module ops/calculus/divergenceRationalStable
 */

const ZERO = Object.freeze({ num: 0n, den: 1n })
const TWO = Object.freeze({ num: 2n, den: 1n })
const DEFAULT_STEP = Object.freeze({ num: 1n, den: 1024n })
const STEP_SCALE_DIVISOR = Object.freeze({ num: 16n, den: 1n })
const DEFAULT_RICHARDSON_LEVELS = 2
const DEFAULT_ADAPTIVE_MAX_LEVELS = 8
const MAX_ALLOWED_LEVELS = 16

/**
 * Greatest common divisor of two BigInts (always non-negative).
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

/**
 * Construct a normalized rational `{ num, den }` in lowest terms with `den > 0n`.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
function makeRational(num, den) {
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
	const g = gcd(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Validate and normalize an external rational value.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {{ num: bigint, den: bigint }}
 */
function normalizeRational(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be a rational object { num: BigInt, den: BigInt }`)
	}
	const { num, den } = value
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label} must have BigInt num and den properties`)
	}
	if (den === 0n) {
		throw new RangeError(`${label} denominator must not be zero`)
	}
	return makeRational(num, den)
}

/**
 * Exact rational addition with intermediate denominator GCD reduction.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function ratAdd(a, b) {
	if (a.num === 0n) return { num: b.num, den: b.den }
	if (b.num === 0n) return { num: a.num, den: a.den }
	const g = gcd(a.den, b.den)
	const da = a.den / g
	const db = b.den / g
	const num = a.num * db + b.num * da
	if (num === 0n) return { num: 0n, den: 1n }
	const den = da * b.den
	return makeRational(num, den)
}

/**
 * Exact rational subtraction.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function ratSub(a, b) {
	return ratAdd(a, { num: -b.num, den: b.den })
}

/**
 * Exact rational multiplication with cross-cancellation before multiplying.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function ratMul(a, b) {
	if (a.num === 0n || b.num === 0n) return { num: 0n, den: 1n }
	const g1 = gcd(a.num, b.den)
	const g2 = gcd(b.num, a.den)
	return makeRational((a.num / g1) * (b.num / g2), (a.den / g2) * (b.den / g1))
}

/**
 * Exact rational division.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function ratDiv(a, b) {
	if (b.num === 0n) {
		throw new RangeError('Division by zero in rational arithmetic')
	}
	return ratMul(a, { num: b.den, den: b.num })
}

/**
 * Exact rational absolute value.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @returns {{ num: bigint, den: bigint }}
 */
function ratAbs(a) {
	return { num: a.num < 0n ? -a.num : a.num, den: a.den }
}

/**
 * Exact rational comparison: returns -1, 0, or 1.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {-1 | 0 | 1}
 */
function ratCompare(a, b) {
	const lhs = a.num * b.den
	const rhs = b.num * a.den
	if (lhs < rhs) return -1
	if (lhs > rhs) return 1
	return 0
}

/**
 * Balanced pairwise (binary tree) summation over exact rationals.
 * Keeps operand denominator sizes balanced and applies exact GCD reduction at
 * every merge node.
 *
 * @param {Array<{ num: bigint, den: bigint }>} terms
 * @param {number} start
 * @param {number} end
 * @returns {{ num: bigint, den: bigint }}
 */
function pairwiseSum(terms, start, end) {
	const len = end - start
	if (len <= 0) return { num: ZERO.num, den: ZERO.den }
	if (len === 1) return terms[start]
	if (len === 2) return ratAdd(terms[start], terms[start + 1])
	const mid = start + (len >> 1)
	return ratAdd(pairwiseSum(terms, start, mid), pairwiseSum(terms, mid, end))
}

/**
 * Parse and validate optional configuration or direct step argument.
 *
 * @param {unknown} options
 * @returns {{
 *   step: { num: bigint, den: bigint } | null,
 *   minLevels: number,
 *   maxLevels: number,
 *   tolerance: { num: bigint, den: bigint } | null,
 * }}
 */
function parseOptions(options) {
	if (options === undefined) {
		return {
			step: null,
			minLevels: DEFAULT_RICHARDSON_LEVELS,
			maxLevels: DEFAULT_RICHARDSON_LEVELS,
			tolerance: null,
		}
	}
	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be a plain object or a positive rational step')
	}

	// Allow passing a rational step directly as the 3rd argument
	if ('num' in options || 'den' in options) {
		const step = normalizeRational(options, 'step')
		if (step.num <= 0n) {
			throw new RangeError('step must be strictly positive')
		}
		return {
			step,
			minLevels: DEFAULT_RICHARDSON_LEVELS,
			maxLevels: DEFAULT_RICHARDSON_LEVELS,
			tolerance: null,
		}
	}

	let step = null
	if (options.step !== undefined) {
		step = normalizeRational(options.step, 'options.step')
		if (step.num <= 0n) {
			throw new RangeError('options.step must be strictly positive')
		}
	}

	let minLevels = DEFAULT_RICHARDSON_LEVELS
	if (options.richardsonLevels !== undefined) {
		if (typeof options.richardsonLevels !== 'number') {
			throw new TypeError('options.richardsonLevels must be an integer')
		}
		if (
			!Number.isInteger(options.richardsonLevels) ||
			options.richardsonLevels < 0 ||
			options.richardsonLevels > MAX_ALLOWED_LEVELS
		) {
			throw new RangeError(
				`options.richardsonLevels must be an integer between 0 and ${MAX_ALLOWED_LEVELS}`,
			)
		}
		minLevels = options.richardsonLevels
	}

	let tolerance = null
	if (options.tolerance !== undefined) {
		tolerance = normalizeRational(options.tolerance, 'options.tolerance')
		if (tolerance.num < 0n) {
			throw new RangeError('options.tolerance must be non-negative')
		}
	}

	let maxLevels =
		tolerance === null
			? minLevels
			: Math.max(minLevels, DEFAULT_ADAPTIVE_MAX_LEVELS)

	if (options.maxLevels !== undefined) {
		if (typeof options.maxLevels !== 'number') {
			throw new TypeError('options.maxLevels must be an integer')
		}
		if (
			!Number.isInteger(options.maxLevels) ||
			options.maxLevels < minLevels ||
			options.maxLevels > MAX_ALLOWED_LEVELS
		) {
			throw new RangeError(
				`options.maxLevels must be an integer between ${minLevels} and ${MAX_ALLOWED_LEVELS}`,
			)
		}
		maxLevels = options.maxLevels
	}

	return { step, minLevels, maxLevels, tolerance }
}

/**
 * Choose a safe exact step for coordinate `xi`.
 * When no explicit step is provided and `0 < |xi| < 16 * DEFAULT_STEP`,
 * shrinks the step to `|xi| / 16` so perturbed points never cross zero.
 *
 * @param {{ num: bigint, den: bigint }} xi
 * @param {{ num: bigint, den: bigint } | null} explicitStep
 * @returns {{ num: bigint, den: bigint }}
 */
function chooseStep(xi, explicitStep) {
	if (explicitStep !== null) return explicitStep
	const absX = ratAbs(xi)
	if (absX.num === 0n) return { num: DEFAULT_STEP.num, den: DEFAULT_STEP.den }
	const scaled = ratDiv(absX, STEP_SCALE_DIVISOR)
	return ratCompare(scaled, DEFAULT_STEP) < 0
		? scaled
		: { num: DEFAULT_STEP.num, den: DEFAULT_STEP.den }
}

/**
 * Evaluate `field(pt)` and validate its output dimension and rational components.
 *
 * @param {(point: Array<{ num: bigint, den: bigint }>) => Array<{ num: bigint, den: bigint }>} field
 * @param {Array<{ num: bigint, den: bigint }>} pt
 * @param {number} expectedDim
 * @returns {Array<{ num: bigint, den: bigint }>}
 */
function evalField(field, pt, expectedDim) {
	const output = field(pt)
	if (!Array.isArray(output)) {
		throw new TypeError('field must return an array of rationals')
	}
	if (output.length !== expectedDim) {
		throw new RangeError(
			`Vector field dimension mismatch: expected ${expectedDim}, got ${output.length}`,
		)
	}
	const normalized = new Array(expectedDim)
	for (let j = 0; j < expectedDim; j++) {
		normalized[j] = normalizeRational(output[j], `field output[${j}]`)
	}
	return normalized
}

/**
 * Estimate partial derivative ∂F_i/∂x_i at `point` using central differences
 * and Richardson extrapolation with step halving.
 *
 * @param {(point: Array<{ num: bigint, den: bigint }>) => Array<{ num: bigint, den: bigint }>} field
 * @param {Array<{ num: bigint, den: bigint }>} point
 * @param {number} index
 * @param {{ num: bigint, den: bigint }} baseStep
 * @param {number} minLevels
 * @param {number} maxLevels
 * @param {{ num: bigint, den: bigint } | null} tolerance
 * @returns {{ num: bigint, den: bigint }}
 */
function partialDerivative(field, point, index, baseStep, minLevels, maxLevels, tolerance) {
	const n = point.length
	let prevRow = []
	let h = baseStep

	for (let k = 0; k <= maxLevels; k++) {
		const pPlus = point.slice()
		const pMinus = point.slice()
		pPlus[index] = ratAdd(point[index], h)
		pMinus[index] = ratSub(point[index], h)

		const fPlus = evalField(field, pPlus, n)
		const fMinus = evalField(field, pMinus, n)

		const diff = ratSub(fPlus[index], fMinus[index])
		const twoH = ratMul(TWO, h)

		const row = new Array(k + 1)
		row[0] = ratDiv(diff, twoH)

		// Extrapolate even-order error terms: R[k][m] = R[k][m-1] + (R[k][m-1] - R[k-1][m-1]) / (4^m - 1)
		let pow4 = 1n
		for (let m = 1; m <= k; m++) {
			pow4 <<= 2n
			const denom = { num: pow4 - 1n, den: 1n }
			const delta = ratSub(row[m - 1], prevRow[m - 1])
			row[m] = ratAdd(row[m - 1], ratDiv(delta, denom))
		}

		if (k >= minLevels) {
			if (tolerance === null) {
				return row[k]
			}
			if (k > 0) {
				const err = ratAbs(ratSub(row[k], prevRow[k - 1]))
				if (ratCompare(err, tolerance) <= 0) {
					return row[k]
				}
			}
		}

		prevRow = row
		h = ratDiv(h, TWO)
	}

	return prevRow[prevRow.length - 1]
}

/**
 * Compute the divergence ∇·F(x) of a vector field F: Q^n -> Q^n at `point`
 * over exact rationals `{ num: BigInt, den: BigInt }` in lowest terms (`den > 0n`).
 *
 * Uses central differences with Richardson extrapolation for each diagonal
 * partial derivative ∂F_i/∂x_i and balanced pairwise summation with exact GCD
 * reduction across coordinates.
 *
 * @param {(point: Array<{ num: bigint, den: bigint }>) => Array<{ num: bigint, den: bigint }>} field
 *   Vector field mapping an n-element array of rationals to an n-element array of rationals.
 * @param {Array<{ num: bigint, den: bigint }>} point
 *   Non-empty n-element array of exact rationals specifying the evaluation point.
 * @param {{
 *   step?: { num: bigint, den: bigint },
 *   richardsonLevels?: number,
 *   tolerance?: { num: bigint, den: bigint },
 *   maxLevels?: number,
 * } | { num: bigint, den: bigint }} [options]
 *   Optional configuration object or positive rational step size.
 * @returns {{ num: bigint, den: bigint }}
 *   Exact rational divergence in lowest terms with `den > 0n`.
 */
export function divergenceRationalStable(field, point, options) {
	if (typeof field !== 'function') {
		throw new TypeError('field must be a function')
	}
	if (!Array.isArray(point)) {
		throw new TypeError('point must be an array of rationals')
	}
	if (point.length === 0) {
		throw new RangeError('point must not be empty')
	}

	const n = point.length
	const normalizedPoint = new Array(n)
	for (let i = 0; i < n; i++) {
		normalizedPoint[i] = normalizeRational(point[i], `point[${i}]`)
	}

	const { step, minLevels, maxLevels, tolerance } = parseOptions(options)

	const partials = new Array(n)
	for (let i = 0; i < n; i++) {
		const h = chooseStep(normalizedPoint[i], step)
		partials[i] = partialDerivative(
			field,
			normalizedPoint,
			i,
			h,
			minLevels,
			maxLevels,
			tolerance,
		)
	}

	return pairwiseSum(partials, 0, n)
}
