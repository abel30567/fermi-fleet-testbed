const HALF_PI = Math.PI / 2
const HALVING_THRESHOLD = 0.0625
const MAX_TAYLOR_ITERATIONS = 100

/**
 * Computes the arctangent (inverse tangent) of a finite or infinite IEEE-754
 * float64 number in radians using a straightforward iterative algorithm.
 *
 * Algorithm:
 * 1. Symmetry: uses oddness `arctan(-x) = -arctan(x)` to work with `t = |x|`.
 * 2. Range reduction: for `t > 1`, applies `arctan(t) = pi/2 - arctan(1/t)`
 *    so `t` lies in `(0, 1]`.
 * 3. Argument halving: repeatedly applies
 *    `arctan(t) = 2 * arctan(t / (1 + sqrt(1 + t^2)))` until `t <= 1/16`.
 * 4. Alternating Taylor series: evaluates
 *    `sum_{k=0}^{n} (-1)^k * t^(2k+1) / (2k+1)` iteratively until convergence
 *    within IEEE-754 float64 precision.
 *
 * Edge cases:
 * - Throws `TypeError` if `x` is not a `number`.
 * - Returns `NaN` for `NaN`.
 * - Returns `0` for `+0` and `-0` for `-0`.
 * - Returns `Math.PI / 2` for `+Infinity` and `-Math.PI / 2` for `-Infinity`.
 *
 * @param {number} x - Input value (real number in IEEE-754 float64).
 * @returns {number} Angle in radians in `[-Math.PI / 2, Math.PI / 2]` (or `NaN` if `x` is `NaN`).
 * @throws {TypeError} If `x` is not of type `'number'`.
 */
export function arctanFloatIterative(x) {
	if (typeof x !== 'number') {
		throw new TypeError(
			`arctanFloatIterative expects a number, received ${x === null ? 'null' : typeof x}`
		)
	}

	if (Number.isNaN(x)) {
		return Number.NaN
	}

	if (x === 0) {
		return x
	}

	if (x === Number.POSITIVE_INFINITY) {
		return HALF_PI
	}

	if (x === Number.NEGATIVE_INFINITY) {
		return -HALF_PI
	}

	const isNegative = x < 0
	let t = isNegative ? -x : x

	let inverted = false
	if (t > 1) {
		t = 1 / t
		inverted = true
	}

	let scale = 1
	while (t > HALVING_THRESHOLD) {
		t = t / (1 + Math.sqrt(1 + t * t))
		scale *= 2
	}

	const tSquared = t * t
	let power = t
	let sum = t

	for (let k = 1; k <= MAX_TAYLOR_ITERATIONS; k++) {
		power = -power * tSquared
		const term = power / (2 * k + 1)
		const next = sum + term
		if (next === sum) {
			break
		}
		sum = next
	}

	let result = sum * scale
	if (inverted) {
		result = HALF_PI - result
	}

	return isNegative ? -result : result
}
