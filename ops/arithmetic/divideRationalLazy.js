/**
 * Exact rational division over `{ num: BigInt, den: BigInt }` values in lowest
 * terms, implemented lazily with ES generators.
 *
 * Rational representation:
 * - Every input rational must be an object `{ num: BigInt, den: BigInt }` with
 *   `den !== 0n`.
 * - Every yielded rational is normalized to lowest terms:
 *   `den > 0n`, `gcd(|num|, den) === 1n`, and zero is `{ num: 0n, den: 1n }`.
 *
 * Supported call forms (always returns a lazy Generator):
 * 1. `divideRationalLazy(rationals)` — single iterable of rationals:
 *    Yields the running left-associative cumulative quotients lazily:
 *    `r_0`, `r_0 / r_1`, `(r_0 / r_1) / r_2`, ...
 *    Yields nothing for an empty iterable.
 * 2. `divideRationalLazy(dividends, divisors)` — two arguments, each either an
 *    iterable of rationals or a single rational `{ num: BigInt, den: BigInt }`:
 *    - `(iterable, iterable)`: pairwise streaming division yielding `a_i / b_i`
 *      until either iterable is exhausted.
 *    - `(iterable, rational)`: broadcasts the scalar divisor, yielding `a_i / b`.
 *    - `(rational, iterable)`: broadcasts the scalar dividend, yielding `a / b_i`.
 *    - `(rational, rational)`: yields the single quotient `a / b`.
 *
 * Laziness guarantees:
 * - Iterable inputs are never materialized into arrays and may be infinite.
 * - Each `.next()` call pulls at most one element from each input iterator.
 * - Early termination (e.g. `break` or `.return()`) cleanly closes underlying
 *   iterators via their `.return()` hook.
 *
 * @typedef {{ num: bigint, den: bigint }} Rational
 */

/**
 * Compute the greatest common divisor of two BigInts (always non-negative).
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
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
 * Normalize `(num, den)` to lowest terms with `den > 0n` and zero as `0n / 1n`.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function normalize(num, den) {
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
 * Validate and normalize a rational object `{ num: BigInt, den: BigInt }`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Rational}
 */
function parseRational(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(
			`Expected ${label} to be a rational object { num: BigInt, den: BigInt }`
		)
	}
	const { num, den } = value
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`Expected ${label}.num and ${label}.den to be BigInts`)
	}
	return normalize(num, den)
}

/**
 * Divide two already-normalized rationals using cross-cancellation to keep
 * intermediate BigInt values small.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function divideNormalized(a, b) {
	if (b.num === 0n) {
		throw new RangeError('Division by zero rational')
	}
	if (a.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const g1 = gcdBigInt(a.num, b.num)
	const g2 = gcdBigInt(a.den, b.den)
	let num = (a.num / g1) * (b.den / g2)
	let den = (a.den / g2) * (b.num / g1)
	if (den < 0n) {
		num = -num
		den = -den
	}
	return { num, den }
}

/**
 * Determine whether a value is a non-string iterable.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isIterable(value) {
	return (
		value !== null &&
		value !== undefined &&
		typeof value !== 'string' &&
		typeof value[Symbol.iterator] === 'function'
	)
}

/**
 * Determine whether a value looks like a rational record `{ num, den }`.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isRationalCandidate(value) {
	return (
		value !== null &&
		typeof value === 'object' &&
		!Array.isArray(value) &&
		'num' in value &&
		'den' in value
	)
}

/**
 * Lazily yield running cumulative quotients `r_0`, `r_0 / r_1`, ...
 *
 * @param {Iterable<Rational>} rationals
 * @returns {Generator<Rational, void, undefined>}
 */
function* cumulativeDivide(rationals) {
	let hasAcc = false
	let acc = null
	for (const item of rationals) {
		const r = parseRational(item, 'rational')
		if (!hasAcc) {
			acc = r
			hasAcc = true
		} else {
			acc = divideNormalized(acc, r)
		}
		yield { num: acc.num, den: acc.den }
	}
}

/**
 * Lazily yield pairwise quotients `a_i / b_i` from two iterables.
 *
 * @param {Iterable<Rational>} dividends
 * @param {Iterable<Rational>} divisors
 * @returns {Generator<Rational, void, undefined>}
 */
function* pairwiseDivide(dividends, divisors) {
	const iterA = dividends[Symbol.iterator]()
	const iterB = divisors[Symbol.iterator]()
	let aDone = false
	let bDone = false
	try {
		while (true) {
			const nextA = iterA.next()
			if (nextA.done) {
				aDone = true
				break
			}
			const nextB = iterB.next()
			if (nextB.done) {
				bDone = true
				break
			}
			const a = parseRational(nextA.value, 'dividend')
			const b = parseRational(nextB.value, 'divisor')
			yield divideNormalized(a, b)
		}
	} finally {
		try {
			if (!aDone && typeof iterA.return === 'function') {
				iterA.return()
			}
		} finally {
			if (!bDone && typeof iterB.return === 'function') {
				iterB.return()
			}
		}
	}
}

/**
 * Lazily divide each rational in an iterable by a scalar rational divisor.
 *
 * @param {Iterable<Rational>} dividends
 * @param {Rational} divisor
 * @returns {Generator<Rational, void, undefined>}
 */
function* divideIterableByScalar(dividends, divisor) {
	for (const item of dividends) {
		const a = parseRational(item, 'dividend')
		yield divideNormalized(a, divisor)
	}
}

/**
 * Lazily divide a scalar rational dividend by each rational in an iterable.
 *
 * @param {Rational} dividend
 * @param {Iterable<Rational>} divisors
 * @returns {Generator<Rational, void, undefined>}
 */
function* divideScalarByIterable(dividend, divisors) {
	for (const item of divisors) {
		const b = parseRational(item, 'divisor')
		yield divideNormalized(dividend, b)
	}
}

/**
 * Yield a single quotient from two scalar rationals.
 *
 * @param {Rational} dividend
 * @param {Rational} divisor
 * @returns {Generator<Rational, void, undefined>}
 */
function* divideScalarPair(dividend, divisor) {
	yield divideNormalized(dividend, divisor)
}

/**
 * Lazily divide exact rationals `{ num: BigInt, den: BigInt }` in lowest terms.
 *
 * @param {Iterable<Rational> | Rational} dividends - Either a single iterable
 *   of rationals (1-argument cumulative division mode) or the dividend
 *   iterable/rational (2-argument pairwise/broadcast division mode).
 * @param {Iterable<Rational> | Rational} [divisors] - Optional divisor
 *   iterable or scalar rational for 2-argument mode.
 * @returns {Generator<Rational, void, undefined>} Lazy generator yielding
 *   normalized `{ num: BigInt, den: BigInt }` quotients.
 * @throws {TypeError} If argument count is invalid, an expected iterable is
 *   not iterable (or is a string), or a rational object/fields have invalid types.
 * @throws {RangeError} If any rational has `den === 0n` or division by zero
 *   (`divisor.num === 0n`) occurs.
 */
export function divideRationalLazy(dividends, divisors) {
	if (arguments.length === 0 || arguments.length > 2) {
		throw new TypeError('divideRationalLazy expects 1 or 2 arguments')
	}

	if (arguments.length === 1) {
		if (!isIterable(dividends)) {
			throw new TypeError(
				'Expected an iterable of rationals in single-argument mode'
			)
		}
		return cumulativeDivide(dividends)
	}

	const leftIsIterable = isIterable(dividends)
	const rightIsIterable = isIterable(divisors)

	if (leftIsIterable && rightIsIterable) {
		return pairwiseDivide(dividends, divisors)
	}

	if (leftIsIterable && isRationalCandidate(divisors)) {
		const scalarDivisor = parseRational(divisors, 'divisor')
		if (scalarDivisor.num === 0n) {
			throw new RangeError('Division by zero rational')
		}
		return divideIterableByScalar(dividends, scalarDivisor)
	}

	if (isRationalCandidate(dividends) && rightIsIterable) {
		const scalarDividend = parseRational(dividends, 'dividend')
		return divideScalarByIterable(scalarDividend, divisors)
	}

	if (isRationalCandidate(dividends) && isRationalCandidate(divisors)) {
		const scalarDividend = parseRational(dividends, 'dividend')
		const scalarDivisor = parseRational(divisors, 'divisor')
		if (scalarDivisor.num === 0n) {
			throw new RangeError('Division by zero rational')
		}
		return divideScalarPair(scalarDividend, scalarDivisor)
	}

	throw new TypeError(
		'Expected each argument to be an iterable of rationals or a rational object { num: BigInt, den: BigInt }'
	)
}
