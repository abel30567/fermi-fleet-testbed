const VELTKAMP_SPLIT = 134217729; // 2^27 + 1 for IEEE-754 binary64 (53-bit significand)
const SPLIT_THRESHOLD = 2 ** 996; // Safe bound below Number.MAX_VALUE / VELTKAMP_SPLIT
const SUBNORMAL_THRESHOLD = 2 ** -969;
const SCALE_UP = 2 ** 54;
const SCALE_DOWN = 2 ** -54;

/**
 * Error-free transformation of a floating-point sum (Knuth's TwoSum).
 * Computes `s = fl(a + b)` and `e` such that `s + e = a + b` exactly
 * whenever `s` is finite.
 *
 * @param {number} a
 * @param {number} b
 * @returns {[number, number]} Tuple `[sum, err]`.
 */
function twoSum(a, b) {
	const s = a + b;
	if (!Number.isFinite(s)) {
		return [s, 0];
	}
	const v = s - a;
	const e = (a - (s - v)) + (b - v);
	return [s, Number.isFinite(e) ? e : 0];
}

/**
 * Veltkamp splitting of an IEEE-754 float64 value into two non-overlapping
 * 26-bit parts `hi + lo = x`.
 *
 * @param {number} x
 * @returns {[number, number]} Tuple `[hi, lo]`.
 */
function veltkampSplit(x) {
	const c = VELTKAMP_SPLIT * x;
	const hi = c - (c - x);
	const lo = x - hi;
	return [hi, lo];
}

/**
 * Error-free transformation of a floating-point product (Dekker's TwoProd).
 * Computes `p = fl(a * b)` and `e` such that `p + e = a * b` exactly for
 * normal products, with power-of-two rescaling near overflow/subnormal bounds.
 *
 * @param {number} a
 * @param {number} b
 * @returns {[number, number]} Tuple `[prod, err]`.
 */
function twoProd(a, b) {
	const p = a * b;
	if (p === 0 || !Number.isFinite(p)) {
		return [p, 0];
	}

	let x = a;
	let y = b;
	const ax = Math.abs(x);
	const ay = Math.abs(y);

	if (ax > SPLIT_THRESHOLD) {
		x *= SCALE_DOWN;
		y *= SCALE_UP;
	} else if (ay > SPLIT_THRESHOLD) {
		x *= SCALE_UP;
		y *= SCALE_DOWN;
	} else if (ax < SUBNORMAL_THRESHOLD && ay > 2 ** -900) {
		x *= SCALE_UP;
		y *= SCALE_DOWN;
	} else if (ay < SUBNORMAL_THRESHOLD && ax > 2 ** -900) {
		x *= SCALE_DOWN;
		y *= SCALE_UP;
	}

	const [xHi, xLo] = veltkampSplit(x);
	const [yHi, yLo] = veltkampSplit(y);
	const e = ((xHi * yHi - p) + xHi * yLo + xLo * yHi) + xLo * yLo;
	return [p, Number.isFinite(e) ? e : 0];
}

/**
 * Computes the Euclidean dot product of two equal-length vectors of finite
 * IEEE-754 float64 numbers using error-free compensated summation.
 *
 * Algorithm:
 * Combines Dekker's TwoProd (via Veltkamp splitting) with Knuth's TwoSum in a
 * cascaded Ogita–Rump–Oishi compensated dot-product series. Each term product
 * `a[i] * b[i]` is decomposed into `(h, r)` with `h + r = a[i] * b[i]` exactly;
 * `h` is accumulated into the primary sum `p` via TwoSum, while both the
 * addition error `q` and multiplication error `r` are folded into a secondary
 * TwoSum-compensated error accumulator `(errSum, errComp)`. This preserves
 * float64 precision even under severe catastrophic cancellation.
 *
 * @param {number[]} a First input vector of finite numbers.
 * @param {number[]} b Second input vector of finite numbers (same length as `a`).
 * @returns {number} The Euclidean dot product `sum_{i=0}^{n-1} a[i] * b[i]` (0 for empty vectors).
 * @throws {TypeError} If either argument is not an Array or contains non-number elements.
 * @throws {RangeError} If vectors have different lengths or contain NaN or non-finite values.
 */
export function dotProductFloatSeries(a, b) {
	if (!Array.isArray(a) || !Array.isArray(b)) {
		throw new TypeError('Both arguments must be arrays');
	}
	if (a.length !== b.length) {
		throw new RangeError(`Vector length mismatch: ${a.length} !== ${b.length}`);
	}

	const n = a.length;
	if (n === 0) {
		return 0;
	}

	let p = 0;
	let errSum = 0;
	let errComp = 0;

	for (let i = 0; i < n; i++) {
		const ai = a[i];
		const bi = b[i];

		if (typeof ai !== 'number' || typeof bi !== 'number') {
			throw new TypeError(`Vector elements at index ${i} must be numbers`);
		}
		if (!Number.isFinite(ai) || !Number.isFinite(bi)) {
			throw new RangeError(`Vector elements at index ${i} must be finite numbers`);
		}

		const [h, r] = twoProd(ai, bi);
		const [pNew, q] = twoSum(p, h);
		p = pNew;

		const [e1, c1] = twoSum(errSum, q);
		errSum = e1;
		errComp += c1;

		const [e2, c2] = twoSum(errSum, r);
		errSum = e2;
		errComp += c2;
	}

	const [total, rem] = twoSum(p, errSum);
	const result = total + (rem + errComp);
	return result === 0 ? 0 : result;
}
