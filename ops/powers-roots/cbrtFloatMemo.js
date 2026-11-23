/**
 * Table-driven, memoized cube root over IEEE-754 float64 Numbers.
 *
 * Uses precomputed IEEE-754 mantissa, remainder-scale, power-of-two exponent,
 * and exact integer cube tables combined with Halley's method (cubic
 * convergence) and a bounded LRU-style memoization cache.
 *
 * Zero external dependencies. Pure ES module (Node 20+).
 */

const MANTISSA_BITS = 8;
const MANTISSA_TABLE_SIZE = 1 << MANTISSA_BITS; // 256
const SUBNORMAL_THRESHOLD = 2 ** -1022; // Smallest positive normal float64
const SUBNORMAL_SCALE = 2 ** 54; // 54 = 3 * 18, lifts all subnormals to normal
const SUBNORMAL_EXP_SHIFT = -54;

// Exponent e ranges over [-1074, 1023], so q = floor(e / 3) ranges over [-358, 341].
const EXP2_MIN_Q = -358;
const EXP2_MAX_Q = 341;
const EXP2_OFFSET = -EXP2_MIN_Q;
const EXP2_TABLE_SIZE = EXP2_MAX_Q - EXP2_MIN_Q + 1;

// Bounded memoization cache size for general float64 inputs (keyed by |x|).
const MAX_MEMO_SIZE = 4096;

// Precomputed exact cube lookup for |k| <= 1024 (k^3 <= 1,073,741,824).
const EXACT_CUBE_LIMIT = 1024;

// Scratch buffer for endian-safe IEEE-754 float64 bit extraction.
const _scratchBuf = new ArrayBuffer(8);
const _f64 = new Float64Array(_scratchBuf);
const _u32 = new Uint32Array(_scratchBuf);
_f64[0] = 1.0; // IEEE-754 1.0 === 0x3FF00000_00000000
const _HI = _u32[1] === 0x3ff00000 ? 1 : 0;

/**
 * Self-contained Halley solver used only during module initialization to
 * populate the precomputed tables without relying on Math.cbrt.
 *
 * @param {number} target Positive value in [1, 8].
 * @returns {number} Cube root of target.
 */
function _seedCbrt(target) {
	let y = 1 + (target - 1) / 3;
	for (let i = 0; i < 6; i++) {
		const y3 = y * y * y;
		y -= (y * (y3 - target)) / (2 * y3 + target);
	}
	return y;
}

/**
 * Precomputed mantissa table: MANTISSA_CBRT_TABLE[i] = (1 + (i + 0.5) / 256)^(1/3).
 * Provides ~10 bits of initial precision from an 8-bit mantissa prefix lookup.
 */
const MANTISSA_CBRT_TABLE = new Float64Array(MANTISSA_TABLE_SIZE);
for (let i = 0; i < MANTISSA_TABLE_SIZE; i++) {
	const midpoint = 1 + (i + 0.5) / MANTISSA_TABLE_SIZE;
	MANTISSA_CBRT_TABLE[i] = _seedCbrt(midpoint);
}

/**
 * Precomputed scale factors for remainder r = e mod 3 in {0, 1, 2}:
 * [2^(0/3), 2^(1/3), 2^(2/3)].
 */
const REM_SCALE_TABLE = new Float64Array([1, _seedCbrt(2), _seedCbrt(4)]);

/**
 * Precomputed exact powers of two: EXP2_TABLE[q + EXP2_OFFSET] = 2^q
 * for all q in [-358, 341].
 */
const EXP2_TABLE = new Float64Array(EXP2_TABLE_SIZE);
for (let q = EXP2_MIN_Q; q <= EXP2_MAX_Q; q++) {
	EXP2_TABLE[q + EXP2_OFFSET] = 2 ** q;
}

/**
 * Precomputed exact integer cube table mapping k^3 -> k for 1 <= k <= 1024.
 */
const EXACT_CUBE_TABLE = new Map();
for (let k = 1; k <= EXACT_CUBE_LIMIT; k++) {
	EXACT_CUBE_TABLE.set(k * k * k, k);
}

/**
 * Bounded LRU memoization cache mapping positive finite float64 |x| -> cbrt(|x|).
 */
const _memoCache = new Map();

/**
 * Computes cbrt(absX) for a positive finite float64 using IEEE-754
 * decomposition, precomputed lookup tables, and Halley refinement.
 *
 * @param {number} absX Positive finite float64 number.
 * @returns {number} Cube root of absX.
 */
function _computePositiveCbrt(absX) {
	let scaled = absX;
	let expShift = 0;

	if (scaled < SUBNORMAL_THRESHOLD) {
		scaled *= SUBNORMAL_SCALE;
		expShift = SUBNORMAL_EXP_SHIFT;
	}

	_f64[0] = scaled;
	const hi = _u32[_HI];
	const biasedExp = (hi >>> 20) & 0x7ff;
	const e = biasedExp - 1023 + expShift;

	// Normalize mantissa m into [1, 2) by setting exponent bits to 1023 (0x3FF).
	_u32[_HI] = (hi & 0x000fffff) | 0x3ff00000;
	const m = _f64[0];

	// Decompose e = 3*q + r with r in {0, 1, 2}.
	const q = Math.floor(e / 3);
	const r = e - 3 * q;

	// Exact scaling a = m * 2^r in [1, 8).
	const a = r === 0 ? m : r === 1 ? m * 2 : m * 4;

	// Table lookup using the top 8 fraction bits of m and remainder factor 2^(r/3).
	const idx = (hi >>> 12) & 0xff;
	let y = MANTISSA_CBRT_TABLE[idx] * REM_SCALE_TABLE[r];

	// Two Halley iterations (cubic convergence: ~10 bits -> ~32 bits -> full 53-bit float64).
	let y3 = y * y * y;
	y -= (y * (y3 - a)) / (2 * y3 + a);

	y3 = y * y * y;
	y -= (y * (y3 - a)) / (2 * y3 + a);

	// Exact power-of-two scaling by 2^q (only adjusts IEEE-754 exponent).
	return y * EXP2_TABLE[q + EXP2_OFFSET];
}

/**
 * Computes the real cube root of an IEEE-754 float64 number using precomputed
 * lookup tables, Halley's method refinement, and bounded memoization.
 *
 * Preserves IEEE-754 special values:
 * - `cbrtFloatMemo(0)` returns `+0`
 * - `cbrtFloatMemo(-0)` returns `-0`
 * - `cbrtFloatMemo(Infinity)` returns `Infinity`
 * - `cbrtFloatMemo(-Infinity)` returns `-Infinity`
 * - `cbrtFloatMemo(NaN)` returns `NaN`
 *
 * @param {number} x The IEEE-754 float64 number whose cube root is computed.
 * @returns {number} The real cube root of `x`.
 * @throws {TypeError} If `x` is not a JavaScript `number` primitive.
 */
export function cbrtFloatMemo(x) {
	if (typeof x !== 'number') {
		throw new TypeError(
			`cbrtFloatMemo expected a number, got ${x === null ? 'null' : typeof x}`,
		);
	}

	// Fast-path IEEE-754 special values: preserves +0, -0, ±Infinity, and NaN.
	if (x === 0 || !Number.isFinite(x)) {
		return x;
	}

	const negative = x < 0;
	const absX = negative ? -x : x;

	// Precomputed exact integer cubes fast-path.
	const exact = EXACT_CUBE_TABLE.get(absX);
	if (exact !== undefined) {
		return negative ? -exact : exact;
	}

	// Bounded LRU memoization lookup (keyed by |x| to share symmetric hits).
	const cached = _memoCache.get(absX);
	if (cached !== undefined) {
		// Refresh recency for LRU eviction.
		_memoCache.delete(absX);
		_memoCache.set(absX, cached);
		return negative ? -cached : cached;
	}

	const result = _computePositiveCbrt(absX);

	if (_memoCache.size >= MAX_MEMO_SIZE) {
		const oldestKey = _memoCache.keys().next().value;
		_memoCache.delete(oldestKey);
	}
	_memoCache.set(absX, result);

	return negative ? -result : result;
}
