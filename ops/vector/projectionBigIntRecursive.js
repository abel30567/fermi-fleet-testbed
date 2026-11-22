/**
 * Fixed-point scale factor (10^18) for non-integer vector projection results.
 * @type {bigint}
 */
export const SCALE = 10n ** 18n

/**
 * Exact BigInt division rounded to nearest integer with ties-to-even (banker's rounding).
 * Assumes `den > 0n`.
 *
 * @param {bigint} num - Exact rational numerator.
 * @param {bigint} den - Exact positive rational denominator (`den > 0n`).
 * @returns {bigint} Nearest integer to `num / den` (ties to even), exact to <= 0.5 ULP.
 */
function divRoundHalfToEven(num, den) {
	const q = num / den
	const r = num % den
	if (r === 0n) return q

	const absR = r < 0n ? -r : r
	const twiceR = absR * 2n
	if (twiceR > den) {
		return num >= 0n ? q + 1n : q - 1n
	}
	if (twiceR === den && (q & 1n) !== 0n) {
		return num >= 0n ? q + 1n : q - 1n
	}
	return q
}

/**
 * Divide-and-conquer validation and simultaneous computation of `u · v` and `v · v`
 * over the half-open index range `[start, end)`.
 *
 * Recursion depth is O(log n), avoiding stack overflow on large vectors.
 *
 * @param {readonly bigint[]} u - Source vector being projected.
 * @param {readonly bigint[]} v - Target vector being projected onto.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index (`start < end`).
 * @returns {{ dotUV: bigint, dotVV: bigint }} Exact inner products over `[start, end)`.
 * @throws {TypeError} If any entry in `u` or `v` is not a `bigint`.
 */
function dotAndNormSqRecursive(u, v, start, end) {
	if (end - start === 1) {
		const ui = u[start]
		const vi = v[start]
		if (typeof ui !== 'bigint') {
			throw new TypeError(`u[${start}] must be a bigint, got ${typeof ui}`)
		}
		if (typeof vi !== 'bigint') {
			throw new TypeError(`v[${start}] must be a bigint, got ${typeof vi}`)
		}
		return {
			dotUV: ui * vi,
			dotVV: vi * vi,
		}
	}

	const mid = start + ((end - start) >>> 1)
	const left = dotAndNormSqRecursive(u, v, start, mid)
	const right = dotAndNormSqRecursive(u, v, mid, end)
	return {
		dotUV: left.dotUV + right.dotUV,
		dotVV: left.dotVV + right.dotVV,
	}
}

/**
 * Divide-and-conquer computation of the scaled projection components over `[start, end)`.
 *
 * Each component is computed directly from the exact rational expression
 * `(dotUV * v[i] * scale) / dotVV` with ties-to-even rounding, avoiding any
 * intermediate truncation loss (exact to <= 0.5 ULP).
 *
 * @param {readonly bigint[]} v - Target vector being projected onto.
 * @param {bigint} dotUV - Exact inner product `u · v`.
 * @param {bigint} dotVV - Exact squared norm `v · v` (`> 0n`).
 * @param {bigint} scale - Positive fixed-point scale factor.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index (`start < end`).
 * @param {bigint[]} out - Pre-allocated output vector populated in place.
 */
function projectRangeRecursive(v, dotUV, dotVV, scale, start, end, out) {
	if (end - start === 1) {
		out[start] = divRoundHalfToEven(dotUV * v[start] * scale, dotVV)
		return
	}

	const mid = start + ((end - start) >>> 1)
	projectRangeRecursive(v, dotUV, dotVV, scale, start, mid, out)
	projectRangeRecursive(v, dotUV, dotVV, scale, mid, end, out)
}

/**
 * Computes the vector projection of `u` onto `v` over exact `BigInt` coordinates,
 * returning a fixed-point `BigInt[]` scaled by `scale` (default `SCALE = 10n ** 18n`):
 *
 *   proj_v(u) = ((u · v) / (v · v)) * v
 *
 * Algorithm:
 *   1. Divide-and-conquer pass over `[0, n)` validates every coordinate and
 *      computes exact `dotUV = u · v` and `dotVV = v · v` in O(n) operations
 *      and O(log n) stack depth.
 *   2. Divide-and-conquer pass over `[0, n)` computes each component directly
 *      from the exact unreduced rational `(dotUV * v[i] * scale) / dotVV`
 *      using ties-to-even rounding, eliminating intermediate precision loss
 *      and guaranteeing <= 0.5 ULP error relative to the exact projection.
 *
 * @param {readonly bigint[]} u - Non-empty array of `bigint` coordinates to project.
 * @param {readonly bigint[]} v - Non-empty target array of `bigint` coordinates (must be non-zero and same length as `u`).
 * @param {bigint} [scale=SCALE] - Positive `bigint` fixed-point scale factor (defaults to `10n ** 18n`).
 * @returns {bigint[]} Projected vector scaled by `scale`.
 * @throws {TypeError} If `u` or `v` is not an Array, any coordinate is not a `bigint`, or `scale` is not a `bigint`.
 * @throws {RangeError} If `u` or `v` is empty, their dimensions differ, `v` is the zero vector, or `scale <= 0n`.
 */
export function projectionBigIntRecursive(u, v, scale = SCALE) {
	if (!Array.isArray(u)) {
		throw new TypeError(`u must be an array of bigints, got ${typeof u}`)
	}
	if (!Array.isArray(v)) {
		throw new TypeError(`v must be an array of bigints, got ${typeof v}`)
	}
	if (typeof scale !== 'bigint') {
		throw new TypeError(`scale must be a bigint, got ${typeof scale}`)
	}
	if (scale <= 0n) {
		throw new RangeError('scale must be a positive bigint')
	}
	if (u.length === 0 || v.length === 0) {
		throw new RangeError('Vectors u and v must be non-empty')
	}
	if (u.length !== v.length) {
		throw new RangeError(
			`Vectors u and v must have the same dimension (got ${u.length} and ${v.length})`
		)
	}

	const { dotUV, dotVV } = dotAndNormSqRecursive(u, v, 0, u.length)
	if (dotVV === 0n) {
		throw new RangeError('Cannot project onto the zero vector')
	}

	const out = new Array(u.length)
	projectRangeRecursive(v, dotUV, dotVV, scale, 0, u.length, out)
	return out
}
