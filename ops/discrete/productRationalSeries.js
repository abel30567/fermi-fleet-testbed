/**
 * Exact discrete product over rational numbers represented as
 * `{ num: bigint, den: bigint }` in lowest terms (`den > 0n`,
 * `gcd(|num|, den) === 1n`).
 *
 * Uses a balanced binary product tree with cross-cancellation at each
 * multiplication step so intermediate numerators and denominators remain
 * reduced and bit-complexity stays near-linear (`O(M(n) log n)`).
 *
 * @module ops/discrete/productRationalSeries
 */

/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 */

/**
 * Computes the absolute value of a BigInt.
 *
 * @param {bigint} value
 * @returns {bigint}
 */
function absBigInt(value) {
	return value < 0n ? -value : value
}

/**
 * Computes the non-negative greatest common divisor of two BigInts
 * using the iterative Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = absBigInt(a)
	let y = absBigInt(b)
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

/**
 * Validates and normalizes a rational term to lowest terms with `den > 0n`.
 *
 * @param {unknown} term
 * @param {string} label
 * @returns {Rational}
 */
function validateAndNormalize(term, label) {
	if (term === null || typeof term !== 'object') {
		throw new TypeError(`${label} must be an object with bigint { num, den }`)
	}
	const { num, den } = /** @type {Record<string, unknown>} */ (term)
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label} must have bigint num and den properties`)
	}
	if (den === 0n) {
		throw new RangeError(`${label} denominator must not be 0n`)
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
 * Multiplies two already-normalized non-zero rationals using cross-cancellation,
 * preserving lowest terms and positive denominator without an extra final gcd.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function multiplyNormalized(a, b) {
	const g1 = gcdBigInt(a.num, b.den)
	const g2 = gcdBigInt(b.num, a.den)
	return {
		num: (a.num / g1) * (b.num / g2),
		den: (a.den / g2) * (b.den / g1),
	}
}

/**
 * Evaluates the exact product of normalized non-zero rationals using an
 * iterative balanced binary product tree.
 *
 * @param {Rational[]} factors
 * @returns {Rational}
 */
function reduceProductTree(factors) {
	if (factors.length === 0) {
		return { num: 1n, den: 1n }
	}
	let layer = factors
	while (layer.length > 1) {
		/** @type {Rational[]} */
		const next = []
		for (let i = 0; i < layer.length; i += 2) {
			if (i + 1 < layer.length) {
				next.push(multiplyNormalized(layer[i], layer[i + 1]))
			} else {
				next.push(layer[i])
			}
		}
		layer = next
	}
	return layer[0]
}

/**
 * Validates `start` and `end` bounds for the indexed-term overload.
 * Both bounds must either be `bigint` or safe integer `number` values.
 *
 * @param {unknown} start
 * @param {unknown} end
 * @returns {'bigint' | 'number'}
 */
function validateBounds(start, end) {
	if (typeof start === 'bigint' && typeof end === 'bigint') {
		return 'bigint'
	}
	if (typeof start === 'number' && typeof end === 'number') {
		if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
			throw new RangeError('start and end must be safe integers')
		}
		return 'number'
	}
	throw new TypeError('start and end must both be bigint or both be safe integer numbers')
}

/**
 * Computes the exact discrete product over a sequence of rational numbers,
 * returning the result normalized to lowest terms as `{ num: bigint, den: bigint }`
 * with `den > 0n` and `gcd(|num|, den) === 1n`.
 *
 * Supports two calling forms:
 * 1. Iterable of rationals:
 *    `productRationalSeries(terms)`
 *    where `terms` is an iterable (e.g. Array, Generator, Set) of `{ num: bigint, den: bigint }`.
 * 2. Indexed term generator:
 *    `productRationalSeries(termFn, start, end)`
 *    computes `prod_{k=start}^{end} termFn(k)` where `start` and `end` are both `bigint`
 *    or both safe integer `number` values. If `start > end`, returns `{ num: 1n, den: 1n }`.
 *
 * Empty products return the multiplicative identity `{ num: 1n, den: 1n }`.
 * If any term has `num === 0n` (and all remaining terms are valid), returns `{ num: 0n, den: 1n }`.
 *
 * @overload
 * @param {Iterable<Rational>} terms
 * @returns {Rational}
 *
 * @overload
 * @param {(k: number) => Rational} termFn
 * @param {number} start
 * @param {number} end
 * @returns {Rational}
 *
 * @overload
 * @param {(k: bigint) => Rational} termFn
 * @param {bigint} start
 * @param {bigint} end
 * @returns {Rational}
 *
 * @param {Iterable<Rational> | ((k: any) => Rational)} termsOrFn
 * @param {number | bigint} [start]
 * @param {number | bigint} [end]
 * @returns {Rational}
 */
export function productRationalSeries(termsOrFn, start, end) {
	/** @type {Rational[]} */
	const factors = []
	let hasZero = false

	if (typeof termsOrFn === 'function') {
		const mode = validateBounds(start, end)
		if (mode === 'bigint') {
			const s = /** @type {bigint} */ (start)
			const e = /** @type {bigint} */ (end)
			for (let k = s; k <= e; k += 1n) {
				const normalized = validateAndNormalize(termsOrFn(k), `term(${k}n)`)
				if (normalized.num === 0n) {
					hasZero = true
				} else if (!hasZero) {
					factors.push(normalized)
				}
			}
		} else {
			const s = /** @type {number} */ (start)
			const e = /** @type {number} */ (end)
			for (let k = s; k <= e; k += 1) {
				const normalized = validateAndNormalize(termsOrFn(k), `term(${k})`)
				if (normalized.num === 0n) {
					hasZero = true
				} else if (!hasZero) {
					factors.push(normalized)
				}
			}
		}
	} else {
		if (start !== undefined || end !== undefined) {
			throw new TypeError('start and end are only valid when the first argument is a term function')
		}
		if (
			termsOrFn === null ||
			termsOrFn === undefined ||
			typeof termsOrFn === 'string' ||
			typeof /** @type {any} */ (termsOrFn)[Symbol.iterator] !== 'function'
		) {
			throw new TypeError('First argument must be an iterable of rationals or a term function')
		}
		let index = 0
		for (const term of /** @type {Iterable<unknown>} */ (termsOrFn)) {
			const normalized = validateAndNormalize(term, `term[${index}]`)
			if (normalized.num === 0n) {
				hasZero = true
			} else if (!hasZero) {
				factors.push(normalized)
			}
			index += 1
		}
	}

	if (hasZero) {
		return { num: 0n, den: 1n }
	}

	return reduceProductTree(factors)
}
