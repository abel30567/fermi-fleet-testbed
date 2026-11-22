/**
 * Three-part Cody-Waite split of π / 2 for accurate range reduction.
 *
 * `HALF_PI_1` and `HALF_PI_2` have 28 and 29 trailing zero mantissa bits
 * respectively, so `q * HALF_PI_1` and `q * HALF_PI_2` are exact in IEEE-754
 * float64 for |q| < 2^28 (|x| < ~4.2e8).
 */
const HALF_PI = Math.PI / 2
const HALF_PI_1 = 1.5707963109016418 // 26353589 * 2^-24
const HALF_PI_2 = 1.5893252935939017e-8 // 4473545 * 2^-48
const HALF_PI_3 = 1.837589179357618e-15 // residual to ~102 bits of π / 2

/**
 * Maximum number of Taylor series iterations.
 * On [-π / 4, π / 4], both sin and cos converge to float64 precision in ~9 terms.
 */
const MAX_ITERATIONS = 64

/**
 * Computes `sin(r)` and `cos(r)` simultaneously using straightforward
 * iterative Taylor series expansions around 0:
 *
 *   sin(r) = sum_{n=0..∞} (-1)^n * r^(2n+1) / (2n+1)!
 *   cos(r) = sum_{n=0..∞} (-1)^n * r^(2n)   / (2n)!
 *
 * @param {number} r - Reduced angle in radians, expected in [-π / 4, π / 4].
 * @returns {{ sin: number, cos: number }} Approximated sine and cosine values.
 */
function sinCosTaylorIterative(r) {
	const r2 = r * r

	let sinSum = r
	let sinTerm = r

	let cosSum = 1
	let cosTerm = 1

	for (let n = 1; n <= MAX_ITERATIONS; n++) {
		const twoN = 2 * n
		sinTerm = (-sinTerm * r2) / (twoN * (twoN + 1))
		cosTerm = (-cosTerm * r2) / ((twoN - 1) * twoN)

		const nextSin = sinSum + sinTerm
		const nextCos = cosSum + cosTerm

		if (nextSin === sinSum && nextCos === cosSum) {
			break
		}

		sinSum = nextSin
		cosSum = nextCos
	}

	return { sin: sinSum, cos: cosSum }
}

/**
 * Computes the trigonometric tangent of an angle in radians over IEEE-754
 * float64 Numbers using a straightforward iterative implementation.
 *
 * Algorithm:
 * 1. Validate input (`TypeError` on non-number; `NaN` for `NaN` and `±Infinity`;
 *    preserve signed zero `±0`).
 * 2. Perform Cody-Waite range reduction modulo `π / 2`, which reduces `x`
 *    modulo `π` into `[-π / 2, π / 2]` and folds `|r| > π / 4` into
 *    `[-π / 4, π / 4]` to avoid catastrophic cancellation near asymptotes
 *    `(2k + 1) * π / 2`.
 * 3. Evaluate `sin(r)` and `cos(r)` via iterative Taylor series and return
 *    `sin(r) / cos(r)` for even quadrants or `-cos(r) / sin(r)` for odd
 *    quadrants (using `tan(π / 2 + r) = -cot(r)`).
 *
 * @param {number} x - Angle in radians (IEEE-754 float64).
 * @returns {number} The tangent of `x`, or `NaN` if `x` is `NaN` or infinite.
 * @throws {TypeError} If `x` is not of type `number`.
 */
export function tanFloatIterative(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`Expected x to be a number, got ${typeof x}`)
	}

	if (!Number.isFinite(x)) {
		return Number.NaN
	}

	if (x === 0) {
		return x
	}

	const q = Math.round(x / HALF_PI)
	const r = x - q * HALF_PI_1 - q * HALF_PI_2 - q * HALF_PI_3

	const { sin, cos } = sinCosTaylorIterative(r)

	// Even multiples of π/2: tan(kπ + r) = tan(r) = sin(r) / cos(r)
	// Odd multiples of π/2:  tan(kπ + π/2 + r) = -cot(r) = -cos(r) / sin(r)
	return q % 2 === 0 ? sin / cos : -cos / sin
}
