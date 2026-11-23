/**
 * @typedef {Object} Rational
 * @property {bigint} num - Numerator (exact BigInt).
 * @property {bigint} den - Denominator (non-zero exact BigInt; strictly positive in outputs).
 */

/**
 * Size of the precomputed small-integer GCD lookup table.
 * Pairs (a, b) with 0 <= a, b < GCD_TABLE_SIZE are resolved in O(1) via table lookup.
 */
const GCD_TABLE_SIZE = 64

/**
 * Precomputed flat GCD table for small non-negative integers [0, GCD_TABLE_SIZE - 1].
 * Entry at index `a * GCD_TABLE_SIZE + b` holds `BigInt(gcd(a, b))`.
 * @type {BigInt64Array}
 */
const GCD_TABLE = (() => {
	const table = new BigInt64Array(GCD_TABLE_SIZE * GCD_TABLE_SIZE)
	for (let a = 0; a < GCD_TABLE_SIZE; a++) {
		for (let b = 0; b < GCD_TABLE_SIZE; b++) {
			let x = a
			let y = b
			while (y !== 0) {
				const t = x % y
				x = y
				y = t
			}
			table[a * GCD_TABLE_SIZE + b] = BigInt(x)
		}
	}
	return table
})()

const GCD_LIMIT = BigInt(GCD_TABLE_SIZE)

/**
 * Maximum number of entries retained in each memoization table before FIFO eviction.
 */
const MAX_CACHE_ENTRIES = 4096

/**
 * Memoization table mapping canonical vector key `v` -> exact rational `v · v`.
 * @type {Map<string, Rational>}
 */
const normSqCache = new Map()

/**
 * Memoization table mapping canonical pair key `u|v` -> frozen canonical projection vector.
 * @type {Map<string, ReadonlyArray<Readonly<Rational>>>}
 */
const projectionCache = new Map()

/**
 * Computes the absolute value of a BigInt.
 * @param {bigint} x
 * @returns {bigint}
 */
function absBigInt(x) {
	return x < 0n ? -x : x
}

/**
 * Computes gcd(|a|, |b|) using the precomputed small-integer lookup table
 * with Euclidean reduction fallback for larger BigInts.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = absBigInt(a)
	let y = absBigInt(b)
	while (y !== 0n) {
		if (x < GCD_LIMIT && y < GCD_LIMIT) {
			return GCD_TABLE[Number(x) * GCD_TABLE_SIZE + Number(y)]
		}
		const t = x % y
		x = y
		y = t
	}
	return x
}

/**
 * Reduces a numerator and non-zero denominator to lowest terms with a positive denominator.
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function normalizeRational(num, den) {
	if (den === 0n) {
		throw new RangeError('Rational denominator must be non-zero')
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const g = gcdBigInt(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Validates an input vector of rationals and returns its normalized copy and canonical cache key.
 * @param {unknown} vec
 * @param {string} name
 * @returns {{ normalized: Rational[], key: string }}
 */
function validateAndNormalizeVector(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`Vector '${name}' must be an Array of { num: BigInt, den: BigInt }`)
	}
	if (vec.length === 0) {
		throw new RangeError(`Vector '${name}' must be non-empty`)
	}
	const normalized = new Array(vec.length)
	const parts = new Array(vec.length)
	for (let i = 0; i < vec.length; i++) {
		const item = vec[i]
		if (typeof item !== 'object' || item === null) {
			throw new TypeError(`Element ${name}[${i}] must be a non-null rational object`)
		}
		if (typeof item.num !== 'bigint' || typeof item.den !== 'bigint') {
			throw new TypeError(`Element ${name}[${i}] must have BigInt 'num' and 'den' properties`)
		}
		if (item.den === 0n) {
			throw new RangeError(`Element ${name}[${i}] has a zero denominator`)
		}
		const r = normalizeRational(item.num, item.den)
		normalized[i] = r
		parts[i] = `${r.num}/${r.den}`
	}
	return { normalized, key: parts.join(',') }
}

/**
 * Multiplies two already-normalized exact rationals, returning a reduced rational.
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function mulRational(a, b) {
	if (a.num === 0n || b.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const g1 = gcdBigInt(a.num, b.den)
	const g2 = gcdBigInt(b.num, a.den)
	return {
		num: (a.num / g1) * (b.num / g2),
		den: (a.den / g2) * (b.den / g1),
	}
}

/**
 * Adds two already-normalized exact rationals, returning a reduced rational.
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function addRational(a, b) {
	if (a.num === 0n) return b
	if (b.num === 0n) return a
	const g = gcdBigInt(a.den, b.den)
	const left = a.num * (b.den / g)
	const right = b.num * (a.den / g)
	const num = left + right
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	const den = (a.den / g) * b.den
	return normalizeRational(num, den)
}

/**
 * Divides two already-normalized exact rationals (a / b), returning a reduced rational.
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function divRational(a, b) {
	if (b.num === 0n) {
		throw new RangeError('Division by zero rational')
	}
	const recip = b.num < 0n
		? { num: -b.den, den: -b.num }
		: { num: b.den, den: b.num }
	return mulRational(a, recip)
}

/**
 * Computes the exact rational dot product of two normalized vectors of equal length.
 * @param {Rational[]} a
 * @param {Rational[]} b
 * @returns {Rational}
 */
function dotRational(a, b) {
	let acc = { num: 0n, den: 1n }
	for (let i = 0; i < a.length; i++) {
		const prod = mulRational(a[i], b[i])
		if (prod.num !== 0n) {
			acc = addRational(acc, prod)
		}
	}
	return acc
}

/**
 * Inserts an entry into a bounded Map using FIFO eviction when full.
 * @template K, V
 * @param {Map<K, V>} cache
 * @param {K} key
 * @param {V} value
 */
function cacheSet(cache, key, value) {
	if (cache.size >= MAX_CACHE_ENTRIES) {
		const oldestKey = cache.keys().next().value
		cache.delete(oldestKey)
	}
	cache.set(key, value)
}

/**
 * Clones an array of Rational objects so callers cannot mutate cached entries.
 * @param {ReadonlyArray<Readonly<Rational>>} vec
 * @returns {Rational[]}
 */
function cloneVector(vec) {
	const out = new Array(vec.length)
	for (let i = 0; i < vec.length; i++) {
		out[i] = { num: vec[i].num, den: vec[i].den }
	}
	return out
}

/**
 * Computes the exact rational vector projection of `u` onto `v`:
 *   proj_v(u) = ((u · v) / (v · v)) * v
 *
 * Uses a precomputed small-integer GCD lookup table and memoizes both the target
 * vector norm-squared `v · v` and full `(u, v)` projection results keyed by
 * canonical reduced vector representations.
 *
 * @param {ReadonlyArray<Rational>} u - Source vector of exact rationals `{ num: BigInt, den: BigInt }`.
 * @param {ReadonlyArray<Rational>} v - Non-zero target vector of exact rationals `{ num: BigInt, den: BigInt }`.
 * @returns {Rational[]} The projected vector of reduced exact rationals in lowest terms (`den > 0n`).
 * @throws {TypeError} If `u` or `v` is not an array, or any element is not a valid `{ num: BigInt, den: BigInt }` object.
 * @throws {RangeError} If `u` or `v` is empty, lengths differ, any denominator is `0n`, or `v` is the zero vector.
 */
export function projectionRationalMemo(u, v) {
	const normU = validateAndNormalizeVector(u, 'u')
	const normV = validateAndNormalizeVector(v, 'v')

	if (normU.normalized.length !== normV.normalized.length) {
		throw new RangeError(
			`Vectors must have equal length (got u.length=${normU.normalized.length}, v.length=${normV.normalized.length})`,
		)
	}

	const pairKey = `${normU.key}|${normV.key}`
	const cachedProj = projectionCache.get(pairKey)
	if (cachedProj !== undefined) {
		return cloneVector(cachedProj)
	}

	let normSqV = normSqCache.get(normV.key)
	if (normSqV === undefined) {
		normSqV = dotRational(normV.normalized, normV.normalized)
		if (normSqV.num === 0n) {
			throw new RangeError('Cannot project onto the zero vector')
		}
		cacheSet(normSqCache, normV.key, Object.freeze({ num: normSqV.num, den: normSqV.den }))
	}

	const uv = dotRational(normU.normalized, normV.normalized)
	const scalar = divRational(uv, normSqV)

	const frozenResult = new Array(normV.normalized.length)
	for (let i = 0; i < normV.normalized.length; i++) {
		const comp = mulRational(scalar, normV.normalized[i])
		frozenResult[i] = Object.freeze(comp)
	}
	Object.freeze(frozenResult)

	cacheSet(projectionCache, pairKey, frozenResult)
	return cloneVector(frozenResult)
}
