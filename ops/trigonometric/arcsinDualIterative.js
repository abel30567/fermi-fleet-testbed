const HALF_PI = Math.PI / 2
const MAX_SQRT_ITERATIONS = 1000
const MAX_SERIES_ITERATIONS = 200

/**
 * Computes the square root of a non-negative finite number iteratively
 * using Newton-Raphson iteration.
 *
 * @param {number} a - Non-negative finite real number.
 * @returns {number} Square root of `a`.
 */
function sqrtIterative(a) {
	if (a === 0) {
		return 0
	}

	// Start strictly at or above sqrt(a) so Newton iterates decrease monotonically.
	let guess = a >= 1 ? a : 1
	for (let i = 0; i < MAX_SQRT_ITERATIONS; i++) {
		const next = 0.5 * (guess + a / guess)
		if (next >= guess) {
			break
		}
		guess = next
	}
	return guess
}

/**
 * Computes arcsin(u) for 0 <= u <= 0.5 iteratively using its Maclaurin series:
 *   arcsin(u) = sum_{n=0..inf} ((2n)! / (4^n * (n!)^2 * (2n + 1))) * u^(2n + 1)
 *
 * For |u| <= 0.5, each term shrinks by at least a factor of 4, converging to
 * IEEE-754 double precision within ~27 iterations.
 *
 * @param {number} u - Real number in [0, 0.5].
 * @returns {number} arcsin(u) in radians.
 */
function arcsinSmallIterative(u) {
	if (u === 0) {
		return 0
	}

	const u2 = u * u
	let sum = u
	let coeffPower = u

	for (let n = 1; n <= MAX_SERIES_ITERATIONS; n++) {
		coeffPower *= ((2 * n - 1) / (2 * n)) * u2
		const term = coeffPower / (2 * n + 1)
		const nextSum = sum + term
		if (nextSum === sum) {
			break
		}
		sum = nextSum
	}

	return sum
}

/**
 * Computes the arcsine (inverse sine) of a dual number `{ v, d }` carrying a
 * primal value `v` and forward-mode derivative `d`, using a straightforward
 * iterative implementation.
 *
 * Mathematical definition:
 * - Primal value: `arcsin(v)` in `[-pi/2, pi/2]` for `v` in `[-1, 1]`.
 *   - For `|v| <= 0.5`, evaluated via the iterative Maclaurin series.
 *   - For `0.5 < |v| < 1`, evaluated via the range-reduction identity
 *     `arcsin(v) = sign(v) * (pi/2 - 2 * arcsin(sqrt((1 - |v|) / 2)))`
 *     using iterative Newton-Raphson square root and the Maclaurin series.
 * - Forward-mode derivative: `d / sqrt(1 - v^2)` for `|v| < 1`.
 *
 * Boundary behavior at `|v| === 1`:
 * - If `d === 0`, the derivative is `0` and the result is `{ v: ±pi/2, d: 0 }`.
 * - If `d !== 0`, a `RangeError` is thrown because the derivative
 *   `1 / sqrt(1 - v^2)` is undefined/infinite at `v = ±1`.
 *
 * @param {{ v: number, d: number }} x - Input dual number with finite `v` in `[-1, 1]` and finite `d`.
 * @returns {{ v: number, d: number }} Resulting dual number `{ v: arcsin(x.v), d: x.d / sqrt(1 - x.v^2) }`.
 * @throws {TypeError} If `x` is not a non-null plain object or if `x.v` or `x.d` is not a finite number.
 * @throws {RangeError} If `x.v` is outside `[-1, 1]`, if `|x.v| === 1` with `x.d !== 0`, or if the derivative overflows.
 */
export function arcsinDualIterative(x) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('Expected dual number input to be a non-null object with finite numeric properties { v, d }')
	}

	const { v, d } = x

	if (typeof v !== 'number' || !Number.isFinite(v)) {
		throw new TypeError('Expected dual number primal value `v` to be a finite number')
	}

	if (typeof d !== 'number' || !Number.isFinite(d)) {
		throw new TypeError('Expected dual number derivative `d` to be a finite number')
	}

	if (v < -1 || v > 1) {
		throw new RangeError(`arcsin domain error: primal value v=${v} must be within [-1, 1]`)
	}

	if (v === 1 || v === -1) {
		if (d === 0) {
			return { v: v === 1 ? HALF_PI : -HALF_PI, d: 0 }
		}
		throw new RangeError(
			`arcsin derivative is undefined/infinite at v=${v} when derivative d=${d} is non-zero`
		)
	}

	if (v === 0) {
		return { v: 0, d: d === 0 ? 0 : d }
	}

	const absV = v < 0 ? -v : v
	let primalAbs
	if (absV <= 0.5) {
		primalAbs = arcsinSmallIterative(absV)
	} else {
		const reduced = sqrtIterative((1 - absV) * 0.5)
		primalAbs = HALF_PI - 2 * arcsinSmallIterative(reduced)
	}

	const primal = v < 0 ? -primalAbs : primalAbs

	if (d === 0) {
		return { v: primal, d: 0 }
	}

	// Use (1 - |v|) * (1 + |v|) instead of 1 - v * v to avoid catastrophic cancellation near |v| = 1.
	const denom = sqrtIterative((1 - absV) * (1 + absV))
	const deriv = d / denom

	if (!Number.isFinite(deriv)) {
		throw new RangeError(`arcsin derivative overflowed to a non-finite value at v=${v}, d=${d}`)
	}

	return { v: primal, d: deriv }
}
