/**
 * Exact rational arithmetic addition using recursive Euclidean GCD reduction
 * and recursive divide-and-conquer pairwise summation (O(log n) recursion depth).
 *
 * Rationals are represented as plain objects `{ num: bigint, den: bigint }`
 * and always returned normalized in lowest terms with `den > 0n` (and
 * `{ num: 0n, den: 1n }` for zero).
 *
 * @module ops/arithmetic/addRationalRecursive
 */

/**
 * @typedef {Object} Rational
 * @property {bigint} num - Exact integer numerator.
 * @property {bigint} den - Non-zero exact integer denominator.
 */

/**
 * Return the absolute value of a BigInt.
 *
 * @param {bigint} value
 * @returns {bigint}
 */
function absBigInt(value) {
	return value < 0n ? -value : value
}

/**
 * Compute the greatest common divisor of two non-negative BigInts
 * using the recursive Euclidean algorithm.
 *
 * @param {bigint} a - Non-negative BigInt.
 * @param {bigint} b - Non-negative BigInt.
 * @returns {bigint} Non-negative GCD of `a` and `b`.
 */
function gcdRecursive(a, b) {
	return b === 0n ? a : gcdRecursive(b, a % b)
}

/**
 * Validate a rational operand and normalize it to lowest terms with `den > 0n`.
 *
 * @param {unknown} value - Candidate rational object.
 * @param {string} label - Context label for error messages.
 * @returns {Rational} Normalized rational in lowest terms.
 * @throws {TypeError} If `value` is not a rational object with BigInt `num` and `den`.
 * @throws {RangeError} If `value.den === 0n`.
 */
function validateAndNormalize(value, label) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${label} must be a rational object { num: bigint, den: bigint }`)
	}

	const { num, den } = value
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label} must have bigint 'num' and 'den' properties`)
	}

	if (den === 0n) {
		throw new RangeError(`${label} denominator must not be zero`)
	}

	if (num === 0n) {
		return { num: 0n, den: 1n }
	}

	const signedNum = den < 0n ? -num : num
	const positiveDen = den < 0n ? -den : den
	const divisor = gcdRecursive(absBigInt(signedNum), positiveDen)

	return {
		num: signedNum / divisor,
		den: positiveDen / divisor,
	}
}

/**
 * Add two already-normalized rationals and return the normalized sum in lowest terms.
 * Uses Knuth's two-GCD formulation (TAOCP Vol. 2, §4.5.1) with recursive Euclidean GCD
 * to keep intermediate BigInt products compact.
 *
 * @param {Rational} a - Normalized rational with `a.den > 0n`.
 * @param {Rational} b - Normalized rational with `b.den > 0n`.
 * @returns {Rational} Normalized sum `a + b` in lowest terms.
 */
function addNormalizedPair(a, b) {
	if (a.num === 0n) {
		return { num: b.num, den: b.den }
	}
	if (b.num === 0n) {
		return { num: a.num, den: a.den }
	}

	const d1 = gcdRecursive(a.den, b.den)
	const aDenReduced = a.den / d1
	const bDenReduced = b.den / d1

	const num = a.num * bDenReduced + b.num * aDenReduced
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}

	const d2 = gcdRecursive(absBigInt(num), d1)
	return {
		num: num / d2,
		den: aDenReduced * (b.den / d2),
	}
}

/**
 * Recursively sum a slice `items[start..end)` via divide-and-conquer pairwise summation.
 * Achieves O(log n) call stack depth and keeps intermediate denominators balanced.
 *
 * @param {readonly unknown[]} items - Sequence of candidate rationals.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @param {string} prefix - Label prefix for validation error reporting.
 * @returns {Rational} Normalized sum in lowest terms.
 */
function sumRangeRecursive(items, start, end, prefix) {
	const count = end - start
	if (count === 0) {
		return { num: 0n, den: 1n }
	}
	if (count === 1) {
		if (!(start in items)) {
			throw new TypeError(`${prefix}[${start}] must be a rational object { num: bigint, den: bigint }`)
		}
		return validateAndNormalize(items[start], `${prefix}[${start}]`)
	}

	const mid = start + Math.floor(count / 2)
	const left = sumRangeRecursive(items, start, mid, prefix)
	const right = sumRangeRecursive(items, mid, end, prefix)
	return addNormalizedPair(left, right)
}

/**
 * Add exact rationals represented as `{ num: bigint, den: bigint }` and return
 * the exact sum normalized in lowest terms with `den > 0n` (and `{ num: 0n, den: 1n }`
 * for zero).
 *
 * Supports:
 * - Two rationals: `addRationalRecursive(a, b)`
 * - Variadic rationals: `addRationalRecursive(r1, r2, r3, ...)` (or single rational normalization)
 * - An array of rationals: `addRationalRecursive([r1, r2, ...])` (empty array returns `{ num: 0n, den: 1n }`)
 *
 * Reduction uses the recursive Euclidean GCD algorithm, and multi-operand summation
 * uses recursive divide-and-conquer pairwise summation (O(log n) recursion depth).
 *
 * @param {Rational | readonly Rational[]} first - First rational or an array of rationals.
 * @param {...Rational} rest - Additional rationals when not passing an array.
 * @returns {Rational} Normalized sum `{ num: bigint, den: bigint }` in lowest terms.
 * @throws {TypeError} If called with no arguments, invalid argument shapes, or non-BigInt fields.
 * @throws {RangeError} If any rational has a zero denominator (`den === 0n`).
 */
export function addRationalRecursive(...args) {
	if (args.length === 0) {
		throw new TypeError('addRationalRecursive requires at least one rational argument or an array of rationals')
	}

	if (args.length === 1 && Array.isArray(args[0])) {
		const list = args[0]
		return sumRangeRecursive(list, 0, list.length, 'rationals')
	}

	if (args.length === 2) {
		const left = validateAndNormalize(args[0], 'argument 0')
		const right = validateAndNormalize(args[1], 'argument 1')
		return addNormalizedPair(left, right)
	}

	return sumRangeRecursive(args, 0, args.length, 'argument')
}
