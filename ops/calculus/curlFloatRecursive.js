/**
 * Numerical 3D curl over IEEE-754 float64 numbers using a recursive /
 * divide-and-conquer algorithm:
 * - Divide-and-conquer recursion across the 3 coordinate axes to evaluate the
 *   Jacobian columns (partial derivative vectors dF/dx, dF/dy, dF/dz).
 * - Recursive Richardson extrapolation (halving the central-difference step
 *   size recursively and building each extrapolation row recursively) to
 *   achieve high-order accuracy in IEEE-754 float64 arithmetic.
 * - Divide-and-conquer recursion across the 3 output components to assemble
 *   curl(F) = [dFz/dy - dFy/dz, dFx/dz - dFz/dx, dFy/dx - dFx/dy].
 *
 * Zero external dependencies.
 */

const DEFAULT_STEP = 2 ** -10 // Exact binary64 power of two (~9.765625e-4)
const DEFAULT_MAX_DEPTH = 6
const DEFAULT_TOLERANCE = 1e-12
const MAX_ALLOWED_DEPTH = 20
const COORD_SCALE_FACTOR = 2 ** -22

/**
 * Normalize IEEE-754 negative zero (-0) to positive zero (+0).
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value
}

/**
 * Validate a 3D numeric vector (Array or Float64Array of 3 finite float64 numbers).
 * @param {unknown} vec
 * @param {string} label
 * @returns {[number, number, number]}
 */
function validateVector3(vec, label) {
	if (!Array.isArray(vec) && !(vec instanceof Float64Array)) {
		throw new TypeError(`${label} must be an Array or Float64Array of length 3`)
	}
	if (vec.length !== 3) {
		throw new RangeError(`${label} must have length 3, received ${vec.length}`)
	}
	const x = vec[0]
	const y = vec[1]
	const z = vec[2]
	if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
		throw new TypeError(`${label} elements must all be numbers`)
	}
	if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
		throw new RangeError(`${label} elements must all be finite float64 numbers`)
	}
	return [x, y, z]
}

/**
 * Validate and normalize optional configuration parameters.
 * @param {unknown} options
 * @returns {{ step: number | undefined, maxDepth: number, tolerance: number }}
 */
function validateOptions(options) {
	if (options === undefined) {
		return {
			step: undefined,
			maxDepth: DEFAULT_MAX_DEPTH,
			tolerance: DEFAULT_TOLERANCE,
		}
	}
	if (typeof options !== 'object' || options === null || Array.isArray(options)) {
		throw new TypeError('options must be a plain object when provided')
	}

	const {
		step,
		maxDepth = DEFAULT_MAX_DEPTH,
		tolerance = DEFAULT_TOLERANCE,
	} = /** @type {{ step?: unknown, maxDepth?: unknown, tolerance?: unknown }} */ (options)

	if (step !== undefined) {
		if (typeof step !== 'number' || !Number.isFinite(step) || step <= 0) {
			throw new RangeError('options.step must be a finite positive number')
		}
	}

	if (
		typeof maxDepth !== 'number' ||
		!Number.isInteger(maxDepth) ||
		maxDepth < 0 ||
		maxDepth > MAX_ALLOWED_DEPTH
	) {
		throw new RangeError(
			`options.maxDepth must be an integer between 0 and ${MAX_ALLOWED_DEPTH}`,
		)
	}

	if (typeof tolerance !== 'number' || !Number.isFinite(tolerance) || tolerance < 0) {
		throw new RangeError('options.tolerance must be a finite non-negative number')
	}

	return { step, maxDepth, tolerance }
}

/**
 * Evaluate the 3D vector field at a point perturbed along a single axis.
 * Does not mutate the original point.
 * @param {(point: [number, number, number]) => ArrayLike<number>} field
 * @param {[number, number, number]} point
 * @param {number} axis
 * @param {number} coordValue
 * @returns {[number, number, number]}
 */
function evaluateAtAxisCoord(field, point, axis, coordValue) {
	/** @type {[number, number, number]} */
	const perturbed = [point[0], point[1], point[2]]
	perturbed[axis] = coordValue
	return validateVector3(field(perturbed), 'field(point)')
}

/**
 * Recursively compute a Richardson extrapolation row for a single scalar
 * derivative component:
 *   R(k, 0) = D(h / 2^k)
 *   R(k, j) = (4^j * R(k, j - 1) - R(k - 1, j - 1)) / (4^j - 1)
 *
 * Also tracks the best (lowest estimated error) value encountered in this row.
 *
 * @param {number} currentValue
 * @param {number[]} prevRow
 * @param {number} order
 * @param {number} factor4
 * @param {number} bestVal
 * @param {number} bestErr
 * @returns {{ row: number[], bestVal: number, bestErr: number }}
 */
function extrapolateRowRecursive(
	currentValue,
	prevRow,
	order,
	factor4,
	bestVal,
	bestErr,
) {
	if (order > prevRow.length) {
		return { row: [currentValue], bestVal, bestErr }
	}

	const prevCol = prevRow[order - 1]
	const refined = (factor4 * currentValue - prevCol) / (factor4 - 1)
	const err = Math.max(Math.abs(refined - currentValue), Math.abs(refined - prevCol))

	let nextBestVal = bestVal
	let nextBestErr = bestErr
	if (err <= nextBestErr) {
		nextBestVal = refined
		nextBestErr = err
	}

	const tail = extrapolateRowRecursive(
		refined,
		prevRow,
		order + 1,
		factor4 * 4,
		nextBestVal,
		nextBestErr,
	)

	return {
		row: [currentValue, ...tail.row],
		bestVal: tail.bestVal,
		bestErr: tail.bestErr,
	}
}

/**
 * Divide-and-conquer helper to update the Richardson state for a contiguous
 * slice of vector components [start, end).
 *
 * @param {[number, number, number]} rawDiffs
 * @param {Array<{ row: number[], bestVal: number, bestErr: number, done: boolean }>} prevStates
 * @param {number} start
 * @param {number} end
 * @param {number} tolerance
 * @returns {Array<{ row: number[], bestVal: number, bestErr: number, done: boolean }>}
 */
function updateComponentStatesRecursive(rawDiffs, prevStates, start, end, tolerance) {
	if (end - start === 1) {
		const idx = start
		const prev = prevStates[idx]
		if (prev.done) {
			return [prev]
		}

		const { row, bestVal, bestErr } = extrapolateRowRecursive(
			rawDiffs[idx],
			prev.row,
			1,
			4,
			prev.bestVal,
			prev.bestErr,
		)

		const effTol = tolerance * Math.max(1, Math.abs(bestVal))
		const lastJump = Math.abs(row[row.length - 1] - prev.row[prev.row.length - 1])
		const roundOffGrowing = Number.isFinite(bestErr) && lastJump >= 2 * bestErr
		const done = bestErr <= effTol || roundOffGrowing

		return [{ row, bestVal, bestErr, done }]
	}

	const mid = (start + end) >> 1
	const left = updateComponentStatesRecursive(rawDiffs, prevStates, start, mid, tolerance)
	const right = updateComponentStatesRecursive(rawDiffs, prevStates, mid, end, tolerance)
	return [...left, ...right]
}

/**
 * Compute central finite differences along a single axis for all 3 vector
 * components using the exact IEEE-754 span (xPlus - xMinus).
 *
 * @param {(point: [number, number, number]) => ArrayLike<number>} field
 * @param {[number, number, number]} point
 * @param {number} axis
 * @param {number} h
 * @returns {[number, number, number] | null}
 */
function centralDifferenceAxis(field, point, axis, h) {
	const coord = point[axis]
	const xPlus = coord + h
	const xMinus = coord - h
	const span = xPlus - xMinus

	if (xPlus === coord || xMinus === coord || span === 0 || !Number.isFinite(span)) {
		return null
	}

	const fPlus = evaluateAtAxisCoord(field, point, axis, xPlus)
	const fMinus = evaluateAtAxisCoord(field, point, axis, xMinus)

	return [
		(fPlus[0] - fMinus[0]) / span,
		(fPlus[1] - fMinus[1]) / span,
		(fPlus[2] - fMinus[2]) / span,
	]
}

/**
 * Recursively refine the partial derivative vector dF/dx_axis via step-halving
 * Richardson extrapolation.
 *
 * @param {(point: [number, number, number]) => ArrayLike<number>} field
 * @param {[number, number, number]} point
 * @param {number} axis
 * @param {number} h
 * @param {number} level
 * @param {number} maxDepth
 * @param {number} tolerance
 * @param {Array<{ row: number[], bestVal: number, bestErr: number, done: boolean }> | null} states
 * @returns {[number, number, number]}
 */
function richardsonAxisRecursive(
	field,
	point,
	axis,
	h,
	level,
	maxDepth,
	tolerance,
	states,
) {
	const rawDiffs = centralDifferenceAxis(field, point, axis, h)

	if (rawDiffs === null) {
		if (states === null) {
			throw new RangeError(
				`step size ${h} is too small for IEEE-754 float64 precision at axis ${axis} (coord=${point[axis]})`,
			)
		}
		return [states[0].bestVal, states[1].bestVal, states[2].bestVal]
	}

	/** @type {Array<{ row: number[], bestVal: number, bestErr: number, done: boolean }>} */
	let nextStates
	if (states === null) {
		nextStates = [
			{ row: [rawDiffs[0]], bestVal: rawDiffs[0], bestErr: Infinity, done: false },
			{ row: [rawDiffs[1]], bestVal: rawDiffs[1], bestErr: Infinity, done: false },
			{ row: [rawDiffs[2]], bestVal: rawDiffs[2], bestErr: Infinity, done: false },
		]
	} else {
		nextStates = updateComponentStatesRecursive(rawDiffs, states, 0, 3, tolerance)
	}

	const allDone = nextStates[0].done && nextStates[1].done && nextStates[2].done
	if (level >= maxDepth || allDone) {
		return [nextStates[0].bestVal, nextStates[1].bestVal, nextStates[2].bestVal]
	}

	return richardsonAxisRecursive(
		field,
		point,
		axis,
		h * 0.5,
		level + 1,
		maxDepth,
		tolerance,
		nextStates,
	)
}

/**
 * Divide-and-conquer recursion over coordinate axes [startAxis, endAxis) to
 * compute the Jacobian columns dF/dx_axis.
 *
 * @param {(point: [number, number, number]) => ArrayLike<number>} field
 * @param {[number, number, number]} point
 * @param {number} startAxis
 * @param {number} endAxis
 * @param {{ step: number | undefined, maxDepth: number, tolerance: number }} config
 * @returns {Array<[number, number, number]>}
 */
function differentiateAxesRecursive(field, point, startAxis, endAxis, config) {
	if (endAxis - startAxis === 1) {
		const axis = startAxis
		const initialStep =
			config.step !== undefined
				? config.step
				: Math.max(DEFAULT_STEP, Math.abs(point[axis]) * COORD_SCALE_FACTOR)
		const column = richardsonAxisRecursive(
			field,
			point,
			axis,
			initialStep,
			0,
			config.maxDepth,
			config.tolerance,
			null,
		)
		return [column]
	}

	const mid = (startAxis + endAxis) >> 1
	const left = differentiateAxesRecursive(field, point, startAxis, mid, config)
	const right = differentiateAxesRecursive(field, point, mid, endAxis, config)
	return [...left, ...right]
}

/**
 * Divide-and-conquer recursion over curl output components [startComp, endComp).
 * For component i, with cyclic indices j = (i + 1) % 3 and k = (i + 2) % 3:
 *   (curl F)_i = dF_k / dx_j - dF_j / dx_k
 *
 * @param {Array<[number, number, number]>} jacobianCols
 * @param {number} startComp
 * @param {number} endComp
 * @returns {number[]}
 */
function assembleCurlRecursive(jacobianCols, startComp, endComp) {
	if (endComp - startComp === 1) {
		const i = startComp
		const j = (i + 1) % 3
		const k = (i + 2) % 3
		const component = normalizeZero(jacobianCols[j][k] - jacobianCols[k][j])
		return [component]
	}

	const mid = (startComp + endComp) >> 1
	const left = assembleCurlRecursive(jacobianCols, startComp, mid)
	const right = assembleCurlRecursive(jacobianCols, mid, endComp)
	return [...left, ...right]
}

/**
 * Compute the 3D numerical curl (∇ × F) of a vector field `F(point) => [Fx, Fy, Fz]`
 * at a 3D float64 `point` `[x, y, z]` using recursive divide-and-conquer
 * differentiation (recursive Richardson extrapolation) and recursive component
 * assembly.
 *
 * @param {(point: [number, number, number]) => ArrayLike<number>} field
 *   3D vector field mapping `[x, y, z]` to a 3-element vector `[Fx, Fy, Fz]` of
 *   finite IEEE-754 float64 numbers.
 * @param {ArrayLike<number>} point
 *   3D evaluation point `[x, y, z]` (Array or Float64Array of 3 finite numbers).
 * @param {object} [options]
 *   Optional numerical differentiation controls.
 * @param {number} [options.step]
 *   Initial finite-difference step size `h > 0`. Defaults to an adaptive
 *   exact binary64 step (`2^-10`, scaled for very large coordinates).
 * @param {number} [options.maxDepth=6]
 *   Maximum recursive Richardson extrapolation depth (`0..20`).
 * @param {number} [options.tolerance=1e-12]
 *   Target relative/absolute error tolerance for stopping recursion early.
 * @returns {[number, number, number]}
 *   The 3D curl vector `[dFz/dy - dFy/dz, dFx/dz - dFz/dx, dFy/dx - dFx/dy]`.
 */
export function curlFloatRecursive(field, point, options) {
	if (typeof field !== 'function') {
		throw new TypeError('field must be a function')
	}

	const validPoint = validateVector3(point, 'point')
	const config = validateOptions(options)

	const jacobianCols = differentiateAxesRecursive(field, validPoint, 0, 3, config)
	const result = assembleCurlRecursive(jacobianCols, 0, 3)

	return /** @type {[number, number, number]} */ (result)
}
