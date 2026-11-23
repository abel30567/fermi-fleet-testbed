/**
 * Discrete factorial (`n!`) over IEEE-754 float64 numbers using a lazily
 * populated, table-driven memoization cache backed by exact `BigInt`
 * arithmetic so every finite result (`0 <= n <= 170`) is correctly rounded
 * to the nearest IEEE-754 binary64 value.
 *
 * @module ops/discrete/factorialFloatMemo
 */

/** Largest non-negative integer whose factorial fits in finite IEEE-754 float64. */
const MAX_FINITE_N = 170

/**
 * Memoization table storing correctly rounded IEEE-754 float64 values of `n!`
 * for `0 <= n <= 170`. Populated lazily on demand.
 */
const MEMO_TABLE = new Float64Array(MAX_FINITE_N + 1)
MEMO_TABLE[0] = 1

/** Highest index currently populated in {@link MEMO_TABLE}. */
let memoizedMax = 0

/** Exact `BigInt` value of `memoizedMax!`, used to extend the table without cumulative rounding drift. */
let lastExactFactorial = 1n

/**
 * Extends {@link MEMO_TABLE} up to `target` (assumed `target <= MAX_FINITE_N`).
 *
 * @param {number} target - Target non-negative integer index (`<= 170`).
 */
function extendMemoTable(target) {
	let exact = lastExactFactorial
	for (let k = memoizedMax + 1; k <= target; k += 1) {
		exact *= BigInt(k)
		MEMO_TABLE[k] = Number(exact)
	}
	lastExactFactorial = exact
	memoizedMax = target
}

/**
 * Computes the discrete factorial `n!` as an IEEE-754 float64 `Number`
 * using a table-driven memoized cache.
 *
 * - For `0 <= n <= 170`, returns the correctly rounded IEEE-754 float64
 *   representation of `n!` (exact for `0 <= n <= 22`).
 * - For integer `n >= 171`, returns `Infinity` due to float64 overflow.
 *
 * @param {number} n - A non-negative finite integer.
 * @returns {number} The factorial `n!` as an IEEE-754 float64 number (`Infinity` for `n >= 171`).
 * @throws {TypeError} If `n` is not of type `number`.
 * @throws {RangeError} If `n` is not a finite non-negative integer (e.g., `NaN`, `±Infinity`, negative, or fractional).
 */
export function factorialFloatMemo(n) {
	if (typeof n !== 'number') {
		throw new TypeError(`Expected a number, got ${typeof n}`)
	}
	if (!Number.isInteger(n) || n < 0) {
		throw new RangeError(`Expected a finite non-negative integer, got ${n}`)
	}
	if (n > MAX_FINITE_N) {
		return Infinity
	}
	if (n > memoizedMax) {
		extendMemoTable(n)
	}
	return MEMO_TABLE[n]
}
