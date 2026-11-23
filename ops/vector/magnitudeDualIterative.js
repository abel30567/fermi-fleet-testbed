/**
 * @typedef {{ v: number, d: number }} DualNumber
 * A dual number representing a primal value `v` and its forward-mode
 * derivative (tangent) `d`, i.e., `v + dε` with `ε² = 0`.
 */

/**
 * Computes the Euclidean magnitude (L2 norm) of a vector of dual numbers
 * `{ v, d }` using a straightforward iterative implementation.
 *
 * For a vector of dual numbers `x_i = v_i + d_iε`, the magnitude is:
 * - Primal value: `v = sqrt(sum(v_i²))`
 * - Forward-mode derivative: `d = sum(v_i * d_i) / v`
 *
 * Intermediate primal components are scaled by `max_i |v_i|` to prevent
 * spurious floating-point overflow or underflow when squaring very large
 * or very small values.
 *
 * At the zero vector (`v_i = 0` for all `i`):
 * - If all tangents are zero (`d_i = 0`), returns `{ v: 0, d: 0 }`.
 * - If any tangent is non-zero, throws a `RangeError` because the Euclidean
 *   norm is not differentiable at the origin along a non-zero direction.
 *
 * @param {readonly DualNumber[]} vector - Non-empty array of dual numbers `{ v, d }`.
 * @returns {DualNumber} The magnitude as a dual number `{ v, d }`.
 * @throws {TypeError} If `vector` is not an array, or any element is not a
 *   dual number object with numeric `v` and `d` properties.
 * @throws {RangeError} If `vector` is empty, any `v` or `d` is non-finite,
 *   the derivative is undefined at the zero vector with non-zero tangent, or
 *   the resulting value or derivative overflows finite floating-point range.
 */
export function magnitudeDualIterative(vector) {
	if (!Array.isArray(vector)) {
		throw new TypeError('Expected vector to be an array of dual numbers')
	}
	if (vector.length === 0) {
		throw new RangeError('Expected vector to be non-empty')
	}

	let maxAbs = 0
	let hasNonZeroDerivative = false

	for (let i = 0; i < vector.length; i += 1) {
		if (!(i in vector)) {
			throw new TypeError(`Expected dual number object { v, d } at index ${i}`)
		}
		const item = vector[i]
		if (item === null || typeof item !== 'object' || Array.isArray(item)) {
			throw new TypeError(`Expected dual number object { v, d } at index ${i}`)
		}
		const { v, d } = item
		if (typeof v !== 'number' || typeof d !== 'number') {
			throw new TypeError(`Expected numeric properties v and d at index ${i}`)
		}
		if (!Number.isFinite(v) || !Number.isFinite(d)) {
			throw new RangeError(`Expected finite numbers for v and d at index ${i}`)
		}

		const absV = Math.abs(v)
		if (absV > maxAbs) {
			maxAbs = absV
		}
		if (d !== 0) {
			hasNonZeroDerivative = true
		}
	}

	if (maxAbs === 0) {
		if (hasNonZeroDerivative) {
			throw new RangeError(
				'Derivative of vector magnitude is undefined at the zero vector with non-zero tangent',
			)
		}
		return { v: 0, d: 0 }
	}

	let scaledSumSq = 0
	let scaledDot = 0

	for (let i = 0; i < vector.length; i += 1) {
		const { v, d } = vector[i]
		const scaledV = v / maxAbs
		scaledSumSq += scaledV * scaledV
		scaledDot += scaledV * d
	}

	const scaledNorm = Math.sqrt(scaledSumSq)
	const magnitude = maxAbs * scaledNorm
	const rawDerivative = scaledDot / scaledNorm

	if (!Number.isFinite(magnitude) || !Number.isFinite(rawDerivative)) {
		throw new RangeError('Resulting dual magnitude overflowed finite floating-point range')
	}

	// Normalize -0 to +0 for clean deterministic output.
	const derivative = rawDerivative === 0 ? 0 : rawDerivative
	return { v: magnitude, d: derivative }
}
