/**
 * @module ops/logarithmic/log2TypedMemo
 * Element-wise base-2 logarithm over {@link Float64Array} inputs using
 * precomputed lookup tables and bounded scalar memoization.
 */

const TABLE_SIZE = 256;
const INV_TABLE_SIZE = 1 / TABLE_SIZE;
const SMALL_INT_LIMIT = 1024;
const MAX_CACHE_SIZE = 4096;

const LN2 = 0.6931471805599453;
const TWO_OVER_LN2 = 2 / LN2;
const ONE_THIRD = 1 / 3;
const ONE_FIFTH = 1 / 5;
const ONE_SEVENTH = 1 / 7;

const MIN_NORMAL = 2.2250738585072014e-308; // 2^-1022
const TWO_POW_54 = 18014398509481984; // 2^54

const scratchBuffer = new ArrayBuffer(8);
const scratchF64 = new Float64Array(scratchBuffer);
const scratchU64 = new BigUint64Array(scratchBuffer);

/**
 * Computes log2(x) for x in [1, 2] using the convergent atanh series
 * ln(x) = 2 * sum_{k=0..N} ((x - 1) / (x + 1))^(2k + 1) / (2k + 1).
 * Used once at module load to populate precomputed tables without external deps.
 *
 * @param {number} x - Value in [1, 2].
 * @returns {number} Base-2 logarithm of x.
 */
function seriesLog2Unit(x) {
	if (x === 1) return 0;
	if (x === 2) return 1;
	const s = (x - 1) / (x + 1);
	const s2 = s * s;
	let term = s;
	let sum = term;
	for (let denom = 3; denom <= 45; denom += 2) {
		term *= s2;
		sum += term / denom;
	}
	return TWO_OVER_LN2 * sum;
}

/**
 * Precomputed lookup table of log2(1 + i / TABLE_SIZE) for i in [0, TABLE_SIZE].
 * @type {Float64Array}
 */
const LOG2_TABLE = new Float64Array(TABLE_SIZE + 1);
for (let i = 0; i <= TABLE_SIZE; i++) {
	LOG2_TABLE[i] = seriesLog2Unit(1 + i * INV_TABLE_SIZE);
}

/**
 * Computes log2(x) for a positive finite IEEE 754 float64 using exponent
 * extraction, the precomputed {@link LOG2_TABLE}, and a degree-7 odd polynomial
 * remainder in t = (m - c) / (m + c).
 *
 * @param {number} x - Positive finite number.
 * @returns {number} Base-2 logarithm of x.
 */
function computeLog2TableDriven(x) {
	let scaled = x;
	let expAdjust = 0;
	if (scaled < MIN_NORMAL) {
		scaled *= TWO_POW_54;
		expAdjust = -54;
	}

	scratchF64[0] = scaled;
	const bits = scratchU64[0];
	const exp = Number((bits >> 52n) & 0x7ffn) - 1023 + expAdjust;

	// Normalize mantissa m into [1, 2) by setting exponent bits to 1023 (0x3ff).
	scratchU64[0] = (bits & 0x000fffffffffffffn) | 0x3ff0000000000000n;
	const m = scratchF64[0];

	if (m === 1) {
		return exp;
	}

	const idx = Math.round((m - 1) * TABLE_SIZE);
	const c = 1 + idx * INV_TABLE_SIZE;
	const t = (m - c) / (m + c);
	const t2 = t * t;
	const remainder =
		TWO_OVER_LN2 *
		t *
		(1 + t2 * (ONE_THIRD + t2 * (ONE_FIFTH + t2 * ONE_SEVENTH)));

	return exp + LOG2_TABLE[idx] + remainder;
}

/**
 * Precomputed lookup table of log2(n) for small positive integers 1..SMALL_INT_LIMIT.
 * Index 0 is unused (-Infinity).
 * @type {Float64Array}
 */
const SMALL_INT_LOG2 = new Float64Array(SMALL_INT_LIMIT + 1);
SMALL_INT_LOG2[0] = -Infinity;
for (let n = 1; n <= SMALL_INT_LIMIT; n++) {
	SMALL_INT_LOG2[n] = computeLog2TableDriven(n);
}

/**
 * Bounded FIFO memoization cache for arbitrary positive finite float64 inputs.
 * @type {Map<number, number>}
 */
const memoCache = new Map();

/**
 * Evaluates log2 for a single float64 scalar with IEEE 754 special-value
 * semantics, precomputed table lookup, and bounded memoization.
 *
 * @param {number} x - Scalar input value.
 * @returns {number} Base-2 logarithm of x.
 */
function log2ScalarMemo(x) {
	if (Number.isNaN(x) || x < 0) {
		return NaN;
	}
	if (x === 0) {
		return -Infinity;
	}
	if (!Number.isFinite(x)) {
		return Infinity;
	}

	if (x <= SMALL_INT_LIMIT && (x | 0) === x) {
		return SMALL_INT_LOG2[x];
	}

	const cached = memoCache.get(x);
	if (cached !== undefined) {
		return cached;
	}

	const result = computeLog2TableDriven(x);
	if (memoCache.size >= MAX_CACHE_SIZE) {
		const oldestKey = memoCache.keys().next().value;
		memoCache.delete(oldestKey);
	}
	memoCache.set(x, result);
	return result;
}

/**
 * Computes the element-wise base-2 logarithm (`log2`) over a {@link Float64Array}
 * using precomputed lookup tables and bounded scalar memoization.
 *
 * Non-positive and special IEEE 754 values follow standard `Math.log2` semantics:
 * - `0` and `-0` map to `-Infinity`
 * - negative numbers and `NaN` map to `NaN`
 * - `+Infinity` maps to `+Infinity`
 *
 * The input {@link Float64Array} is never mutated; a new {@link Float64Array}
 * of the same length is always returned.
 *
 * @param {Float64Array} input - Typed array of float64 values.
 * @returns {Float64Array} New Float64Array containing element-wise `log2` values.
 * @throws {TypeError} If `input` is not an instance of {@link Float64Array}.
 */
export function log2TypedMemo(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError("Expected input to be a Float64Array");
	}

	const len = input.length;
	const out = new Float64Array(len);

	for (let i = 0; i < len; i++) {
		out[i] = log2ScalarMemo(input[i]);
	}

	return out;
}
