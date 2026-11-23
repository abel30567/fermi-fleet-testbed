/**
 * Interval matrix multiplication using a straightforward iterative O(m * n * k)
 * algorithm with rigorous IEEE-754 outward rounding.
 *
 * Every interval is represented as a two-element array `[lo, hi]` with finite
 * numeric bounds satisfying `lo <= hi`. All arithmetic uses directed rounding
 * (round-toward-negative-infinity for lower bounds, round-toward-positive-infinity
 * for upper bounds), guaranteeing rigorous mathematical enclosure of the exact
 * real matrix product `{ A_s * B_s : A_s in A, B_s in B }`.
 *
 * @module ops/matrix/matMulIntervalIterative
 */

const _buf = new ArrayBuffer(8);
const _f64 = new Float64Array(_buf);
const _u64 = new BigUint64Array(_buf);

/** Veltkamp splitting constant 2^27 + 1 for binary64 Dekker TwoProd. */
const VELTKAMP_SPLIT = 134217729;

/** Safe magnitude upper bound for Veltkamp splitting without overflow (2^995). */
const SPLIT_MAX = 2 ** 995;

/** Safe product magnitude lower bound for TwoProd without subnormal underflow (2^-918). */
const TWOPROD_MIN = 2 ** -918;

/**
 * Returns the smallest IEEE-754 binary64 value strictly greater than `x`
 * (or `Infinity` if `x === Infinity`, `NaN` if `x` is `NaN`).
 *
 * @param {number} x
 * @returns {number}
 */
function nextUp(x) {
	if (Number.isNaN(x) || x === Infinity) return x;
	if (x === 0) return Number.MIN_VALUE;
	_f64[0] = x;
	const bits = _u64[0];
	_u64[0] = x > 0 ? bits + 1n : bits - 1n;
	const res = _f64[0];
	return res === 0 ? 0 : res;
}

/**
 * Returns the largest IEEE-754 binary64 value strictly less than `x`
 * (or `-Infinity` if `x === -Infinity`, `NaN` if `x` is `NaN`).
 *
 * @param {number} x
 * @returns {number}
 */
function nextDown(x) {
	if (Number.isNaN(x) || x === -Infinity) return x;
	const res = -nextUp(-x);
	return res === 0 ? 0 : res;
}

/**
 * Extracts the exact binary64 representation `mantissa * 2^exp` for a positive
 * finite number `x`.
 *
 * @param {number} x - Strictly positive finite number.
 * @returns {{ mantissa: bigint, exp: number }}
 */
function decodePositiveFloat64(x) {
	_f64[0] = x;
	const bits = _u64[0];
	const biasedExp = Number((bits >> 52n) & 0x7ffn);
	const frac = bits & 0xfffffffffffffn;
	if (biasedExp === 0) {
		return { mantissa: frac, exp: -1074 };
	}
	return { mantissa: (1n << 52n) | frac, exp: biasedExp - 1075 };
}

/**
 * Computes the exact sign (`-1`, `0`, or `1`) of `(a * b) - p` for finite
 * nonzero `a`, `b`, and finite nonzero `p = a * b` using exact BigInt
 * mantissa/exponent arithmetic. Used as fallback near overflow/underflow.
 *
 * @param {number} a
 * @param {number} b
 * @param {number} p
 * @returns {-1 | 0 | 1}
 */
function exactMulErrorSign(a, b, p) {
	const dA = decodePositiveFloat64(Math.abs(a));
	const dB = decodePositiveFloat64(Math.abs(b));
	const dP = decodePositiveFloat64(Math.abs(p));

	const prodM = dA.mantissa * dB.mantissa;
	const prodE = dA.exp + dB.exp;
	const shift = prodE - dP.exp;

	let lhs;
	let rhs;
	if (shift >= 0) {
		lhs = prodM << BigInt(shift);
		rhs = dP.mantissa;
	} else {
		lhs = prodM;
		rhs = dP.mantissa << BigInt(-shift);
	}

	const magCmp = lhs < rhs ? -1 : lhs > rhs ? 1 : 0;
	return p > 0 ? magCmp : /** @type {-1 | 0 | 1} */ (-magCmp);
}

/**
 * Computes the exact sign (`-1`, `0`, or `1`) of `(a * b) - p` for finite
 * nonzero `a`, `b`, and finite nonzero `p = a * b`.
 * Uses Dekker's error-free TwoProd in the normal range and falls back to exact
 * BigInt arithmetic near overflow or underflow.
 *
 * @param {number} a
 * @param {number} b
 * @param {number} p
 * @returns {-1 | 0 | 1}
 */
function mulErrorSign(a, b, p) {
	if (
		Math.abs(a) <= SPLIT_MAX &&
		Math.abs(b) <= SPLIT_MAX &&
		Math.abs(p) >= TWOPROD_MIN
	) {
		const ca = VELTKAMP_SPLIT * a;
		const aHi = ca - (ca - a);
		const aLo = a - aHi;

		const cb = VELTKAMP_SPLIT * b;
		const bHi = cb - (cb - b);
		const bLo = b - bHi;

		const err = ((aHi * bHi - p) + aHi * bLo + aLo * bHi) + aLo * bLo;
		return err < 0 ? -1 : err > 0 ? 1 : 0;
	}
	return exactMulErrorSign(a, b, p);
}

/**
 * Exact IEEE-754 addition rounded toward -Infinity.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function addDown(a, b) {
	if (a === -Infinity || b === -Infinity) return -Infinity;
	if (a === Infinity || b === Infinity) return Infinity;
	if (a === 0) return b === 0 ? 0 : b;
	if (b === 0) return a;

	const s = a + b;
	if (s === Infinity) return Number.MAX_VALUE;
	if (s === -Infinity) return -Infinity;

	// FastTwoSum with |x| >= |y| is exact with no intermediate overflow.
	let x = a;
	let y = b;
	if (Math.abs(x) < Math.abs(y)) {
		x = b;
		y = a;
	}
	const err = y - (s - x);
	const res = err < 0 ? nextDown(s) : s;
	return res === 0 ? 0 : res;
}

/**
 * Exact IEEE-754 addition rounded toward +Infinity.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function addUp(a, b) {
	if (a === Infinity || b === Infinity) return Infinity;
	if (a === -Infinity || b === -Infinity) return -Infinity;
	if (a === 0) return b === 0 ? 0 : b;
	if (b === 0) return a;

	const s = a + b;
	if (s === Infinity) return Infinity;
	if (s === -Infinity) return -Number.MAX_VALUE;

	let x = a;
	let y = b;
	if (Math.abs(x) < Math.abs(y)) {
		x = b;
		y = a;
	}
	const err = y - (s - x);
	const res = err > 0 ? nextUp(s) : s;
	return res === 0 ? 0 : res;
}

/**
 * Exact IEEE-754 multiplication rounded toward -Infinity.
 *
 * @param {number} a - Finite number.
 * @param {number} b - Finite number.
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
	const sign = mulErrorSign(a, b, p);
	const res = sign < 0 ? nextDown(p) : p;
	return res === 0 ? 0 : res;
}

/**
 * Exact IEEE-754 multiplication rounded toward +Infinity.
 *
 * @param {number} a - Finite number.
 * @param {number} b - Finite number.
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
	const sign = mulErrorSign(a, b, p);
	const res = sign > 0 ? nextUp(p) : p;
	return res === 0 ? 0 : res;
}

/**
 * Validates that `matrix` is a non-empty rectangular 2D array of valid finite
 * `[lo, hi]` intervals with `lo <= hi`.
 *
 * @param {unknown} matrix
 * @param {string} name
 * @returns {{ rows: number, cols: number }}
 */
function validateIntervalMatrix(matrix, name) {
	if (!Array.isArray(matrix)) {
		throw new TypeError(`${name} must be a 2D array of [lo, hi] intervals`);
	}
	const rows = matrix.length;
	if (rows === 0) {
		throw new RangeError(`${name} must not be empty`);
	}

	let cols = -1;
	for (let i = 0; i < rows; i++) {
		const row = matrix[i];
		if (!Array.isArray(row)) {
			throw new TypeError(`${name}[${i}] must be an array of [lo, hi] intervals`);
		}
		if (row.length === 0) {
			throw new RangeError(`${name}[${i}] must not be empty`);
		}
		if (cols === -1) {
			cols = row.length;
		} else if (row.length !== cols) {
			throw new RangeError(
				`${name} must be rectangular: row ${i} has length ${row.length}, expected ${cols}`
			);
		}

		for (let j = 0; j < cols; j++) {
			const iv = row[j];
			if (!Array.isArray(iv) || iv.length !== 2) {
				throw new TypeError(`${name}[${i}][${j}] must be a [lo, hi] interval pair`);
			}
			const lo = iv[0];
			const hi = iv[1];
			if (typeof lo !== 'number' || typeof hi !== 'number') {
				throw new TypeError(`${name}[${i}][${j}] bounds must be numbers`);
			}
			if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
				throw new RangeError(`${name}[${i}][${j}] bounds must be finite numbers`);
			}
			if (lo > hi) {
				throw new RangeError(
					`${name}[${i}][${j}] has inverted interval bounds: lo (${lo}) > hi (${hi})`
				);
			}
		}
	}

	return { rows, cols };
}

/**
 * Multiplies two interval matrices `A` (m x k) and `B` (k x n) over `[lo, hi]`
 * intervals using a straightforward iterative triple-loop algorithm with
 * outward IEEE-754 rounding guaranteeing rigorous enclosure.
 *
 * Each entry `C[i][j]` of the returned m x n matrix satisfies:
 * for every scalar matrix `a` with `a[i][t] in A[i][t]` and every scalar matrix
 * `b` with `b[t][j] in B[t][j]`, the exact real dot product `sum_t a[i][t] * b[t][j]`
 * lies inside `[C[i][j][0], C[i][j][1]]`.
 *
 * @param {Array<Array<[number, number]>>} A - Left m x k interval matrix.
 * @param {Array<Array<[number, number]>>} B - Right k x n interval matrix.
 * @returns {Array<Array<[number, number]>>} Resulting m x n interval matrix.
 * @throws {TypeError} If inputs are not 2D arrays of numeric `[lo, hi]` pairs.
 * @throws {RangeError} If matrices are empty, ragged, have incompatible
 *   dimensions, or contain non-finite or inverted (`lo > hi`) interval bounds.
 */
export function matMulIntervalIterative(A, B) {
	const { rows: m, cols: k } = validateIntervalMatrix(A, 'A');
	const { rows: kB, cols: n } = validateIntervalMatrix(B, 'B');

	if (k !== kB) {
		throw new RangeError(
			`Incompatible matrix dimensions: A is ${m}x${k} and B is ${kB}x${n}`
		);
	}

	const C = new Array(m);
	for (let i = 0; i < m; i++) {
		const aRow = A[i];
		const cRow = new Array(n);
		for (let j = 0; j < n; j++) {
			let sumLo = 0;
			let sumHi = 0;

			for (let t = 0; t < k; t++) {
				const aIv = aRow[t];
				const bIv = B[t][j];
				const aLo = aIv[0];
				const aHi = aIv[1];
				const bLo = bIv[0];
				const bHi = bIv[1];

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

				sumLo = addDown(sumLo, pLo);
				sumHi = addUp(sumHi, pHi);
			}

			cRow[j] = [sumLo === 0 ? 0 : sumLo, sumHi === 0 ? 0 : sumHi];
		}
		C[i] = cRow;
	}

	return C;
}
