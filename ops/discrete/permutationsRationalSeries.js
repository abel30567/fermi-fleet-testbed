/**
 * Computes the greatest common divisor of two BigInt values.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative greatest common divisor.
 */
function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

/**
 * Normalizes a rational number `num / den` into lowest terms with a positive denominator.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
function normalizeRational(num, den) {
	if (den === 0n) {
		throw new RangeError('Rational denominator must not be zero')
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
	const g = gcd(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Validates and normalizes an exact rational object `{ num: BigInt, den: BigInt }`.
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {{ num: bigint, den: bigint }}
 */
function parseRational(value, name) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${name} must be a rational object { num: BigInt, den: BigInt }`)
	}
	const { num, den } = value
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${name}.num and ${name}.den must be BigInt values`)
	}
	if (den === 0n) {
		throw new RangeError(`${name}.den must not be zero`)
	}
	return normalizeRational(num, den)
}

/**
 * Validates and extracts a non-negative integer count `k` from a rational object,
 * BigInt, or safe integer Number.
 *
 * @param {unknown} value
 * @returns {bigint}
 */
function parseNonNegativeInt(value) {
	if (typeof value === 'bigint') {
		if (value < 0n) {
			throw new RangeError('k must be non-negative')
		}
		return value
	}
	if (typeof value === 'number') {
		if (!Number.isSafeInteger(value)) {
			throw new RangeError('k must be a finite safe integer')
		}
		if (value < 0) {
			throw new RangeError('k must be non-negative')
		}
		return BigInt(value)
	}
	if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
		const r = parseRational(value, 'k')
		if (r.den !== 1n) {
			throw new RangeError('k must represent an integer value')
		}
		if (r.num < 0n) {
			throw new RangeError('k must be non-negative')
		}
		return r.num
	}
	throw new TypeError(
		'k must be a non-negative integer (rational { num: BigInt, den: BigInt }, BigInt, or safe integer Number)'
	)
}

/**
 * Computes the discrete k-permutations (falling factorial) P(n, k) = n^(k_falling)
 * over exact rational numbers represented as `{ num: BigInt, den: BigInt }` in lowest terms.
 *
 * Uses closed-form identities for base and vanishing cases (`k = 0`, `k = 1`, and
 * non-negative integer `n < k`), and evaluates the general case via the signed
 * Stirling numbers of the first kind series identity:
 *
 *   P(x, k) = sum_{j=0}^{k} s(k, j) * x^j
 *
 * homogenized over `x = p / q` via Horner's rule:
 *
 *   P(p / q, k) = (sum_{j=0}^{k} s(k, j) * p^j * q^(k - j)) / q^k
 *
 * @param {{ num: bigint, den: bigint }} n - Exact rational base value (need not be pre-reduced).
 * @param {{ num: bigint, den: bigint } | bigint | number} k - Non-negative integer selection count,
 *   accepted as an exact integer rational `{ num: BigInt, den: BigInt }`, a `BigInt`, or a safe integer `Number`.
 * @returns {{ num: bigint, den: bigint }} Exact rational result in lowest terms with `den > 0n`
 *   (and `{ num: 0n, den: 1n }` when zero).
 * @throws {TypeError} If `n` is not `{ num: BigInt, den: BigInt }` or `k` has an invalid type.
 * @throws {RangeError} If any denominator is zero, `k` is negative, non-integer, unsafe, or too large.
 */
export function permutationsRationalSeries(n, k) {
	const x = parseRational(n, 'n')
	const kBig = parseNonNegativeInt(k)

	// Closed-form base cases
	if (kBig === 0n) {
		return { num: 1n, den: 1n }
	}
	if (kBig === 1n) {
		return { num: x.num, den: x.den }
	}

	// Closed-form vanishing identity: for non-negative integer n < k, factor (n - n) = 0
	if (x.den === 1n && x.num >= 0n && kBig > x.num) {
		return { num: 0n, den: 1n }
	}

	if (kBig > BigInt(Number.MAX_SAFE_INTEGER)) {
		throw new RangeError('k exceeds maximum supported series degree')
	}

	const kInt = Number(kBig)

	// Build row k of signed Stirling numbers of the first kind:
	//   s(0, 0) = 1
	//   s(m, j) = s(m - 1, j - 1) - (m - 1) * s(m - 1, j)
	const stirling = new Array(kInt + 1).fill(0n)
	stirling[0] = 1n
	for (let m = 1; m <= kInt; m += 1) {
		const factor = BigInt(m - 1)
		for (let j = m; j >= 1; j -= 1) {
			stirling[j] = stirling[j - 1] - factor * stirling[j]
		}
		stirling[0] = 0n
	}

	// Evaluate sum_{j=0}^{k} s(k, j) * (p / q)^j using homogenized Horner's scheme
	const { num: p, den: q } = x
	let acc = stirling[kInt]
	let qPow = 1n
	for (let j = kInt - 1; j >= 0; j -= 1) {
		qPow *= q
		acc = acc * p + stirling[j] * qPow
	}

	return normalizeRational(acc, qPow)
}
