/**
 * Fixed-point scale factor (10^18) used for non-integer vector projection results.
 * @type {bigint}
 */
export const SCALE = 10n ** 18n

/**
 * Precomputed powers of 10 from 10^0 to 10^18.
 * @type {readonly bigint[]}
 */
const POW10_TABLE = Object.freeze(
	Array.from({ length: 19 }, (_, exp) => 10n ** BigInt(exp)),
)

/**
 * Precomputed exact squares for integer magnitudes in [0, 256].
 * @type {readonly bigint[]}
 */
const SMALL_SQUARE_LIMIT = 256n
const SMALL_SQUARES = Object.freeze(
	Array.from({ length: Number(SMALL_SQUARE_LIMIT) + 1 }, (_, i) => {
		const bi = BigInt(i)
		return bi * bi
	}),
)

/**
 * Precomputed exact inverse scale factors (SCALE / d) for all positive
 * integers d <= 1024 that evenly divide SCALE (10^18 = 2^18 * 5^18).
 * Enables division-free exact projection when b·b is in the table.
 * @type {Map<bigint, bigint>}
 */
const EXACT_INV_SCALE_TABLE = (() => {
	const table = new Map()
	const scale = POW10_TABLE[18]
	for (let d = 1n; d <= 1024n; d++) {
		if (scale % d === 0n) {
			table.set(d, scale / d)
		}
	}
	return table
})()

const MAX_NORM_CACHE_SIZE = 512
const MAX_PROJ_CACHE_SIZE = 1024

/** @type {Map<string, { normSq: bigint, exactInvScale: bigint | null }>} */
const normSqCache = new Map()

/** @type {Map<string, readonly bigint[]>} */
const projectionCache = new Map()

/**
 * Validates that an input is a non-empty array of BigInt values.
 * @param {unknown} vec
 * @param {string} name
 * @returns {readonly bigint[]}
 */
function validateVector(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${name} must be an array of BigInt values`)
	}
	if (vec.length === 0) {
		throw new RangeError(`${name} must be a non-empty vector`)
	}
	for (let i = 0; i < vec.length; i++) {
		if (typeof vec[i] !== 'bigint') {
			throw new TypeError(
				`${name}[${i}] must be a bigint, got ${typeof vec[i]}`,
			)
		}
	}
	return vec
}

/**
 * Builds an unambiguous canonical key for a BigInt vector.
 * @param {readonly bigint[]} vec
 * @returns {string}
 */
function vectorKey(vec) {
	return vec.join(',')
}

/**
 * Computes exact square of a BigInt using the precomputed small-squares table when possible.
 * @param {bigint} x
 * @returns {bigint}
 */
function squareBigInt(x) {
	const absX = x < 0n ? -x : x
	if (absX <= SMALL_SQUARE_LIMIT) {
		return SMALL_SQUARES[Number(absX)]
	}
	return x * x
}

/**
 * Retrieves or computes the squared Euclidean norm (b · b) and any precomputed
 * exact inverse scale factor for target vector b, with bounded LRU memoization.
 * @param {readonly bigint[]} b
 * @param {string} bKey
 * @returns {{ normSq: bigint, exactInvScale: bigint | null }}
 */
function getNormSqEntry(b, bKey) {
	const cached = normSqCache.get(bKey)
	if (cached !== undefined) {
		// Refresh LRU order
		normSqCache.delete(bKey)
		normSqCache.set(bKey, cached)
		return cached
	}

	let normSq = 0n
	for (let i = 0; i < b.length; i++) {
		normSq += squareBigInt(b[i])
	}

	let exactInvScale = EXACT_INV_SCALE_TABLE.get(normSq) ?? null
	if (exactInvScale === null && normSq > 1024n && SCALE % normSq === 0n) {
		exactInvScale = SCALE / normSq
	}

	const entry = { normSq, exactInvScale }
	if (normSqCache.size >= MAX_NORM_CACHE_SIZE) {
		const oldestKey = normSqCache.keys().next().value
		normSqCache.delete(oldestKey)
	}
	normSqCache.set(bKey, entry)
	return entry
}

/**
 * Exact BigInt division with round-half-to-even (banker's rounding).
 * Assumes den > 0n.
 * @param {bigint} num
 * @param {bigint} den
 * @returns {bigint}
 */
function divRoundHalfEven(num, den) {
	const q = num / den
	const r = num % den
	if (r === 0n) return q

	const absR2 = (r < 0n ? -r : r) * 2n
	if (absR2 > den) {
		return num < 0n ? q - 1n : q + 1n
	}
	if (absR2 === den && (q & 1n) !== 0n) {
		return num < 0n ? q - 1n : q + 1n
	}
	return q
}

/**
 * Computes the vector projection of BigInt integer vector `a` onto non-zero
 * BigInt integer vector `b`, returning fixed-point BigInt components scaled
 * by 10^18 (`SCALE`) using round-half-to-even rounding when non-exact.
 *
 * Uses precomputed small-squares and exact inverse-scale lookup tables along
 * with bounded LRU memoization for target squared norms and full projections:
 *
 *   proj_b(a)_i = round_half_even(((a · b) * b_i * 10^18) / (b · b))
 *
 * @param {readonly bigint[]} a - Source vector of exact BigInt integers.
 * @param {readonly bigint[]} b - Non-zero target vector of exact BigInt integers (same length as `a`).
 * @returns {bigint[]} Projected vector with each component scaled by 10^18.
 * @throws {TypeError} If `a` or `b` is not an array of BigInt values.
 * @throws {RangeError} If vectors are empty, have different lengths, or `b` is the zero vector.
 */
export function projectionBigIntMemo(a, b) {
	validateVector(a, 'a')
	validateVector(b, 'b')

	if (a.length !== b.length) {
		throw new RangeError(
			`Vectors must have the same length (got ${a.length} and ${b.length})`,
		)
	}

	const aKey = vectorKey(a)
	const bKey = vectorKey(b)
	const cacheKey = `${aKey}|${bKey}`

	const cached = projectionCache.get(cacheKey)
	if (cached !== undefined) {
		// Refresh LRU order and return a fresh copy to protect cache integrity
		projectionCache.delete(cacheKey)
		projectionCache.set(cacheKey, cached)
		return cached.slice()
	}

	const { normSq, exactInvScale } = getNormSqEntry(b, bKey)
	if (normSq === 0n) {
		throw new RangeError('Cannot project onto the zero vector')
	}

	let dotAB = 0n
	for (let i = 0; i < a.length; i++) {
		dotAB += a[i] * b[i]
	}

	const result = new Array(a.length)
	if (dotAB === 0n) {
		result.fill(0n)
	} else if (exactInvScale !== null) {
		const scaledFactor = dotAB * exactInvScale
		for (let i = 0; i < b.length; i++) {
			result[i] = scaledFactor * b[i]
		}
	} else {
		const scaledDotAB = dotAB * SCALE
		for (let i = 0; i < b.length; i++) {
			result[i] = divRoundHalfEven(scaledDotAB * b[i], normSq)
		}
	}

	const frozen = Object.freeze(result.slice())
	if (projectionCache.size >= MAX_PROJ_CACHE_SIZE) {
		const oldestKey = projectionCache.keys().next().value
		projectionCache.delete(oldestKey)
	}
	projectionCache.set(cacheKey, frozen)

	return result
}
