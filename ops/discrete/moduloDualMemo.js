/**
 * Precomputed bounds for the integer quotient/remainder lookup table.
 * Covers integer dividends in [TABLE_A_MIN, TABLE_A_MAX] and integer
 * moduli in [TABLE_B_MIN, TABLE_B_MAX].
 */
const TABLE_A_MIN = -64
const TABLE_A_MAX = 64
const TABLE_A_SPAN = TABLE_A_MAX - TABLE_A_MIN + 1
const TABLE_B_MIN = 1
const TABLE_B_MAX = 64
const TABLE_B_SPAN = TABLE_B_MAX - TABLE_B_MIN + 1

const PRECOMPUTED_Q = new Int32Array(TABLE_A_SPAN * TABLE_B_SPAN)
const PRECOMPUTED_R = new Int32Array(TABLE_A_SPAN * TABLE_B_SPAN)

for (let ai = 0; ai < TABLE_A_SPAN; ai++) {
	const av = ai + TABLE_A_MIN
	const rowOffset = ai * TABLE_B_SPAN
	for (let bi = 0; bi < TABLE_B_SPAN; bi++) {
		const bv = bi + TABLE_B_MIN
		const q = Math.floor(av / bv)
		PRECOMPUTED_Q[rowOffset + bi] = q
		PRECOMPUTED_R[rowOffset + bi] = av - q * bv
	}
}

/**
 * Bounded LRU memoization cache mapping canonical dual-pair keys to
 * computed `{ v, d }` results.
 */
const MAX_CACHE_SIZE = 4096
const memoCache = new Map()

/**
 * Normalize negative zero to positive zero.
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Validate a dual number `{ v, d }`.
 * @param {unknown} x
 * @param {string} name
 * @returns {{ v: number, d: number }}
 */
function validateDual(x, name) {
	if (typeof x !== 'object' || x === null) {
		throw new TypeError(`${name} must be a non-null dual number object { v, d }`)
	}
	const { v, d } = x
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError(`${name}.v and ${name}.d must be numbers`)
	}
	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError(`${name}.v and ${name}.d must be finite numbers`)
	}
	return { v: normalizeZero(v), d: normalizeZero(d) }
}

/**
 * Compute discrete floored modulo over dual numbers `{ v, d }`, carrying the
 * forward-mode derivative alongside the value, using a precomputed small-integer
 * lookup table and bounded LRU memoization.
 *
 * For dual numbers `a = a.v + a.d * ε` and `b = b.v + b.d * ε` (`b.v !== 0`):
 *   - `q = Math.floor(a.v / b.v)`
 *   - `v = a.v - q * b.v`
 *   - `d = a.d - q * b.d`
 *
 * Because `q = floor(a / b)` is locally constant wherever `a.v / b.v` is not an
 * integer, `d(a mod b) = da - q * db` almost everywhere (and equals the
 * right-sided derivative at integer quotients).
 *
 * @param {{ v: number, d: number }} a Dividend dual number `{ v, d }`.
 * @param {{ v: number, d: number }} b Modulus dual number `{ v, d }` with `b.v !== 0`.
 * @returns {{ v: number, d: number }} Resulting dual number `{ v, d }`.
 * @throws {TypeError} If `a` or `b` is not a `{ v, d }` object with numeric fields.
 * @throws {RangeError} If any component is non-finite, `b.v === 0`, or the quotient/derivative overflows.
 */
export function moduloDualMemo(a, b) {
	const da = validateDual(a, 'a')
	const db = validateDual(b, 'b')

	if (db.v === 0) {
		throw new RangeError('Modulus b.v must be non-zero')
	}

	const key = `${da.v}|${da.d}|${db.v}|${db.d}`
	const cached = memoCache.get(key)
	if (cached !== undefined) {
		// Refresh LRU recency
		memoCache.delete(key)
		memoCache.set(key, cached)
		return { v: cached.v, d: cached.d }
	}

	let q
	let v

	if (
		Number.isInteger(da.v) &&
		Number.isInteger(db.v) &&
		da.v >= TABLE_A_MIN &&
		da.v <= TABLE_A_MAX &&
		db.v >= TABLE_B_MIN &&
		db.v <= TABLE_B_MAX
	) {
		const idx = (da.v - TABLE_A_MIN) * TABLE_B_SPAN + (db.v - TABLE_B_MIN)
		q = PRECOMPUTED_Q[idx]
		v = PRECOMPUTED_R[idx]
	} else {
		q = Math.floor(da.v / db.v)
		if (!Number.isFinite(q)) {
			throw new RangeError('Quotient overflowed finite range')
		}
		v = normalizeZero(da.v - q * db.v)
	}

	const d = normalizeZero(da.d - q * db.d)
	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError('Result overflowed finite range')
	}

	const entry = { v, d }
	if (memoCache.size >= MAX_CACHE_SIZE) {
		const oldestKey = memoCache.keys().next().value
		memoCache.delete(oldestKey)
	}
	memoCache.set(key, entry)

	return { v, d }
}
