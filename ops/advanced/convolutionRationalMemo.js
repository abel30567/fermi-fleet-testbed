/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 */

const SMALL_GCD_LIMIT = 64
const SMALL_GCD_LIMIT_BIG = BigInt(SMALL_GCD_LIMIT)
const MAX_GCD_CACHE_SIZE = 2048
const MAX_RESULT_CACHE_SIZE = 256

/**
 * Precomputed lookup table for gcd(a, b) where 0 <= a, b < SMALL_GCD_LIMIT.
 * Stored as a flat Uint8Array indexed by `a * SMALL_GCD_LIMIT + b`.
 * @type {Uint8Array}
 */
const SMALL_GCD_TABLE = (() => {
	const table = new Uint8Array(SMALL_GCD_LIMIT * SMALL_GCD_LIMIT)
	for (let a = 0; a < SMALL_GCD_LIMIT; a++) {
		for (let b = 0; b < SMALL_GCD_LIMIT; b++) {
			let x = a
			let y = b
			while (y !== 0) {
				const r = x % y
				x = y
				y = r
			}
			table[a * SMALL_GCD_LIMIT + b] = x
		}
	}
	return table
})()

/**
 * Bounded memoization table for non-trivial BigInt GCD computations.
 * @type {Map<string, bigint>}
 */
const gcdMemo = new Map()

/**
 * Bounded LRU memoization table for canonicalized rational convolutions.
 * Stores immutable normalized rational entries; callers always receive fresh clones.
 * @type {Map<string, ReadonlyArray<Readonly<Rational>>>}
 */
const resultMemo = new Map()

/**
 * Compute the non-negative greatest common divisor of two BigInts using the
 * precomputed small-integer GCD table and bounded memoization cache.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b

	if (x < SMALL_GCD_LIMIT_BIG && y < SMALL_GCD_LIMIT_BIG) {
		return BigInt(SMALL_GCD_TABLE[Number(x) * SMALL_GCD_LIMIT + Number(y)])
	}
	if (x === 0n) return y
	if (y === 0n) return x

	const key = x <= y ? `${x},${y}` : `${y},${x}`
	const cached = gcdMemo.get(key)
	if (cached !== undefined) {
		return cached
	}

	while (y !== 0n) {
		if (x < SMALL_GCD_LIMIT_BIG && y < SMALL_GCD_LIMIT_BIG) {
			x = BigInt(SMALL_GCD_TABLE[Number(x) * SMALL_GCD_LIMIT + Number(y)])
			break
		}
		const r = x % y
		x = y
		y = r
	}

	if (gcdMemo.size >= MAX_GCD_CACHE_SIZE) {
		const oldestKey = gcdMemo.keys().next().value
		gcdMemo.delete(oldestKey)
	}
	gcdMemo.set(key, x)
	return x
}

/**
 * Compute the least common multiple of two positive BigInts.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function lcmPositive(a, b) {
	if (a === b) return a
	if (a === 1n) return b
	if (b === 1n) return a
	return (a / gcdBigInt(a, b)) * b
}

/**
 * Reduce a numerator/denominator pair (with positive denominator) to lowest terms.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function reducePositiveDen(num, den) {
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	if (den === 1n) {
		return { num, den: 1n }
	}
	const g = gcdBigInt(num, den)
	return { num: num / g, den: den / g }
}

/**
 * Validate and normalize a rational sequence into canonical lowest-terms objects
 * with strictly positive denominators (`den > 0n`).
 *
 * @param {unknown} seq
 * @param {string} paramName
 * @returns {Rational[]}
 */
function validateAndNormalizeSequence(seq, paramName) {
	if (!Array.isArray(seq)) {
		throw new TypeError(`${paramName} must be an array of { num: bigint, den: bigint } rationals`)
	}

	const len = seq.length
	const normalized = new Array(len)

	for (let i = 0; i < len; i++) {
		if (!(i in seq)) {
			throw new TypeError(`${paramName}[${i}] must be a rational object, got an empty slot`)
		}
		const item = seq[i]
		if (item === null || typeof item !== 'object' || Array.isArray(item)) {
			throw new TypeError(`${paramName}[${i}] must be a non-null object with bigint num and den`)
		}
		const { num, den } = item
		if (typeof num !== 'bigint' || typeof den !== 'bigint') {
			throw new TypeError(`${paramName}[${i}] must have bigint properties "num" and "den"`)
		}
		if (den === 0n) {
			throw new RangeError(`${paramName}[${i}].den must not be 0n`)
		}

		if (num === 0n) {
			normalized[i] = { num: 0n, den: 1n }
		} else if (den < 0n) {
			normalized[i] = reducePositiveDen(-num, -den)
		} else {
			normalized[i] = reducePositiveDen(num, den)
		}
	}

	return normalized
}

/**
 * Serialize a normalized rational sequence for memoization cache keys.
 *
 * @param {Rational[]} seq
 * @returns {string}
 */
function serializeSequence(seq) {
	const parts = new Array(seq.length)
	for (let i = 0; i < seq.length; i++) {
		parts[i] = `${seq[i].num}/${seq[i].den}`
	}
	return parts.join(',')
}

/**
 * Clone a cached rational sequence so caller mutations cannot corrupt memoized state.
 *
 * @param {ReadonlyArray<Readonly<Rational>>} seq
 * @returns {Rational[]}
 */
function cloneRationalSequence(seq) {
	const out = new Array(seq.length)
	for (let i = 0; i < seq.length; i++) {
		out[i] = { num: seq[i].num, den: seq[i].den }
	}
	return out
}

/**
 * Compute the exact discrete linear convolution of two finite sequences of
 * rational numbers using a table-driven, precomputed, and memoized algorithm.
 *
 * Each input and output rational is represented as `{ num: bigint, den: bigint }`.
 * Inputs are validated and canonicalized to lowest terms (`den > 0n`); all output
 * rationals are guaranteed to be in lowest terms with `den > 0n`, and zero is
 * represented canonically as `{ num: 0n, den: 1n }`.
 *
 * For non-empty inputs `a` (length `m`) and `b` (length `n`), the result has
 * length `m + n - 1` with:
 *   `c[k] = sum_{i + j = k} a[i] * b[j]`
 * If either `a` or `b` is empty, an empty array `[]` is returned.
 *
 * Table-driven / memoized optimizations:
 * - Precomputed `64 x 64` small-integer GCD lookup table (`SMALL_GCD_TABLE`).
 * - Bounded memoization of larger BigInt GCD pairs (`gcdMemo`).
 * - Commutative bounded LRU result memoization (`resultMemo`) with defensive cloning.
 * - Precomputed common-denominator integer scaling tables, non-zero index tables,
 *   and per-call numerator-reduction memoization.
 *
 * @param {ReadonlyArray<Rational>} a - First sequence of exact rationals.
 * @param {ReadonlyArray<Rational>} b - Second sequence of exact rationals.
 * @returns {Rational[]} Exact convolution sequence in canonical lowest terms.
 * @throws {TypeError} If `a` or `b` is not an array, contains holes, or has non-rational elements.
 * @throws {RangeError} If any rational element has a zero denominator (`den === 0n`).
 */
export function convolutionRationalMemo(a, b) {
	const normA = validateAndNormalizeSequence(a, 'a')
	const normB = validateAndNormalizeSequence(b, 'b')

	const m = normA.length
	const n = normB.length
	if (m === 0 || n === 0) {
		return []
	}

	const keyA = serializeSequence(normA)
	const keyB = serializeSequence(normB)
	const cacheKey = keyA <= keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`

	const cached = resultMemo.get(cacheKey)
	if (cached !== undefined) {
		// Refresh LRU recency
		resultMemo.delete(cacheKey)
		resultMemo.set(cacheKey, cached)
		return cloneRationalSequence(cached)
	}

	// Precompute least common denominators for each sequence
	let lcmA = 1n
	for (let i = 0; i < m; i++) {
		lcmA = lcmPositive(lcmA, normA[i].den)
	}

	let lcmB = 1n
	for (let j = 0; j < n; j++) {
		lcmB = lcmPositive(lcmB, normB[j].den)
	}

	// Precompute scaled integer numerators and non-zero index tables
	const scaledA = new Array(m)
	const nzA = []
	for (let i = 0; i < m; i++) {
		const val = normA[i].num * (lcmA / normA[i].den)
		scaledA[i] = val
		if (val !== 0n) {
			nzA.push(i)
		}
	}

	const scaledB = new Array(n)
	const nzB = []
	for (let j = 0; j < n; j++) {
		const val = normB[j].num * (lcmB / normB[j].den)
		scaledB[j] = val
		if (val !== 0n) {
			nzB.push(j)
		}
	}

	const outLen = m + n - 1
	const acc = new Array(outLen).fill(0n)

	for (let ai = 0; ai < nzA.length; ai++) {
		const i = nzA[ai]
		const valA = scaledA[i]
		for (let bi = 0; bi < nzB.length; bi++) {
			const j = nzB[bi]
			acc[i + j] += valA * scaledB[j]
		}
	}

	const commonDen = lcmA * lcmB
	const reducedByNum = new Map()
	const stored = new Array(outLen)

	for (let k = 0; k < outLen; k++) {
		const num = acc[k]
		let reduced = reducedByNum.get(num)
		if (reduced === undefined) {
			reduced = Object.freeze(reducePositiveDen(num, commonDen))
			reducedByNum.set(num, reduced)
		}
		stored[k] = reduced
	}

	Object.freeze(stored)

	if (resultMemo.size >= MAX_RESULT_CACHE_SIZE) {
		const oldestKey = resultMemo.keys().next().value
		resultMemo.delete(oldestKey)
	}
	resultMemo.set(cacheKey, stored)

	return cloneRationalSequence(stored)
}
