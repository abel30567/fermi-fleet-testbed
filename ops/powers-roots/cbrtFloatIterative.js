/**
 * Computes the real cube root of an IEEE-754 float64 number using a
 * straightforward iterative Newton-Raphson method with exact power-of-8
 * magnitude scaling.
 *
 * For a positive input `x`, `x` is first scaled by an exact power of `2^3 = 8`
 * into the normalized interval `[1, 8)` so that intermediate squares `y * y`
 * never overflow or underflow, even for subnormals and values near
 * `Number.MAX_VALUE`. Newton-Raphson iteration
 *
 *     y_{k+1} = (2 * y_k + m / (y_k * y_k)) / 3
 *
 * then converges quadratically on `[1, 2)` to full IEEE-754 double precision,
 * and the result is rescaled by the corresponding exact power of `2` with the
 * original sign restored.
 *
 * @param {number} x - The IEEE-754 float64 number whose cube root is computed.
 * @returns {number} The real cube root of `x`, preserving sign (including `-0`),
 *   `Infinity`, `-Infinity`, and `NaN`.
 * @throws {TypeError} If `x` is not a primitive `number`.
 */
export function cbrtFloatIterative(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`Expected a number, got ${x === null ? 'null' : typeof x}`)
	}

	if (Number.isNaN(x) || x === 0 || !Number.isFinite(x)) {
		return x
	}

	const sign = x < 0 ? -1 : 1
	let m = Math.abs(x)
	let expShift = 0

	// Normalize subnormals with an exact power of 2^3 (2^54 = (2^18)^3).
	if (m < 2 ** -1020) {
		m *= 2 ** 54
		expShift -= 18
	}

	// Scale m by exact powers of 8 into [1, 8) without rounding error.
	while (m >= 2 ** 96) {
		m /= 2 ** 96
		expShift += 32
	}
	while (m >= 2 ** 24) {
		m /= 2 ** 24
		expShift += 8
	}
	while (m >= 8) {
		m /= 8
		expShift += 1
	}

	while (m < 2 ** -96) {
		m *= 2 ** 96
		expShift -= 32
	}
	while (m < 2 ** -24) {
		m *= 2 ** 24
		expShift -= 8
	}
	while (m < 1) {
		m *= 8
		expShift -= 1
	}

	// Initial linear approximation on [1, 8) -> [1, 2).
	let y = 1 + (m - 1) / 7
	let prev = NaN
	const maxIterations = 32

	for (let i = 0; i < maxIterations; i++) {
		const next = (2 * y + m / (y * y)) / 3
		if (next === y || next === prev) {
			y = next
			break
		}
		prev = y
		y = next
	}

	return sign * y * (2 ** expShift)
}
