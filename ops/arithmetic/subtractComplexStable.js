/**
 * Numerically robust subtraction over complex numbers represented as `{ re, im }`.
 *
 * Uses exact error-free floating-point expansions (Shewchuk's adaptive precision
 * `twoSum` / `growExpansion` / `compress`) combined with three-tier exact
 * power-of-2 scaling buckets and exact half-ULP tie-breaking. This prevents:
 * - catastrophic cancellation across multiple terms and widely separated scales,
 * - spurious intermediate overflow near `Number.MAX_VALUE`,
 * - premature underflow of error terms in the subnormal range.
 *
 * @module ops/arithmetic/subtractComplexStable
 */

const HIGH_THRESHOLD = 2 ** 500;
const LOW_THRESHOLD = 2 ** -500;
const SCALE_DOWN = 2 ** -200;
const SCALE_UP = 2 ** 200;
const OVERFLOW_SAFE_SCALED = 2 ** 820;
const SUBNORMAL_SAFE_SCALED = 2 ** -822;
const MID_SMALL_THRESHOLD = 2 ** -400;
const TINY_TIE_BREAK = 2 ** -950;

/**
 * Validates that a value is a complex number object `{ re, im }` with finite numeric parts.
 *
 * @param {unknown} z - Candidate complex number.
 * @param {number} index - Positional argument index for error reporting.
 * @throws {TypeError} If `z` is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If `z.re` or `z.im` is not finite (`NaN`, `Infinity`, `-Infinity`).
 */
function validateComplex(z, index) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError(
			`Argument at index ${index} must be a complex number object { re, im }`
		);
	}
	if (typeof z.re !== 'number' || typeof z.im !== 'number') {
		throw new TypeError(
			`Argument at index ${index} must have numeric "re" and "im" properties`
		);
	}
	if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
		throw new RangeError(
			`Argument at index ${index} must have finite "re" and "im" values`
		);
	}
}

/**
 * Knuth's error-free transformation `TwoSum`: returns `[s, err]` such that
 * `s + err === a + b` mathematically exactly (assuming no overflow/underflow).
 *
 * @param {number} a
 * @param {number} b
 * @returns {[number, number]}
 */
function twoSum(a, b) {
	const s = a + b;
	const bVirtual = s - a;
	const aVirtual = s - bVirtual;
	const bRoundoff = b - bVirtual;
	const aRoundoff = a - aVirtual;
	return [s, aRoundoff + bRoundoff];
}

/**
 * Adds a single floating-point value `b` to an ascending non-overlapping
 * floating-point expansion `exp` without losing precision (Shewchuk `Grow-Expansion`).
 *
 * @param {number[]} exp - Existing expansion (ascending magnitude).
 * @param {number} b - Value to add.
 * @returns {number[]} New exact expansion whose sum equals `sum(exp) + b`.
 */
function growExpansion(exp, b) {
	if (b === 0) {
		return exp;
	}
	const out = [];
	let q = b;
	for (let i = 0; i < exp.length; i++) {
		const [sum, err] = twoSum(q, exp[i]);
		if (err !== 0) {
			out.push(err);
		}
		q = sum;
	}
	if (q !== 0) {
		out.push(q);
	}
	return out;
}

/**
 * Compresses a floating-point expansion (Shewchuk `Compress`), removing zeros
 * and tightening non-overlapping components so the final entry is dominant.
 *
 * @param {number[]} exp
 * @returns {number[]}
 */
function compressExpansion(exp) {
	if (exp.length <= 1) {
		return exp.length === 1 && exp[0] === 0 ? [] : exp.slice();
	}

	let current = exp;
	for (let pass = 0; pass < 2; pass++) {
		const n = current.length;
		if (n <= 1) {
			break;
		}
		const h = new Array(n);
		let q = current[n - 1];
		let bottom = n - 1;
		for (let i = n - 2; i >= 0; i--) {
			const [sum, err] = twoSum(q, current[i]);
			if (err !== 0) {
				h[bottom--] = sum;
				q = err;
			} else {
				q = sum;
			}
		}
		h[bottom] = q;

		const next = [];
		q = h[bottom];
		for (let i = bottom + 1; i < n; i++) {
			const [sum, err] = twoSum(h[i], q);
			if (err !== 0) {
				next.push(err);
			}
			q = sum;
		}
		if (q !== 0) {
			next.push(q);
		}

		const unchanged = next.length === n;
		current = next;
		if (unchanged) {
			break;
		}
	}
	return current;
}

/**
 * Computes the correctly rounded IEEE-754 double value of a compressed
 * floating-point expansion, including exact half-ULP tie-breaking.
 *
 * @param {number[]} exp - Compressed expansion (ascending magnitude).
 * @returns {number}
 */
function roundCompressedExpansion(exp) {
	const k = exp.length;
	if (k === 0) {
		return 0;
	}
	if (k === 1) {
		return exp[0] === 0 ? 0 : exp[0];
	}

	const hi = exp[k - 1];
	const lo = exp[k - 2];
	const [s, err] = twoSum(hi, lo);

	if (k >= 3) {
		const rest = exp[k - 3];
		if (rest !== 0) {
			if (s === hi && err === lo && Math.sign(lo) === Math.sign(rest)) {
				const step = 2 * lo;
				if (hi + step - hi === step) {
					return hi + step;
				}
			} else if (s !== hi && err === -lo && Math.sign(lo) !== Math.sign(rest)) {
				return hi;
			}
		}
	}

	return s === 0 ? 0 : s;
}

/**
 * Sums a sequence of finite real numbers using three-tier power-of-2 bucketed
 * Shewchuk expansions so that neither intermediate overflow nor subnormal
 * underflow degrades accuracy.
 *
 * @param {number[]} values - Finite numbers to sum.
 * @returns {number} Correctly rounded sum (with `-0` normalized to `0`).
 */
function exactSumScalars(values) {
	let hiExp = [];
	let midExp = [];
	let loExp = [];

	for (let i = 0; i < values.length; i++) {
		const v = values[i];
		if (v === 0) {
			continue;
		}
		const av = Math.abs(v);
		if (av >= HIGH_THRESHOLD) {
			hiExp = growExpansion(hiExp, v * SCALE_DOWN);
		} else if (av < LOW_THRESHOLD) {
			loExp = growExpansion(loExp, v * SCALE_UP);
		} else {
			midExp = growExpansion(midExp, v);
		}
	}

	hiExp = compressExpansion(hiExp);
	midExp = compressExpansion(midExp);
	loExp = compressExpansion(loExp);

	// Handle high-magnitude bucket
	if (hiExp.length > 0) {
		const hiTop = Math.abs(hiExp[hiExp.length - 1]);
		if (hiTop >= OVERFLOW_SAFE_SCALED) {
			// Fold midExp (scaled down) and sign of loExp into hiExp to resolve
			// overflow boundary and half-ULP ties accurately without overflowing.
			for (let i = 0; i < midExp.length; i++) {
				hiExp = growExpansion(hiExp, midExp[i] * SCALE_DOWN);
			}
			if (loExp.length > 0) {
				const loSign = Math.sign(loExp[loExp.length - 1]);
				hiExp = growExpansion(hiExp, loSign * TINY_TIE_BREAK);
			}
			hiExp = compressExpansion(hiExp);
			const result = roundCompressedExpansion(hiExp) * SCALE_UP;
			return result === 0 ? 0 : result;
		}

		for (let i = 0; i < hiExp.length; i++) {
			midExp = growExpansion(midExp, hiExp[i] * SCALE_UP);
		}
		midExp = compressExpansion(midExp);
	}

	// Handle case where only low-magnitude terms remain
	if (midExp.length === 0) {
		if (loExp.length === 0) {
			return 0;
		}
		const result = roundCompressedExpansion(loExp) * SCALE_DOWN;
		return result === 0 ? 0 : result;
	}

	// Combine midExp and loExp
	if (loExp.length > 0) {
		const midTop = Math.abs(midExp[midExp.length - 1]);
		if (midTop < MID_SMALL_THRESHOLD) {
			for (let i = 0; i < midExp.length; i++) {
				loExp = growExpansion(loExp, midExp[i] * SCALE_UP);
			}
			loExp = compressExpansion(loExp);
			const result = roundCompressedExpansion(loExp) * SCALE_DOWN;
			return result === 0 ? 0 : result;
		}

		let residualSign = 0;
		for (let i = 0; i < loExp.length; i++) {
			const c = loExp[i];
			if (Math.abs(c) >= SUBNORMAL_SAFE_SCALED) {
				midExp = growExpansion(midExp, c * SCALE_DOWN);
			} else if (c !== 0) {
				residualSign = Math.sign(c);
			}
		}
		if (residualSign !== 0) {
			midExp = growExpansion(midExp, residualSign * TINY_TIE_BREAK);
		}
		midExp = compressExpansion(midExp);
	}

	return roundCompressedExpansion(midExp);
}

/**
 * Subtracts one or more complex numbers from an initial complex number `a`
 * (`a - b - c - ...`) using numerically robust compensated exact-expansion
 * arithmetic with power-of-2 scaling.
 *
 * Each operand must be an object `{ re, im }` with finite numeric components.
 * Negative zero (`-0`) components in the result are normalized to `0`.
 * If the true mathematical real or imaginary component exceeds `Number.MAX_VALUE`,
 * that component overflows to `Infinity` or `-Infinity` per IEEE-754.
 *
 * @param {{ re: number, im: number }} a - Minuend complex number.
 * @param {{ re: number, im: number }} b - First subtrahend complex number.
 * @param {...{ re: number, im: number }} rest - Optional additional subtrahends.
 * @returns {{ re: number, im: number }} The difference `a - b - ...rest`.
 * @throws {TypeError} If fewer than two arguments are supplied or any argument is not `{ re, im }`.
 * @throws {RangeError} If any `re` or `im` component is `NaN`, `Infinity`, or `-Infinity`.
 */
export function subtractComplexStable(a, b, ...rest) {
	if (arguments.length < 2) {
		throw new TypeError(
			'subtractComplexStable requires at least two complex number arguments'
		);
	}

	validateComplex(a, 0);
	validateComplex(b, 1);
	for (let i = 0; i < rest.length; i++) {
		validateComplex(rest[i], i + 2);
	}

	// Fast exact path for 2 arguments (IEEE-754 subtraction is already 0.5-ULP exact)
	if (rest.length === 0) {
		const re = a.re - b.re;
		const im = a.im - b.im;
		return {
			re: re === 0 ? 0 : re,
			im: im === 0 ? 0 : im
		};
	}

	const count = rest.length + 2;
	const reTerms = new Array(count);
	const imTerms = new Array(count);

	reTerms[0] = a.re;
	imTerms[0] = a.im;
	reTerms[1] = -b.re;
	imTerms[1] = -b.im;

	for (let i = 0; i < rest.length; i++) {
		reTerms[i + 2] = -rest[i].re;
		imTerms[i + 2] = -rest[i].im;
	}

	return {
		re: exactSumScalars(reTerms),
		im: exactSumScalars(imTerms)
	};
}
