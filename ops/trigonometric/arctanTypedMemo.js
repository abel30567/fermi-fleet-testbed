/**
 * Element-wise arctangent (`atan`) over `Float64Array` inputs using a
 * precomputed lookup table with exact tangent-difference refinement and
 * bounded per-value memoization.
 *
 * For any finite `u = |x|`:
 * - Range-reduce `u > 1` via `atan(u) = pi/2 - atan(1 / u)`.
 * - Snap `u` in `[0, 1]` to the nearest precomputed table node `t = k / N`.
 * - Compute the exact residual `z = (u - t) / (1 + u * t)` so `|z| <= 1 / (2N)`.
 * - Evaluate `atan(z)` via a degree-7 minimax/Taylor odd polynomial, yielding
 *   full IEEE-754 double precision (`< 1e-15` error) without runtime `Math.atan`.
 *
 * @module ops/trigonometric/arctanTypedMemo
 */

const HALF_PI = Math.PI / 2;
const TABLE_SIZE = 1024;
const MAX_CACHE_SIZE = 4096;

/**
 * Computes `atan(t)` for `t` in `[0, 1]` using 4 half-angle reductions and a
 * degree-13 odd Taylor polynomial (used once at module load to populate the table).
 *
 * @param {number} t - Value in `[0, 1]`.
 * @returns {number} `atan(t)` accurate to IEEE-754 double precision.
 */
function computeTableEntry(t) {
	if (t === 0) return 0;
	let r = t;
	for (let i = 0; i < 4; i++) {
		r = r / (1 + Math.sqrt(1 + r * r));
	}
	const r2 = r * r;
	const poly =
		r *
		(1 +
			r2 *
				(-1 / 3 +
					r2 *
						(1 / 5 +
							r2 *
								(-1 / 7 +
									r2 * (1 / 9 + r2 * (-1 / 11 + r2 / 13))))));
	return 16 * poly;
}

/** Precomputed table of `atan(k / TABLE_SIZE)` for `k = 0..TABLE_SIZE`. */
const ATAN_TABLE = new Float64Array(TABLE_SIZE + 1);
for (let k = 0; k <= TABLE_SIZE; k++) {
	ATAN_TABLE[k] = computeTableEntry(k / TABLE_SIZE);
}

/** Bounded FIFO memoization cache mapping finite `|x| > 0` to `atan(|x|)`. */
const memoCache = new Map();

/**
 * Evaluates `atan(u)` for `u` in `[0, 1]` using `ATAN_TABLE` and exact
 * arctangent-difference refinement.
 *
 * @param {number} u - Value in `[0, 1]`.
 * @returns {number} `atan(u)`.
 */
function atanUnit(u) {
	const index = Math.round(u * TABLE_SIZE);
	const t = index / TABLE_SIZE;
	const z = (u - t) / (1 + u * t);
	const z2 = z * z;
	const delta = z * (1 + z2 * (-1 / 3 + z2 * (1 / 5 - z2 / 7)));
	return ATAN_TABLE[index] + delta;
}

/**
 * Computes `atan(u)` for finite `u > 0`, consulting and updating `memoCache`.
 *
 * @param {number} u - Finite positive number.
 * @returns {number} `atan(u)`.
 */
function atanPositiveMemo(u) {
	const cached = memoCache.get(u);
	if (cached !== undefined) {
		return cached;
	}

	const result = u <= 1 ? atanUnit(u) : HALF_PI - atanUnit(1 / u);

	if (memoCache.size >= MAX_CACHE_SIZE) {
		const oldestKey = memoCache.keys().next().value;
		memoCache.delete(oldestKey);
	}
	memoCache.set(u, result);
	return result;
}

/**
 * Computes the element-wise arctangent (in radians, within `[-pi/2, pi/2]`)
 * of a `Float64Array`, using a precomputed lookup table and memoization cache.
 *
 * Does not mutate the input array. Preserves IEEE-754 special values
 * (`+0`, `-0`, `NaN`, `+Infinity`, `-Infinity`).
 *
 * @param {Float64Array} input - Input vector of 64-bit floating-point numbers.
 * @returns {Float64Array} New `Float64Array` containing `atan(input[i])` for each element.
 * @throws {TypeError} If `input` is not an instance of `Float64Array`.
 */
export function arctanTypedMemo(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('arctanTypedMemo expects a Float64Array input');
	}

	const len = input.length;
	const out = new Float64Array(len);

	for (let i = 0; i < len; i++) {
		const x = input[i];

		if (x === 0) {
			// Preserves signed zero (+0 -> +0, -0 -> -0)
			out[i] = x;
			continue;
		}
		if (Number.isNaN(x)) {
			out[i] = Number.NaN;
			continue;
		}
		if (x === Number.POSITIVE_INFINITY) {
			out[i] = HALF_PI;
			continue;
		}
		if (x === Number.NEGATIVE_INFINITY) {
			out[i] = -HALF_PI;
			continue;
		}

		if (x < 0) {
			out[i] = -atanPositiveMemo(-x);
		} else {
			out[i] = atanPositiveMemo(x);
		}
	}

	return out;
}
