/**
 * @fileoverview Element-wise trigonometric cosine over Float64Array inputs
 * using a precomputed special-angle lookup table and a bounded memoization cache.
 */

/**
 * Maximum number of dynamically memoized angle entries retained in memory.
 * @type {number}
 */
const MAX_MEMO_ENTRIES = 4096

/**
 * Precomputed lookup table mapping canonical non-negative special angles
 * (in radians) to their IEEE-754 double-precision cosine values.
 * Because cosine is an even function, cos(-x) === cos(x), so keys are stored
 * as non-negative magnitudes.
 * @type {Map<number, number>}
 */
const PRECOMPUTED_COS_TABLE = new Map()

const SPECIAL_ANGLES = [
	0,
	Math.PI / 6,
	Math.PI / 4,
	Math.PI / 3,
	Math.PI / 2,
	(2 * Math.PI) / 3,
	(3 * Math.PI) / 4,
	(5 * Math.PI) / 6,
	Math.PI,
	(7 * Math.PI) / 6,
	(5 * Math.PI) / 4,
	(4 * Math.PI) / 3,
	(3 * Math.PI) / 2,
	(5 * Math.PI) / 3,
	(7 * Math.PI) / 4,
	(11 * Math.PI) / 6,
	2 * Math.PI,
]

for (const angle of SPECIAL_ANGLES) {
	PRECOMPUTED_COS_TABLE.set(angle, Math.cos(angle))
}

for (let k = 0; k <= 24; k += 1) {
	const angle = (k * Math.PI) / 12
	if (!PRECOMPUTED_COS_TABLE.has(angle)) {
		PRECOMPUTED_COS_TABLE.set(angle, Math.cos(angle))
	}
}

/**
 * Bounded FIFO memoization cache for computed finite angle magnitudes.
 * @type {Map<number, number>}
 */
const memoCache = new Map()

/**
 * Computes the element-wise trigonometric cosine of a Float64Array of angles
 * (in radians), leveraging a precomputed special-angle table and a bounded
 * memoization cache keyed by angle magnitude.
 *
 * Non-finite elements (`NaN`, `Infinity`, `-Infinity`) yield `NaN` without
 * polluting the memoization cache. The input array is never mutated.
 *
 * @param {Float64Array} input - Input typed array of angles in radians.
 * @returns {Float64Array} A new Float64Array containing `cos(input[i])` for each element.
 * @throws {TypeError} If `input` is not an instance of `Float64Array`.
 */
export function cosTypedMemo(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('cosTypedMemo expects a Float64Array input')
	}

	const len = input.length
	const output = new Float64Array(len)

	for (let i = 0; i < len; i += 1) {
		const x = input[i]
		if (!Number.isFinite(x)) {
			output[i] = Number.NaN
			continue
		}

		// Cosine is even: cos(-x) === cos(x), and Math.abs(-0) === 0.
		const key = Math.abs(x)
		let value = PRECOMPUTED_COS_TABLE.get(key)

		if (value === undefined) {
			value = memoCache.get(key)
			if (value === undefined) {
				value = Math.cos(key)
				if (memoCache.size >= MAX_MEMO_ENTRIES) {
					const oldestKey = memoCache.keys().next().value
					memoCache.delete(oldestKey)
				}
				memoCache.set(key, value)
			}
		}

		output[i] = value
	}

	return output
}
