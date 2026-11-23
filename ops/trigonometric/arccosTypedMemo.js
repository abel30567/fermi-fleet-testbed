/**
 * Precomputed uniform dyadic grid resolution for exact table lookups in [-1, 1].
 * Because 1024 is a power of two, every grid point k / 1024 is exact in IEEE-754
 * binary64 arithmetic, allowing exact O(1) table hits without interpolation error.
 */
const GRID_SCALE = 1024
const TABLE_LENGTH = GRID_SCALE * 2 + 1
const MAX_MEMO_SIZE = 4096

/** @type {Float64Array} */
const PRECOMPUTED_TABLE = new Float64Array(TABLE_LENGTH)
for (let i = 0; i < TABLE_LENGTH; i++) {
	PRECOMPUTED_TABLE[i] = Math.acos((i - GRID_SCALE) / GRID_SCALE)
}

/** @type {Map<number, number>} */
const memoCache = new Map()

/**
 * Computes the element-wise inverse cosine (arccos, in radians in [0, π])
 * over a `Float64Array` using a precomputed dyadic lookup table and bounded
 * memoization cache for non-grid values.
 *
 * Out-of-domain values (`x < -1`, `x > 1`, or `NaN`) map to `NaN`.
 * Does not mutate the input array.
 *
 * @param {Float64Array} input - Input values in the domain [-1, 1].
 * @returns {Float64Array} A new `Float64Array` containing `arccos(x)` in radians for each element.
 * @throws {TypeError} If `input` is not a `Float64Array`.
 */
export function arccosTypedMemo(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('arccosTypedMemo requires a Float64Array input')
	}

	const len = input.length
	const out = new Float64Array(len)

	for (let i = 0; i < len; i++) {
		const x = input[i]

		if (!(x >= -1 && x <= 1)) {
			out[i] = Number.NaN
			continue
		}

		const scaled = x * GRID_SCALE
		const idx = Math.trunc(scaled)
		if (scaled === idx) {
			out[i] = PRECOMPUTED_TABLE[idx + GRID_SCALE]
			continue
		}

		let cached = memoCache.get(x)
		if (cached === undefined) {
			cached = Math.acos(x)
			if (memoCache.size >= MAX_MEMO_SIZE) {
				const oldestKey = memoCache.keys().next().value
				memoCache.delete(oldestKey)
			}
			memoCache.set(x, cached)
		}
		out[i] = cached
	}

	return out
}
