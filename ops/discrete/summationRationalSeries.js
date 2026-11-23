/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 * An exact rational number `num / den` represented with `BigInt` fields.
 * Normalized outputs always satisfy `den > 0n` and `gcd(|num|, den) === 1n`
 * (with zero represented uniquely as `{ num: 0n, den: 1n }`).
 */

/**
 * Computes the non-negative greatest common divisor of two BigInts using
 * Euclid's algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
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
 * Validates and normalizes a rational term `{ num, den }` into lowest terms
 * with a strictly positive denominator.
 *
 * @param {unknown} value
 * @returns {Rational}
 */
function validateAndNormalize(value) {
	if (value === null || typeof value !== 'object') {
		throw new TypeError('Each rational term must be a non-null object { num: bigint, den: bigint }')
	}
	const { num, den } = /** @type {{ num?: unknown, den?: unknown }} */ (value)
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError('Rational fields num and den must both be BigInt values')
	}
	if (den === 0n) {
		throw new RangeError('Rational denominator cannot be zero')
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
 * Adds two already-normalized rationals `{ num: a, den: b }` and
 * `{ num: c, den: d }` using Knuth's reduced-cross-multiplication identity
 * (TAOCP Vol. 2, 4.5.1), returning a normalized rational in lowest terms.
 *
 * @param {Rational} left
 * @param {Rational} right
 * @returns {Rational}
 */
function addNormalized(left, right) {
	if (left.num === 0n) return right
	if (right.num === 0n) return left

	const a = left.num
	const b = left.den
	const c = right.num
	const d = right.den

	const g = gcd(b, d)
	if (g === 1n) {
		const num = a * d + c * b
		if (num === 0n) return { num: 0n, den: 1n }
		return { num, den: b * d }
	}

	const bg = b / g
	const dg = d / g
	const num = a * dg + c * bg
	if (num === 0n) return { num: 0n, den: 1n }

	const g2 = gcd(num, g)
	return {
		num: num / g2,
		den: bg * (d / g2),
	}
}

/**
 * Validates an index bound (safe integer number or BigInt) for indexed
 * summation mode.
 *
 * @param {unknown} bound
 * @param {string} name
 * @returns {number | bigint}
 */
function validateBound(bound, name) {
	if (typeof bound === 'bigint') {
		return bound
	}
	if (typeof bound === 'number') {
		if (!Number.isFinite(bound) || !Number.isInteger(bound)) {
			throw new TypeError(`Summation bound "${name}" must be an integer or BigInt`)
		}
		if (!Number.isSafeInteger(bound)) {
			throw new RangeError(`Summation bound "${name}" must be a safe integer or BigInt`)
		}
		return bound
	}
	throw new TypeError(`Summation bound "${name}" must be an integer or BigInt`)
}

/**
 * Pushes a normalized rational into a binary-splitting (pairwise carry-chain)
 * accumulator stack so that `n` terms are combined in a balanced binary tree
 * with `O(log n)` auxiliary space.
 *
 * @param {Array<Rational | null>} slots
 * @param {Rational} term
 */
function pushBalanced(slots, term) {
	let carry = term
	let level = 0
	while (level < slots.length && slots[level] !== null) {
		carry = addNormalized(/** @type {Rational} */ (slots[level]), carry)
		slots[level] = null
		level += 1
	}
	if (level === slots.length) {
		slots.push(carry)
	} else {
		slots[level] = carry
	}
}

/**
 * Collapses the binary-splitting accumulator stack into the final normalized
 * rational sum.
 *
 * @param {Array<Rational | null>} slots
 * @returns {Rational}
 */
function collapseBalanced(slots) {
	/** @type {Rational} */
	let total = { num: 0n, den: 1n }
	for (let i = 0; i < slots.length; i += 1) {
		const slot = slots[i]
		if (slot !== null) {
			total = addNormalized(total, slot)
		}
	}
	return total
}

/**
 * Computes the exact discrete summation over rationals `{ num: bigint, den: bigint }`
 * using balanced pairwise (binary-splitting) rational reduction and returns
 * the sum normalized in lowest terms (`den > 0n` and `gcd(|num|, den) === 1n`).
 *
 * Supports two calling conventions:
 * 1. Iterable mode: `summationRationalSeries(terms)` where `terms` is an array
 *    or iterable (excluding strings) of `{ num: bigint, den: bigint }` rationals.
 * 2. Indexed term-function mode: `summationRationalSeries(termFn, start, end)`
 *    computing `sum_{k = start}^{end} termFn(k)`. Bounds may be safe integer
 *    `number`s or `bigint`s (if either bound is `bigint`, `termFn` receives
 *    `bigint` indices; otherwise it receives `number` indices). If `start > end`,
 *    the empty sum `{ num: 0n, den: 1n }` is returned.
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
 * @param {bigint | number} start
 * @param {bigint | number} end
 * @returns {Rational}
 *
 * @param {Iterable<Rational> | ((k: any) => Rational)} termsOrFn
 * @param {number | bigint} [start]
 * @param {number | bigint} [end]
 * @returns {Rational}
 */
export function summationRationalSeries(termsOrFn, start, end) {
	/** @type {Array<Rational | null>} */
	const slots = []

	if (typeof termsOrFn === 'function') {
		if (arguments.length < 3) {
			throw new TypeError('Indexed summation requires (termFn, start, end)')
		}
		const validStart = validateBound(start, 'start')
		const validEnd = validateBound(end, 'end')

		if (typeof validStart === 'bigint' || typeof validEnd === 'bigint') {
			const s = BigInt(validStart)
			const e = BigInt(validEnd)
			for (let k = s; k <= e; k += 1n) {
				pushBalanced(slots, validateAndNormalize(termsOrFn(k)))
			}
		} else {
			for (let k = validStart; k <= validEnd; k += 1) {
				pushBalanced(slots, validateAndNormalize(termsOrFn(k)))
			}
		}
		return collapseBalanced(slots)
	}

	if (arguments.length > 1) {
		throw new TypeError('Iterable summation accepts a single iterable argument')
	}

	if (
		termsOrFn === null ||
		termsOrFn === undefined ||
		typeof termsOrFn === 'string' ||
		typeof termsOrFn !== 'object' ||
		typeof /** @type {any} */ (termsOrFn)[Symbol.iterator] !== 'function'
	) {
		throw new TypeError('First argument must be an iterable of rationals or a term function')
	}

	for (const item of /** @type {Iterable<unknown>} */ (termsOrFn)) {
		pushBalanced(slots, validateAndNormalize(item))
	}
	return collapseBalanced(slots)
}
