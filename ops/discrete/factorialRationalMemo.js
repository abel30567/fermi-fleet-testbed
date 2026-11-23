/**
 * @fileoverview Exact rational factorial using a precomputed lookup table (0!..20!)
 * and a dynamically growing memoization cache for larger non-negative integers.
 */

/**
 * Exact rational number represented as a numerator and denominator pair of BigInts.
 * Results are always returned in lowest terms with a positive denominator.
 *
 * @typedef {Object} Rational
 * @property {bigint} num - Integer numerator.
 * @property {bigint} den - Non-zero integer denominator.
 */

/**
 * Precomputed exact BigInt factorials for n = 0 through n = 20.
 * @type {readonly bigint[]}
 */
const PRECOMPUTED_FACTORIALS = Object.freeze([
	1n, // 0!
	1n, // 1!
	2n, // 2!
	6n, // 3!
	24n, // 4!
	120n, // 5!
	720n, // 6!
	5040n, // 7!
	40320n, // 8!
	362880n, // 9!
	3628800n, // 10!
	39916800n, // 11!
	479001600n, // 12!
	6227020800n, // 13!
	87178291200n, // 14!
	1307674368000n, // 15!
	20922789888000n, // 16!
	355687428096000n, // 17!
	6402373705728000n, // 18!
	121645100408832000n, // 19!
	2432902008176640000n, // 20!
]);

/**
 * Dynamically growing memoization table seeded with PRECOMPUTED_FACTORIALS.
 * @type {bigint[]}
 */
const FACTORIAL_MEMO = [...PRECOMPUTED_FACTORIALS];

/**
 * Maximum safe array index supported by the memoization table.
 * @type {bigint}
 */
const MAX_TABLE_INDEX = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * Validates that the input is a well-formed Rational `{num: BigInt, den: BigInt}`
 * representing a non-negative integer, and returns that integer as a BigInt.
 *
 * @param {Rational} r - Candidate rational input.
 * @returns {bigint} Exact non-negative integer value of `r`.
 * @throws {TypeError} If `r` is not a plain-like object with BigInt `num` and `den`.
 * @throws {RangeError} If `r.den === 0n`, `r` is not an integer, `r < 0`, or `r` exceeds safe table bounds.
 */
function extractNonNegativeInteger(r) {
	if (r === null || typeof r !== 'object' || Array.isArray(r)) {
		throw new TypeError('Input must be a rational object { num: BigInt, den: BigInt }');
	}
	const { num, den } = r;
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError('Rational num and den must both be BigInt values');
	}
	if (den === 0n) {
		throw new RangeError('Rational denominator must be non-zero');
	}
	if (num % den !== 0n) {
		throw new RangeError('Factorial is only defined for integer rationals');
	}
	const n = num / den;
	if (n < 0n) {
		throw new RangeError('Factorial is only defined for non-negative integers');
	}
	if (n > MAX_TABLE_INDEX) {
		throw new RangeError('Input integer exceeds maximum memoization table index');
	}
	return n;
}

/**
 * Computes the discrete factorial `n!` over exact rationals `{num: BigInt, den: BigInt}`.
 *
 * Accepts any rational reducible to a non-negative integer `n >= 0` (including unreduced
 * forms and negative denominators, e.g. `{num: 10n, den: 2n}` or `{num: -6n, den: -2n}`),
 * and returns the exact result in lowest terms (`{num: n!, den: 1n}`).
 *
 * Uses a precomputed lookup table for `0! .. 20!` and dynamically grows an internal
 * memoization table for larger `n`.
 *
 * @param {Rational} r - Exact rational representing a non-negative integer `n`.
 * @returns {Rational} Exact factorial `{ num: n!, den: 1n }` in lowest terms.
 * @throws {TypeError} If `r` is not an object with BigInt `num` and `den` properties.
 * @throws {RangeError} If `r.den === 0n`, `r` is not an integer, or `r < 0`.
 */
export function factorialRationalMemo(r) {
	const n = extractNonNegativeInteger(r);
	const idx = Number(n);

	if (idx >= FACTORIAL_MEMO.length) {
		let acc = FACTORIAL_MEMO[FACTORIAL_MEMO.length - 1];
		for (let k = FACTORIAL_MEMO.length; k <= idx; k++) {
			acc *= BigInt(k);
			FACTORIAL_MEMO.push(acc);
		}
	}

	return { num: FACTORIAL_MEMO[idx], den: 1n };
}
