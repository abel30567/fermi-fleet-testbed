/**
 * Iterative sine over dual numbers `{ v, d }`.
 *
 * For a dual number x = v + d·ε (with ε² = 0), forward-mode automatic
 * differentiation gives:
 *   sin(v + d·ε) = sin(v) + (cos(v) · d)·ε
 *
 * Uses Cody–Waite range reduction modulo π/2 to [-π/4, π/4] (with a safe
 * modulo-2π pre-reduction for very large magnitudes) followed by iterative
 * Taylor series accumulation for sin(r) and cos(r), then quadrant sign/swap
 * reconstruction.
 */

const TWO_PI = 2 * Math.PI
const INV_PI_OVER_2 = 2 / Math.PI

// 26-bit Cody–Waite split of π/2 for exact range reduction up to |v| ≈ 2e8
const PI_OVER_2_0 = 1.5707963407039642
const PI_OVER_2_1 = -1.3909067675399456e-8
const PI_OVER_2_2 = 6.123233932053594e-17
const PI_OVER_2_3 = 6.36831716351095e-25

const CODY_WAITE_LIMIT = 2e8
const MAX_TAYLOR_ITERATIONS = 25

/**
 * Computes the sine of a dual number iteratively.
 *
 * @param {{ v: number, d: number }} x - Dual number with finite primal value `v` and derivative `d`.
 * @returns {{ v: number, d: number }} Dual number `{ v: sin(x.v), d: cos(x.v) * x.d }`.
 * @throws {TypeError} If `x` is not a plain-like dual number object or `v`/`d` are not finite numbers.
 */
export function sinDualIterative(x) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('Expected a dual number object { v, d }')
	}

	const { v, d } = x
	if (typeof v !== 'number' || !Number.isFinite(v)) {
		throw new TypeError('Dual number property "v" must be a finite number')
	}
	if (typeof d !== 'number' || !Number.isFinite(d)) {
		throw new TypeError('Dual number property "d" must be a finite number')
	}

	// Range reduction to r in [-π/4, π/4] and quadrant index k
	const reduced = Math.abs(v) > CODY_WAITE_LIMIT ? v % TWO_PI : v
	const k = Math.round(reduced * INV_PI_OVER_2)
	let r = reduced - k * PI_OVER_2_0
	r -= k * PI_OVER_2_1
	r -= k * PI_OVER_2_2
	r -= k * PI_OVER_2_3

	// Iterative Taylor series for sin(r) and cos(r) on |r| <= π/4
	const r2 = r * r
	let sinR = r
	let sinTerm = r
	let cosR = 1
	let cosTerm = 1

	for (let n = 1; n <= MAX_TAYLOR_ITERATIONS; n++) {
		const twoN = 2 * n
		cosTerm = (-cosTerm * r2) / ((twoN - 1) * twoN)
		cosR += cosTerm

		sinTerm = (-sinTerm * r2) / (twoN * (twoN + 1))
		sinR += sinTerm

		if (
			Math.abs(sinTerm) <= Number.EPSILON * Math.abs(sinR) &&
			Math.abs(cosTerm) <= Number.EPSILON * Math.abs(cosR)
		) {
			break
		}
	}

	// Quadrant reconstruction: sin(r + k·π/2) and cos(r + k·π/2)
	const quadrant = ((k % 4) + 4) % 4
	let sinV
	let cosV
	if (quadrant === 0) {
		sinV = sinR
		cosV = cosR
	} else if (quadrant === 1) {
		sinV = cosR
		cosV = -sinR
	} else if (quadrant === 2) {
		sinV = -sinR
		cosV = -cosR
	} else {
		sinV = -cosR
		cosV = sinR
	}

	const deriv = cosV * d
	return {
		v: sinV === 0 ? 0 : sinV,
		d: deriv === 0 ? 0 : deriv,
	}
}
