/**
 * Computes the vector projection of `Float64Array` `a` onto a non-zero
 * `Float64Array` `b` using a straightforward iterative algorithm:
 *
 *   proj_b(a) = ((a · b) / (b · b)) * b
 *
 * The computation uses explicit loops with no recursion or external
 * dependencies. When direct inner products overflow or underflow due to
 * extreme element magnitudes, it falls back to a magnitude-scaled iterative
 * formulation `((a/max|a| · b/max|b|) / (b/max|b| · b/max|b|)) * (b/max|b|) * max|a|`
 * to preserve numerical stability.
 *
 * @param {Float64Array} a - The vector to project (must contain finite values).
 * @param {Float64Array} b - The non-zero target vector onto which `a` is projected
 *   (must have the same length as `a` and contain finite values).
 * @returns {Float64Array} A new `Float64Array` containing the projection of `a` onto `b`.
 * @throws {TypeError} If `a` or `b` is not a `Float64Array`.
 * @throws {RangeError} If `a` and `b` have different lengths, are empty, contain
 *   non-finite values (`NaN`, `Infinity`, `-Infinity`), or if `b` is the zero vector.
 */
export function projectionTypedIterative(a, b) {
	if (!(a instanceof Float64Array)) {
		throw new TypeError('Expected parameter "a" to be a Float64Array')
	}
	if (!(b instanceof Float64Array)) {
		throw new TypeError('Expected parameter "b" to be a Float64Array')
	}

	const n = a.length
	if (n !== b.length) {
		throw new RangeError(
			`Vector length mismatch: a.length (${n}) !== b.length (${b.length})`
		)
	}
	if (n === 0) {
		throw new RangeError('Input vectors must be non-empty')
	}

	let dotAB = 0
	let dotBB = 0
	let maxAbsA = 0
	let maxAbsB = 0

	for (let i = 0; i < n; i++) {
		const ai = a[i]
		const bi = b[i]

		if (!Number.isFinite(ai)) {
			throw new RangeError(`Element a[${i}] must be a finite number, got ${ai}`)
		}
		if (!Number.isFinite(bi)) {
			throw new RangeError(`Element b[${i}] must be a finite number, got ${bi}`)
		}

		const absA = Math.abs(ai)
		const absB = Math.abs(bi)
		if (absA > maxAbsA) maxAbsA = absA
		if (absB > maxAbsB) maxAbsB = absB

		dotAB += ai * bi
		dotBB += bi * bi
	}

	if (maxAbsB === 0) {
		throw new RangeError('Target vector "b" must be non-zero')
	}

	const result = new Float64Array(n)

	if (maxAbsA === 0) {
		return result
	}

	const inSafeRange =
		maxAbsA >= 1e-140 &&
		maxAbsA <= 1e140 &&
		maxAbsB >= 1e-140 &&
		maxAbsB <= 1e140

	if (inSafeRange && dotBB > 0 && Number.isFinite(dotBB) && Number.isFinite(dotAB)) {
		const scalar = dotAB / dotBB
		if (Number.isFinite(scalar)) {
			for (let i = 0; i < n; i++) {
				const val = scalar * b[i]
				result[i] = val === 0 ? 0 : val
			}
			return result
		}
	}

	// Magnitude-scaled iterative fallback for extreme vector scales
	let scaledDotAB = 0
	let scaledDotBB = 0
	for (let i = 0; i < n; i++) {
		const sa = a[i] / maxAbsA
		const sb = b[i] / maxAbsB
		scaledDotAB += sa * sb
		scaledDotBB += sb * sb
	}

	const scaledRatio = scaledDotAB / scaledDotBB
	for (let i = 0; i < n; i++) {
		const val = scaledRatio * (b[i] / maxAbsB) * maxAbsA
		result[i] = val === 0 ? 0 : val
	}

	return result
}
