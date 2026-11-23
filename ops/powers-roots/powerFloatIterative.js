/**
 * Iterative IEEE-754 float64 exponentiation (`base ** exponent`).
 *
 * Computes real powers and roots over IEEE-754 double-precision floating-point
 * numbers using iterative algorithms (exponentiation by squaring for integer
 * exponents, and range-reduced iterative series for `ln` and `exp` for
 * fractional exponents) with zero external dependencies.
 */

const LN2 = 0.6931471805599453;
const LN2_HI = 0.6931471803691238; // 0x3fe62e42fee00000 (bottom 21 bits zero)
const LN2_LO = 1.9082149292705877e-10; // 0x3dea39ef35793c76
const SQRT2 = 1.4142135623730951;
const SQRT1_2 = 0.7071067811865476;
const MIN_NORMAL = 2.2250738585072014e-308;
const MAX_EXP_ARG = 709.782712893384;
const MIN_EXP_ARG = -745.1332191019412;
const POW2_64 = 18446744073709551616;
const POW2_NEG64 = 5.421010862427522e-20;
const VELTKAMP_SPLIT = 134217729; // 2^27 + 1

/**
 * Returns true if `n` is a finite odd integer.
 * @param {number} n
 * @returns {boolean}
 */
function isOddInteger(n) {
	return Number.isInteger(n) && n % 2 !== 0;
}

/**
 * Error-free transformation for addition: returns `[s, err]` with `a + b === s + err`.
 * @param {number} a
 * @param {number} b
 * @returns {[number, number]}
 */
function twoSum(a, b) {
	const s = a + b;
	const v = s - a;
	const err = (a - (s - v)) + (b - v);
	return [s, err];
}

/**
 * Error-free transformation for multiplication using Veltkamp splitting:
 * returns `[p, err]` with `a * b === p + err`.
 * @param {number} a
 * @param {number} b
 * @returns {[number, number]}
 */
function twoProd(a, b) {
	const p = a * b;
	const ca = VELTKAMP_SPLIT * a;
	const aHi = ca - (ca - a);
	const aLo = a - aHi;
	const cb = VELTKAMP_SPLIT * b;
	const bHi = cb - (cb - b);
	const bLo = b - bHi;
	const err = ((aHi * bHi - p) + aHi * bLo + aLo * bHi) + aLo * bLo;
	return [p, err];
}

/**
 * Computes `base ** exp` for `base > 0` and positive integer `exp >= 1`
 * via straightforward iterative binary exponentiation.
 * @param {number} base
 * @param {number} exp
 * @returns {number}
 */
function powPositiveInt(base, exp) {
	let result = 1;
	let factor = base;
	let remaining = exp;

	while (remaining > 0) {
		if (remaining % 2 !== 0) {
			result *= factor;
		}
		remaining = Math.floor(remaining / 2);
		if (remaining === 0) {
			break;
		}
		factor *= factor;
		if (result === Infinity || factor === Infinity) {
			return Infinity;
		}
		if (result === 0 || factor === 0) {
			return 0;
		}
	}

	return result;
}

/**
 * Computes `2 ** k` for integer `k` in `[-1022, 1023]` iteratively.
 * @param {number} k
 * @returns {number}
 */
function pow2Exact(k) {
	if (k === 0) {
		return 1;
	}
	if (k > 0) {
		return powPositiveInt(2, k);
	}
	return powPositiveInt(0.5, -k);
}

/**
 * Multiplies `val` by `2 ** k` without premature overflow or underflow.
 * @param {number} val
 * @param {number} k
 * @returns {number}
 */
function scaleByPow2(val, k) {
	let result = val;
	let shift = k;

	while (shift > 1023) {
		result *= pow2Exact(1023);
		shift -= 1023;
		if (!Number.isFinite(result)) {
			return result;
		}
	}
	while (shift < -1022) {
		result *= pow2Exact(-1022);
		shift += 1022;
		if (result === 0) {
			return 0;
		}
	}

	return result * pow2Exact(shift);
}

/**
 * Computes `ln(x)` for finite `x > 0` as a high/low double-double pair `[hi, lo]`
 * using iterative power-of-2 range reduction and the iterative atanh Taylor series.
 * @param {number} x
 * @returns {[number, number]}
 */
function lnIterativeHiLo(x) {
	let m = x;
	let k = 0;

	while (m >= POW2_64) {
		m *= POW2_NEG64;
		k += 64;
	}
	while (m < POW2_NEG64) {
		m *= POW2_64;
		k -= 64;
	}
	while (m >= SQRT2) {
		m *= 0.5;
		k += 1;
	}
	while (m < SQRT1_2) {
		m *= 2;
		k -= 1;
	}

	// m is in [SQRT1_2, SQRT2]; m - 1 is exact by Sterbenz's Lemma.
	const u = m - 1;
	const [vHi, vLo] = twoSum(m, 1);
	const tHi = u / vHi;
	const [pHi, pLo] = twoProd(tHi, vHi);
	const tLo = ((u - pHi) - pLo - tHi * vLo) / vHi;

	const t2 = tHi * tHi;
	let seriesRest = 0;
	let term = tHi;
	for (let denom = 3; denom <= 61; denom += 2) {
		term *= t2;
		const delta = term / denom;
		const next = seriesRest + delta;
		if (next === seriesRest) {
			break;
		}
		seriesRest = next;
	}

	const [lnMHi, lnMLo] = twoSum(2 * tHi, 2 * (tLo + seriesRest));
	const [sumHi, sumErr] = twoSum(k * LN2_HI, lnMHi);
	const [hi, lo] = twoSum(sumHi, sumErr + k * LN2_LO + lnMLo);
	return [hi, lo];
}

/**
 * Computes `exp(yHi + yLo)` using iterative range reduction and Taylor series.
 * @param {number} yHi
 * @param {number} yLo
 * @returns {number}
 */
function expIterativeHiLo(yHi, yLo) {
	const y = yHi + yLo;
	if (y > MAX_EXP_ARG) {
		return Infinity;
	}
	if (y < MIN_EXP_ARG) {
		return 0;
	}

	const k = Math.round(y / LN2);
	const r = ((yHi - k * LN2_HI) + yLo) - k * LN2_LO;

	let sum = 1;
	let term = 1;
	for (let n = 1; n <= 30; n += 1) {
		term = (term * r) / n;
		const next = sum + term;
		if (next === sum) {
			break;
		}
		sum = next;
	}

	return scaleByPow2(sum, k);
}

/**
 * Computes `base` raised to the power `exponent` over IEEE-754 float64 Numbers
 * using a straightforward iterative implementation.
 *
 * Follows ECMA-262 / IEEE-754 float64 semantics for special values (`NaN`,
 * `±Infinity`, `±0`, negative bases with integer vs. non-integer exponents).
 *
 * @param {number} base - The base operand (must be a `number`).
 * @param {number} exponent - The exponent operand (must be a `number`).
 * @returns {number} The IEEE-754 float64 result of `base` raised to `exponent`.
 * @throws {TypeError} If `base` or `exponent` is not a `number` primitive.
 */
export function powerFloatIterative(base, exponent) {
	if (typeof base !== 'number') {
		throw new TypeError(`Expected base to be a number, received ${typeof base}`);
	}
	if (typeof exponent !== 'number') {
		throw new TypeError(`Expected exponent to be a number, received ${typeof exponent}`);
	}

	// IEEE-754 / ECMA-262 special value rules
	if (Number.isNaN(exponent)) {
		return NaN;
	}
	if (exponent === 0) {
		return 1;
	}
	if (Number.isNaN(base)) {
		return NaN;
	}

	if (base === Infinity) {
		return exponent > 0 ? Infinity : 0;
	}
	if (base === -Infinity) {
		if (exponent > 0) {
			return isOddInteger(exponent) ? -Infinity : Infinity;
		}
		return isOddInteger(exponent) ? -0 : 0;
	}

	if (base === 0) {
		const isNegZero = Object.is(base, -0);
		if (exponent > 0) {
			return isNegZero && isOddInteger(exponent) ? -0 : 0;
		}
		return isNegZero && isOddInteger(exponent) ? -Infinity : Infinity;
	}

	if (!Number.isFinite(exponent)) {
		const absBase = base < 0 ? -base : base;
		if (absBase === 1) {
			return NaN;
		}
		if (exponent === Infinity) {
			return absBase > 1 ? Infinity : 0;
		}
		return absBase > 1 ? 0 : Infinity;
	}

	// Both base and exponent are finite and non-zero.
	if (base === 1) {
		return 1;
	}
	if (base === -1) {
		if (!Number.isInteger(exponent)) {
			return NaN;
		}
		return isOddInteger(exponent) ? -1 : 1;
	}

	if (Number.isInteger(exponent)) {
		const negativeResult = base < 0 && isOddInteger(exponent);
		const absBase = base < 0 ? -base : base;
		let mag;

		if (exponent > 0) {
			mag = powPositiveInt(absBase, exponent);
		} else {
			const posExp = -exponent;
			const pos = powPositiveInt(absBase, posExp);
			if (Number.isFinite(pos) && pos >= MIN_NORMAL) {
				mag = 1 / pos;
			} else {
				mag = powPositiveInt(1 / absBase, posExp);
			}
		}

		return negativeResult ? -mag : mag;
	}

	// Non-integer finite exponent
	if (base < 0) {
		return NaN;
	}

	const [lnHi, lnLo] = lnIterativeHiLo(base);
	const roughY = exponent * lnHi;
	if (roughY > MAX_EXP_ARG + 1) {
		return Infinity;
	}
	if (roughY < MIN_EXP_ARG - 1) {
		return 0;
	}

	const [prodHi, prodErr] = twoProd(exponent, lnHi);
	const [yHi, yLo] = twoSum(prodHi, prodErr + exponent * lnLo);
	return expIterativeHiLo(yHi, yLo);
}
