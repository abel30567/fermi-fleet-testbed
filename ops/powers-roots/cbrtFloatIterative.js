/**
 * Computes the cube root of an IEEE-754 float64 number using a straightforward
 * iterative Newton-Raphson method with exact power-of-two range reduction.
 *
 * Range reduction factors any positive finite input `x` as `m * 2^(3k)` with
 * `m` in `[1, 8)`, preventing intermediate overflow for values near
 * `Number.MAX_VALUE` and intermediate underflow for subnormal values near
 * `Number.MIN_VALUE`. Newton-Raphson iteration then solves `y^3 - m = 0` on
 * `[1, 2)` and rescales by `2^k` (which is exact in IEEE-754 float64).
 *
 * Special IEEE-754 values follow standard `cbrt` semantics:
 * - `NaN` -> `NaN`
 * - `+0` -> `+0`, `-0` -> `-0` (sign of zero preserved)
 * - `+Infinity` -> `+Infinity`, `-Infinity` -> `-Infinity`
 * - Negative finite values -> negative cube root (`cbrt(-x) === -cbrt(x)`)
 *
 * @param {number} x - The IEEE-754 float64 input value.
 * @returns {number} The cube root of `x`.
 * @throws {TypeError} If `x` is not a primitive JavaScript `number`.
 */
export function cbrtFloatIterative(x) {
	if (typeof x !== 'number') {
		const received = x === null ? 'null' : typeof x
		throw new TypeError(
			`cbrtFloatIterative expects a number, received ${received}`,
		)
	}

	if (Number.isNaN(x) || x === 0 || !Number.isFinite(x)) {
		return x
	}

	const negative = x < 0
	let m = negative ? -x : x

	// Exact binary range reduction: x = m * 2^(3k), with m in [1, 8).
	// Coarse step uses 2^48 = (2^16)^3; fine step uses 8 = 2^3.
	const COARSE_CUBE = 2 ** 48
	const COARSE_ROOT = 2 ** 16
	const INV_COARSE_CUBE = 2 ** -48

	let scale = 1
	while (m >= COARSE_CUBE) {
		m *= INV_COARSE_CUBE
		scale *= COARSE_ROOT
	}
	while (m >= 8) {
		m *= 0.125
		scale *= 2
	}
	while (m < INV_COARSE_CUBE) {
		m *= COARSE_CUBE
		scale /= COARSE_ROOT
	}
	while (m < 1) {
		m *= 8
		scale *= 0.5
	}

	// Straightforward Newton-Raphson iteration for f(y) = y^3 - m = 0 on [1, 8).
	// Linear interpolation between (1, 1) and (8, 2) gives a good initial guess.
	let y = 1 + (m - 1) / 7
	let prev = NaN
	const MAX_ITERATIONS = 64

	for (let i = 0; i < MAX_ITERATIONS; i++) {
		const next = y - (y - m / (y * y)) / 3
		if (next === y || next === prev) {
			y = next
			break
		}
		prev = y
		y = next
	}

	const result = y * scale
	return negative ? -result : result
}
