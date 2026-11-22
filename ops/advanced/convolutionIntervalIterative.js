const f64 = new Float64Array(1);
const u64 = new BigUint64Array(f64.buffer);

const SPLIT_FACTOR = 134217729; // 2^27 + 1 for IEEE-754 binary64 Veltkamp splitting

/**
 * Returns the greatest IEEE-754 binary64 number strictly less than `x`
 * (or `x` itself when `x` is `NaN` or `-Infinity`).
 *
 * @param {number} x
 * @returns {number}
 */
function nextDown(x) {
	if (Number.isNaN(x) || x === -Infinity) return x;
	if (x === 0) return -Number.MIN_VALUE;
	f64[0] = x;
	if (x > 0) {
		u64[0] -= 1n;
	} else {
		u64[0] += 1n;
	}
	const res = f64[0];
	return res === 0 ? 0 : res;
}

/**
 * Returns the least IEEE-754 binary64 number strictly greater than `x`
 * (or `x` itself when `x` is `NaN` or `+Infinity`).
 *
 * @param {number} x
 * @returns {number}
 */
function nextUp(x) {
	if (Number.isNaN(x) || x === Infinity) return x;
	if (x === 0) return Number.MIN_VALUE;
	f64[0] = x;
	if (x > 0) {
		u64[0] += 1n;
	} else {
		u64[0] -= 1n;
	}
	const res = f64[0];
	return res === 0 ? 0 : res;
}

/**
 * Exact rounding error `e = (a * b) - p` via Veltkamp-Dekker TwoProd.
 * Caller ensures `|a|, |b| < 1e299` and `1e-290 <= |p| < 1e307`.
 *
 * @param {number} a
 * @param {number} b
 * @param {number} p
 * @returns {number}
 */
function twoProdError(a, b, p) {
	const ta = SPLIT_FACTOR * a;
	const ah = ta - (ta - a);
	const al = a - ah;
	const tb = SPLIT_FACTOR * b;
	const bh = tb - (tb - b);
	const bl = b - bh;
	return (((ah * bh - p) + ah * bl) + al * bh) + al * bl;
}

/**
 * Computes a lower bound for the exact sum `a + b` with rounding toward `-Infinity`.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function addDown(a, b) {
	if (a === -Infinity || b === -Infinity) return -Infinity;
	const s = a + b;
	if (s === Infinity) return Number.MAX_VALUE;
	if (s === -Infinity) return -Infinity;
	const v = s - a;
	const e = (a - (s - v)) + (b - v);
	if (!Number.isFinite(e)) return nextDown(s);
	const res = e < 0 ? nextDown(s) : s;
	return res === 0 ? 0 : res;
}

/**
 * Computes an upper bound for the exact sum `a + b` with rounding toward `+Infinity`.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function addUp(a, b) {
	if (a === Infinity || b === Infinity) return Infinity;
	const s = a + b;
	if (s === Infinity) return Infinity;
	if (s === -Infinity) return -Number.MAX_VALUE;
	const v = s - a;
	const e = (a - (s - v)) + (b - v);
	if (!Number.isFinite(e)) return nextUp(s);
	const res = e > 0 ? nextUp(s) : s;
	return res === 0 ? 0 : res;
}

/**
 * Computes a lower bound for the exact product `a * b` with rounding toward `-Infinity`.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function mulDown(a, b) {
	if (a === 0 || b === 0) return 0;
	const p = a * b;
	if (p === Infinity) return Number.MAX_VALUE;
	if (p === -Infinity) return -Infinity;
	if (p === 0) {
		return (a > 0) === (b > 0) ? 0 : -Number.MIN_VALUE;
	}
	const absA = Math.abs(a);
	const absB = Math.abs(b);
	const absP = Math.abs(p);
	if (absA < 1e299 && absB < 1e299 && absP >= 1e-290 && absP < 1e307) {
		const e = twoProdError(a, b, p);
		const res = e < 0 ? nextDown(p) : p;
		return res === 0 ? 0 : res;
	}
	const res = nextDown(p);
	return res === 0 ? 0 : res;
}

/**
 * Computes an upper bound for the exact product `a * b` with rounding toward `+Infinity`.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function mulUp(a, b) {
	if (a === 0 || b === 0) return 0;
	const p = a * b;
	if (p === Infinity) return Infinity;
	if (p === -Infinity) return -Number.MAX_VALUE;
	if (p === 0) {
		return (a > 0) === (b > 0) ? Number.MIN_VALUE : 0;
	}
	const absA = Math.abs(a);
	const absB = Math.abs(b);
	const absP = Math.abs(p);
	if (absA < 1e299 && absB < 1e299 && absP >= 1e-290 && absP < 1e307) {
		const e = twoProdError(a, b, p);
		const res = e > 0 ? nextUp(p) : p;
		return res === 0 ? 0 : res;
	}
	const res = nextUp(p);
	return res === 0 ? 0 : res;
}

/**
 * Validates that `arr` is a non-empty array of finite `[lo, hi]` intervals with `lo <= hi`.
 *
 * @param {unknown} arr
 * @param {string} name
 */
function validateIntervalArray(arr, name) {
	if (!Array.isArray(arr)) {
		throw new TypeError(`${name} must be an array of [lo, hi] intervals`);
	}
	if (arr.length === 0) {
		throw new RangeError(`${name} must be a non-empty array`);
	}
	for (let i = 0; i < arr.length; i++) {
		const interval = arr[i];
		if (!Array.isArray(interval)) {
			throw new TypeError(`${name}[${i}] must be a [lo, hi] interval array`);
		}
		if (interval.length !== 2) {
			throw new RangeError(`${name}[${i}] must have length 2`);
		}
		const [lo, hi] = interval;
		if (typeof lo !== 'number' || typeof hi !== 'number') {
			throw new TypeError(`${name}[${i}] endpoints must be numbers`);
		}
		if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
			throw new RangeError(`${name}[${i}] endpoints must be finite numbers`);
		}
		if (lo > hi) {
			throw new RangeError(`${name}[${i}] is malformed: lo (${lo}) > hi (${hi})`);
		}
	}
}

/**
 * Computes the linear discrete convolution of two interval sequences `a` and `b`
 * using a straightforward nested iterative algorithm with outward-rounded
 * IEEE-754 interval arithmetic.
 *
 * For input sequences `a` of length `M` and `b` of length `N`, returns a new
 * array of length `M + N - 1` where each output interval satisfies:
 *
 * `(a * b)[n] ⊇ { sum_{k} x[k] * y[n - k] : x[k] ∈ a[k], y[j] ∈ b[j] }`
 *
 * Every interval multiplication and addition uses directed outward rounding
 * (`nextDown` / `nextUp` on IEEE-754 binary64 values) so the resulting `[lo, hi]`
 * intervals rigorously guarantee enclosure of the exact mathematical result
 * while preserving `lo <= hi`.
 *
 * @param {Array<[number, number]>} a - Non-empty array of finite `[lo, hi]` intervals (`lo <= hi`).
 * @param {Array<[number, number]>} b - Non-empty array of finite `[lo, hi]` intervals (`lo <= hi`).
 * @returns {Array<[number, number]>} Array of `a.length + b.length - 1` outward-rounded `[lo, hi]` intervals.
 * @throws {TypeError} If `a` or `b` is not an array, any element is not an array, or any endpoint is not a number.
 * @throws {RangeError} If `a` or `b` is empty, any interval does not have length 2, any endpoint is non-finite/NaN, or `lo > hi`.
 */
export function convolutionIntervalIterative(a, b) {
	validateIntervalArray(a, 'a');
	validateIntervalArray(b, 'b');

	const lenA = a.length;
	const lenB = b.length;
	const outLen = lenA + lenB - 1;
	const result = new Array(outLen);

	for (let n = 0; n < outLen; n++) {
		const kStart = n >= lenB ? n - lenB + 1 : 0;
		const kEnd = n < lenA ? n : lenA - 1;

		let accLo = 0;
		let accHi = 0;

		for (let k = kStart; k <= kEnd; k++) {
			const [aLo, aHi] = a[k];
			const [bLo, bHi] = b[n - k];

			const pLo = Math.min(
				mulDown(aLo, bLo),
				mulDown(aLo, bHi),
				mulDown(aHi, bLo),
				mulDown(aHi, bHi)
			);
			const pHi = Math.max(
				mulUp(aLo, bLo),
				mulUp(aLo, bHi),
				mulUp(aHi, bLo),
				mulUp(aHi, bHi)
			);

			if (k === kStart) {
				accLo = pLo;
				accHi = pHi;
			} else {
				accLo = addDown(accLo, pLo);
				accHi = addUp(accHi, pHi);
			}
		}

		result[n] = [accLo === 0 ? 0 : accLo, accHi === 0 ? 0 : accHi];
	}

	return result;
}
