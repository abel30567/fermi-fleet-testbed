/**
 * Exact nth root over rational numbers `{ num: BigInt, den: BigInt }` in lowest terms,
 * using precomputed perfect-power tables, power-residue rejection tables, and bounded
 * LRU memoization.
 *
 * @module ops/powers-roots/nthRootRationalMemo
 */

const MAX_TABLE_DEGREE = 16
const MAX_RATIONAL_CACHE_SIZE = 4096
const MAX_INT_CACHE_SIZE = 8192

/**
 * Pairwise-coprime moduli used for O(1) power-residue rejection filters.
 * Each modulus is <= 65 so its residue bitmask fits cleanly in a small BigInt.
 */
const RESIDUE_MODULI = [64n, 63n, 65n, 11n]

/**
 * Modular exponentiation `(base ** exp) % mod` for non-negative BigInts.
 *
 * @param {bigint} base
 * @param {bigint} exp
 * @param {bigint} mod
 * @returns {bigint}
 */
function modPow(base, exp, mod) {
	let result = 1n
	let b = ((base % mod) + mod) % mod
	let e = exp
	while (e > 0n) {
		if ((e & 1n) === 1n) {
			result = (result * b) % mod
		}
		b = (b * b) % mod
		e >>= 1n
	}
	return result
}

/**
 * Precompute exact integer nth-root lookup tables for small degrees and small bases.
 * For each degree `n` in [2, MAX_TABLE_DEGREE], stores `{ maxPower, roots }` where
 * `roots` maps `k ** n -> k` for `0 <= k <= maxBase`.
 *
 * @returns {Map<bigint, { maxPower: bigint, roots: Map<bigint, bigint> }>}
 */
function buildExactRootTables() {
	const tables = new Map()
	for (let deg = 2; deg <= MAX_TABLE_DEGREE; deg++) {
		const n = BigInt(deg)
		const maxBase = deg === 2 ? 256n : deg === 3 ? 128n : deg === 4 ? 64n : deg <= 8 ? 32n : 16n
		const roots = new Map()
		let maxPower = 0n
		for (let k = 0n; k <= maxBase; k++) {
			const power = k ** n
			roots.set(power, k)
			maxPower = power
		}
		tables.set(n, { maxPower, roots })
	}
	return tables
}

/**
 * Precompute bitmasks of valid nth-power residues modulo each modulus in `RESIDUE_MODULI`.
 *
 * @returns {Map<bigint, Array<{ mod: bigint, mask: bigint }>>}
 */
function buildResidueTables() {
	const tables = new Map()
	for (let deg = 2; deg <= MAX_TABLE_DEGREE; deg++) {
		const n = BigInt(deg)
		const filters = RESIDUE_MODULI.map((mod) => {
			let mask = 0n
			for (let r = 0n; r < mod; r++) {
				mask |= 1n << modPow(r, n, mod)
			}
			return { mod, mask }
		})
		tables.set(n, filters)
	}
	return tables
}

const EXACT_ROOT_TABLES = buildExactRootTables()
const RESIDUE_TABLES = buildResidueTables()
const intRootCache = new Map()
const rationalRootCache = new Map()

/**
 * LRU cache read helper.
 *
 * @template K, V
 * @param {Map<K, V>} cache
 * @param {K} key
 * @returns {{ hit: boolean, value: V | undefined }}
 */
function lruGet(cache, key) {
	if (!cache.has(key)) {
		return { hit: false, value: undefined }
	}
	const value = cache.get(key)
	cache.delete(key)
	cache.set(key, value)
	return { hit: true, value }
}

/**
 * LRU cache write helper with bounded capacity.
 *
 * @template K, V
 * @param {Map<K, V>} cache
 * @param {K} key
 * @param {V} value
 * @param {number} maxSize
 */
function lruSet(cache, key, value, maxSize) {
	if (cache.has(key)) {
		cache.delete(key)
	} else if (cache.size >= maxSize) {
		const oldestKey = cache.keys().next().value
		cache.delete(oldestKey)
	}
	cache.set(key, value)
}

/**
 * Greatest common divisor for BigInts (always non-negative).
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

/**
 * Exact bit length of a positive BigInt `x > 0n`.
 *
 * @param {bigint} x
 * @returns {bigint}
 */
function bitLength(x) {
	const hex = x.toString(16)
	const leadBits = 32 - Math.clz32(parseInt(hex[0], 16))
	return BigInt(hex.length - 1) * 4n + BigInt(leadBits)
}

/**
 * Compute the exact non-negative integer nth root of `x >= 0n` for `n >= 1n`,
 * or return `null` if `x` is not a perfect nth power.
 *
 * Uses precomputed tables for small values, power-residue filters for fast
 * rejection, LRU memoization, and integer Newton's method as the general solver.
 *
 * @param {bigint} x
 * @param {bigint} n
 * @returns {bigint | null}
 */
function exactIntegerNthRoot(x, n) {
	if (n === 1n) return x
	if (x === 0n) return 0n
	if (x === 1n) return 1n

	const table = EXACT_ROOT_TABLES.get(n)
	if (table !== undefined && x <= table.maxPower) {
		const hit = table.roots.get(x)
		return hit === undefined ? null : hit
	}

	const cacheKey = `${x}:${n}`
	const cached = lruGet(intRootCache, cacheKey)
	if (cached.hit) {
		return cached.value
	}

	const bits = bitLength(x)
	// For any x >= 2, the smallest nth power >= 2 is 2^n, which has bitLength n + 1.
	if (bits <= n) {
		lruSet(intRootCache, cacheKey, null, MAX_INT_CACHE_SIZE)
		return null
	}

	const filters = RESIDUE_TABLES.get(n)
	if (filters !== undefined) {
		for (let i = 0; i < filters.length; i++) {
			const { mod, mask } = filters[i]
			if (((mask >> (x % mod)) & 1n) === 0n) {
				lruSet(intRootCache, cacheKey, null, MAX_INT_CACHE_SIZE)
				return null
			}
		}
	}

	// Integer Newton's method starting from strict upper bound 2^ceil(bits / n).
	const nm1 = n - 1n
	let r = 1n << ((bits + nm1) / n)
	while (true) {
		const rNext = (nm1 * r + x / r ** nm1) / n
		if (rNext >= r) {
			break
		}
		r = rNext
	}

	const exact = r ** n === x ? r : null
	lruSet(intRootCache, cacheKey, exact, MAX_INT_CACHE_SIZE)
	return exact
}

/**
 * Validate and normalize the rational input into lowest terms with `den > 0n`.
 *
 * @param {{ num: bigint, den: bigint }} rational
 * @returns {{ num: bigint, den: bigint }}
 */
function normalizeRational(rational) {
	if (
		rational === null ||
		typeof rational !== 'object' ||
		Array.isArray(rational) ||
		typeof rational.num !== 'bigint' ||
		typeof rational.den !== 'bigint'
	) {
		throw new TypeError('rational must be an object { num: BigInt, den: BigInt }')
	}
	if (rational.den === 0n) {
		throw new RangeError('rational denominator must not be zero')
	}

	let { num, den } = rational
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	if (den < 0n) {
		num = -num
		den = -den
	}
	const g = gcdBigInt(num, den)
	return { num: num / g, den: den / g }
}

/**
 * Validate and normalize the root degree `n` to a positive BigInt.
 *
 * @param {number | bigint} n
 * @returns {bigint}
 */
function normalizeDegree(n) {
	if (typeof n === 'bigint') {
		if (n < 1n) {
			throw new RangeError('root degree n must be a positive integer (>= 1)')
		}
		return n
	}
	if (typeof n === 'number') {
		if (!Number.isInteger(n)) {
			throw new TypeError('root degree n must be an integer or BigInt')
		}
		if (!Number.isSafeInteger(n)) {
			throw new RangeError('root degree n exceeds safe integer precision; pass a BigInt instead')
		}
		if (n < 1) {
			throw new RangeError('root degree n must be a positive integer (>= 1)')
		}
		return BigInt(n)
	}
	throw new TypeError('root degree n must be an integer or BigInt')
}

/**
 * Compute the exact real nth root of a rational number represented as
 * `{ num: BigInt, den: BigInt }`, returning the result in lowest terms with a
 * positive denominator (`den > 0n`).
 *
 * The implementation is table-driven and memoized:
 * - Precomputes exact nth-root lookup tables for small bases and degrees `2..16`.
 * - Precomputes power-residue bitmask tables modulo `{64, 63, 65, 11}` for O(1)
 *   rejection of non-powers before running integer Newton's method.
 * - Memoizes both normalized rational root queries and integer root subproblems
 *   in bounded LRU caches.
 *
 * @param {{ num: bigint, den: bigint }} rational - Exact rational input `{ num, den }`.
 *   Need not be pre-reduced; it is normalized to lowest terms before taking the root.
 * @param {number | bigint} n - Positive integer root degree (`n >= 1`).
 * @returns {{ num: bigint, den: bigint }} Exact nth root in lowest terms with `den > 0n`.
 * @throws {TypeError} If `rational` is not `{ num: BigInt, den: BigInt }` or `n` is not an integer/BigInt.
 * @throws {RangeError} If `den === 0n`, `n < 1`, `n` is an unsafe number, taking an even root
 *   of a negative rational, or the rational does not have an exact rational nth root.
 */
export function nthRootRationalMemo(rational, n) {
	const { num, den } = normalizeRational(rational)
	const degree = normalizeDegree(n)

	if (degree === 1n) {
		return { num, den }
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	if (num < 0n && (degree & 1n) === 0n) {
		throw new RangeError('cannot compute even root of a negative rational')
	}

	const cacheKey = `${num}/${den}:${degree}`
	const cached = lruGet(rationalRootCache, cacheKey)
	if (cached.hit) {
		if (cached.value === null) {
			throw new RangeError(`rational ${num}/${den} does not have an exact rational ${degree}th root`)
		}
		return { num: cached.value.num, den: cached.value.den }
	}

	const absNum = num < 0n ? -num : num
	const rootNum = exactIntegerNthRoot(absNum, degree)
	if (rootNum === null) {
		lruSet(rationalRootCache, cacheKey, null, MAX_RATIONAL_CACHE_SIZE)
		throw new RangeError(`rational ${num}/${den} does not have an exact rational ${degree}th root`)
	}

	const rootDen = exactIntegerNthRoot(den, degree)
	if (rootDen === null) {
		lruSet(rationalRootCache, cacheKey, null, MAX_RATIONAL_CACHE_SIZE)
		throw new RangeError(`rational ${num}/${den} does not have an exact rational ${degree}th root`)
	}

	const result = { num: num < 0n ? -rootNum : rootNum, den: rootDen }
	lruSet(rationalRootCache, cacheKey, result, MAX_RATIONAL_CACHE_SIZE)
	return { num: result.num, den: result.den }
}
