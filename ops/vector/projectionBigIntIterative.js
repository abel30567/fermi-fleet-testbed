const SCALE = 10n ** 18n

/**
 * Computes the vector projection of `u` onto `v` over exact BigInt vectors,
 * returning fixed-point BigInt components scaled by `10^18`.
 *
 * Uses a straightforward iterative algorithm to compute:
 *   `proj_v(u)[i] = ((u · v) * v[i] * 10^18) / (v · v)`
 *
 * Non-integer results are truncated toward zero by BigInt division at 18 decimal
 * places of precision (`10n ** 18n` fixed-point scale).
 *
 * Time complexity: O(n), where n is the vector dimension.
 * Space complexity: O(n) for the output vector.
 *
 * @param {readonly bigint[]} u - Non-empty vector of BigInt values to be projected.
 * @param {readonly bigint[]} v - Non-empty, non-zero target vector of BigInt values with the same length as `u`.
 * @returns {bigint[]} Projected vector of length `u.length` with fixed-point BigInt components scaled by `10n ** 18n`.
 * @throws {TypeError} If `u` or `v` is not an Array, or if any element is not a `bigint`.
 * @throws {RangeError} If `u` or `v` is empty, their lengths differ, or `v` is the zero vector.
 */
export function projectionBigIntIterative(u, v) {
	if (!Array.isArray(u)) {
		throw new TypeError(`Expected vector u to be an Array, got ${typeof u}`)
	}
	if (!Array.isArray(v)) {
		throw new TypeError(`Expected vector v to be an Array, got ${typeof v}`)
	}

	const n = u.length
	if (n === 0 || v.length === 0) {
		throw new RangeError('Vectors u and v must be non-empty')
	}
	if (n !== v.length) {
		throw new RangeError(
			`Vectors u and v must have equal length (got ${n} and ${v.length})`,
		)
	}

	let dotUV = 0n
	let dotVV = 0n
	for (let i = 0; i < n; i++) {
		const ui = u[i]
		const vi = v[i]
		if (typeof ui !== 'bigint') {
			throw new TypeError(`u[${i}] must be a bigint, got ${typeof ui}`)
		}
		if (typeof vi !== 'bigint') {
			throw new TypeError(`v[${i}] must be a bigint, got ${typeof vi}`)
		}
		dotUV += ui * vi
		dotVV += vi * vi
	}

	if (dotVV === 0n) {
		throw new RangeError('Target vector v must not be the zero vector')
	}

	const result = new Array(n)
	for (let i = 0; i < n; i++) {
		result[i] = (dotUV * v[i] * SCALE) / dotVV
	}

	return result
}
