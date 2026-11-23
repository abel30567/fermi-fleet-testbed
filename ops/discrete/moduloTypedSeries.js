/**
 * Computes the element-wise discrete (Knuth floored) modulo of two `Float64Array`
 * inputs using the exact closed-form remainder identity:
 *
 *   mod(a, b) = a - b * floor(a / b)
 *             = (a % b) + (sgn(a % b) !== sgn(b) ? b : 0)   (for a % b !== 0)
 *
 * Computing via the exact IEEE-754 truncated remainder `a % b` and applying the
 * sign-correction shift avoids both precision loss in `b * Math.floor(a / b)`
 * for large magnitudes (`|a| > Number.MAX_SAFE_INTEGER`) and quotient overflow
 * when `|a / b|` exceeds `Number.MAX_VALUE`.
 *
 * For every index `i`:
 * - When `b[i] > 0`, the result satisfies `0 <= out[i] < b[i]`.
 * - When `b[i] < 0`, the result satisfies `b[i] < out[i] <= 0`.
 * - Zero results are normalized to `+0` (never `-0`).
 *
 * @param {Float64Array} a - Dividend series (all elements must be finite).
 * @param {Float64Array} b - Divisor/modulus series (same length as `a`, all elements finite and non-zero).
 * @returns {Float64Array} New `Float64Array` containing the element-wise floored modulo values.
 * @throws {TypeError} If `a` or `b` is not a `Float64Array`.
 * @throws {RangeError} If `a` and `b` have different lengths, contain non-finite values, or `b` contains zero.
 */
export function moduloTypedSeries(a, b) {
	if (!(a instanceof Float64Array)) {
		throw new TypeError('Expected first argument "a" to be a Float64Array')
	}
	if (!(b instanceof Float64Array)) {
		throw new TypeError('Expected second argument "b" to be a Float64Array')
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Input Float64Arrays must have equal length (received ${a.length} and ${b.length})`
		)
	}

	const n = a.length
	const out = new Float64Array(n)

	for (let i = 0; i < n; i++) {
		const ai = a[i]
		const bi = b[i]

		if (!Number.isFinite(ai)) {
			throw new RangeError(`Non-finite dividend at index ${i}: ${ai}`)
		}
		if (!Number.isFinite(bi)) {
			throw new RangeError(`Non-finite divisor at index ${i}: ${bi}`)
		}
		if (bi === 0) {
			throw new RangeError(`Zero modulus at index ${i} is undefined`)
		}

		const rem = ai % bi
		if (rem === 0) {
			out[i] = 0
			continue
		}

		let r = (rem < 0) !== (bi < 0) ? rem + bi : rem
		// Guard IEEE-754 rounding when rem is infinitesimally below a multiple of bi
		// (e.g., (-1e-17) + 1 === 1), preserving the strict half-open range invariant.
		if (r === bi) {
			r = 0
		}
		out[i] = r === 0 ? 0 : r
	}

	return out
}
