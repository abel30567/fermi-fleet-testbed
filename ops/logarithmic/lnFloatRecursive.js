/**
 * Natural logarithm (`ln`) over IEEE-754 float64 numbers using a recursive,
 * divide-and-conquer algorithm:
 *
 * 1. **Divide-and-conquer range reduction**: Recursively halves binary exponent
 *    steps (`512 -> 256 -> ... -> 1`) to factor any positive finite float64
 *    `x = m * 2^k` with `m ∈ [√½, √2]` and lossless power-of-two scaling,
 *    handling both subnormals down to `Number.MIN_VALUE` and large values up
 *    to `Number.MAX_VALUE` in `O(log |exponent|)` stack depth.
 * 2. **Divide-and-conquer series evaluation (binary splitting)**: Evaluates
 *    `ln(m) = 2 * atanh(t)` for `t = (m - 1) / (m + 1)` by recursively
 *    splitting the odd-denominator power series `∑ (t^2)^(n-1) / (2n + 1)`
 *    into halves and combining sub-sums with their accumulated powers.
 * 3. **High-precision reconstruction**: Combines `k * ln(2) + ln(m)` using a
 *    Cody–Waite hi/lo split of `ln(2)` so `k * LN2_HI` is exact for all valid
 *    float64 binary exponents `|k| <= 1074`.
 *
 * @module ops/logarithmic/lnFloatRecursive
 */

const SQRT2 = Math.SQRT2;
const SQRT1_2 = Math.SQRT1_2;

// Cody-Waite split of ln(2): LN2_HI has its lower 21 mantissa bits zeroed so
// k * LN2_HI is exact for all |k| <= 1074, and LN2_HI + LN2_LO approximates
// ln(2) to ~85 bits of precision.
const LN2_HI = 6.93147180369123816490e-01;
const LN2_LO = 1.90821492927058770002e-10;

// Upper term index for the atanh tail series: for |t| <= (√2 - 1) / (√2 + 1),
// s = t^2 <= 0.02944, so the first omitted term at n = 14 is < 5e-24 (far
// below float64 machine epsilon).
const SERIES_MAX_TERM = 13;

/**
 * Recursively scales down `x > √2` by powers of two until `m ∈ [√½, √2]`.
 *
 * @param {number} x - Positive finite number `> √2`.
 * @param {number} step - Current binary exponent step (power of two, or 0).
 * @returns {{ m: number, k: number }} Normalized mantissa `m` and exponent `k`.
 */
function reduceLarge(x, step) {
	if (step === 0) {
		return x > SQRT2 ? { m: x * 0.5, k: 1 } : { m: x, k: 0 };
	}
	const scale = 2 ** step;
	if (x >= scale) {
		const next = reduceLarge(x * (2 ** -step), step);
		return { m: next.m, k: next.k + step };
	}
	return reduceLarge(x, step >> 1);
}

/**
 * Recursively scales up `0 < x < √½` by powers of two until `m ∈ [√½, √2]`.
 *
 * @param {number} x - Positive finite number `< √½`.
 * @param {number} step - Current binary exponent step (power of two, or 0).
 * @returns {{ m: number, k: number }} Normalized mantissa `m` and exponent `k`.
 */
function reduceSmall(x, step) {
	if (step === 0) {
		return x < SQRT1_2 ? { m: x * 2, k: -1 } : { m: x, k: 0 };
	}
	const invScale = 2 ** -step;
	if (x < invScale) {
		const next = reduceSmall(x * (2 ** step), step);
		return { m: next.m, k: next.k - step };
	}
	return reduceSmall(x, step >> 1);
}

/**
 * Divide-and-conquer binary splitting evaluation of the series segment
 * `∑_{n=lo}^{hi} s^(n - lo) / (2n + 1)` together with `s^(hi - lo + 1)`.
 *
 * @param {number} s - Squared argument `t^2`.
 * @param {number} lo - Inclusive lower term index (`>= 1`).
 * @param {number} hi - Inclusive upper term index (`>= lo`).
 * @returns {{ sum: number, power: number }} Segment sum and accumulated power.
 */
function sumAtanhTail(s, lo, hi) {
	if (lo === hi) {
		return { sum: 1 / (2 * lo + 1), power: s };
	}
	const mid = (lo + hi) >> 1;
	const left = sumAtanhTail(s, lo, mid);
	const right = sumAtanhTail(s, mid + 1, hi);
	return {
		sum: left.sum + left.power * right.sum,
		power: left.power * right.power,
	};
}

/**
 * Computes the natural logarithm `ln(x)` of an IEEE-754 float64 number `x`
 * using a recursive divide-and-conquer implementation.
 *
 * Follows IEEE-754 special-value semantics for numeric inputs:
 * - `ln(NaN)` -> `NaN`
 * - `ln(x)` for `x < 0` -> `NaN`
 * - `ln(+0)` / `ln(-0)` -> `-Infinity`
 * - `ln(+Infinity)` -> `+Infinity`
 * - `ln(1)` -> `+0`
 *
 * @param {number} x - Input IEEE-754 float64 number.
 * @returns {number} Natural logarithm of `x`.
 * @throws {TypeError} If `x` is not a JavaScript `number`.
 */
export function lnFloatRecursive(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`Expected a number, received ${typeof x}`);
	}
	if (Number.isNaN(x) || x < 0) {
		return NaN;
	}
	if (x === 0) {
		return -Infinity;
	}
	if (x === Infinity) {
		return Infinity;
	}
	if (x === 1) {
		return 0;
	}

	let m;
	let k;
	if (x > SQRT2) {
		({ m, k } = reduceLarge(x, 512));
	} else if (x < SQRT1_2) {
		({ m, k } = reduceSmall(x, 512));
	} else {
		m = x;
		k = 0;
	}

	// Because m ∈ [√½, √2] ⊂ [0.5, 2], u = m - 1 is exact by Sterbenz's Lemma.
	const u = m - 1;
	let lnM;
	if (u === 0) {
		lnM = 0;
	} else {
		const t = u / (m + 1);
		const s = t * t;
		const { sum: tail } = sumAtanhTail(s, 1, SERIES_MAX_TERM);
		// Using 2*t = u - u*t avoids losing low-order bits of u when |u| << 1.
		lnM = u - (u * t - (2 * t * s) * tail);
	}

	if (k === 0) {
		return lnM;
	}
	return k * LN2_HI + (lnM + k * LN2_LO);
}
