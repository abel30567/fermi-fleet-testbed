/**
 * Computes the discrete floored modulo of two finite IEEE-754 float64 numbers:
 *
 *   moduloFloatSeries(a, m) = a - m * floor(a / m)
 *
 * Mathematical definition and range:
 * - For `m > 0`, the result lies in the half-open interval `[0, m)`.
 * - For `m < 0`, the result lies in the half-open interval `(m, 0]`.
 * - Exact multiples (`a = k * m` for integer `k`) always return `+0` (never `-0`).
 *
 * Implementation identity:
 * Uses the exact IEEE-754 truncated remainder `r = a % m = a - m * trunc(a / m)`.
 * Computing from `a % m` avoids precision loss in `a - m * Math.floor(a / m)` when
 * `|a / m| > 2^53`, avoids precision loss in `((a % m) + m) % m` when `0 < |r| << |m|`
 * with matching signs, and avoids overflow when `|m|` is near `Number.MAX_VALUE`:
 * - If `r === 0`, return `+0`.
 * - If `r` and `m` share the same sign, `floor(a / m) === trunc(a / m)`, so `r` is exact.
 * - If `r` and `m` have opposite signs, `floor(a / m) === trunc(a / m) - 1`, so the
 *   floored modulo is `r + m`. If IEEE-754 rounding maps `r + m` onto the open boundary
 *   `m` (which occurs when `|r| <= 0.5 * ulp(m)`), wrap to `+0` (`m ≡ 0 (mod m)`).
 *
 * @param {number} a - Finite float64 dividend.
 * @param {number} m - Finite non-zero float64 divisor (modulus).
 * @returns {number} The floored modulo `a mod m` in `[0, m)` for `m > 0` or `(m, 0]` for `m < 0`.
 * @throws {TypeError} If `a` or `m` is not a number.
 * @throws {RangeError} If `a` or `m` is non-finite (`NaN`, `±Infinity`), or if `m === 0`.
 */
export function moduloFloatSeries(a, m) {
	if (typeof a !== 'number' || typeof m !== 'number') {
		throw new TypeError('moduloFloatSeries expects finite numbers a and m')
	}
	if (!Number.isFinite(a) || !Number.isFinite(m)) {
		throw new RangeError('moduloFloatSeries expects finite numbers a and m')
	}
	if (m === 0) {
		throw new RangeError('moduloFloatSeries divisor m must be non-zero')
	}

	const r = a % m
	if (r === 0) {
		return 0
	}

	if ((r > 0 && m > 0) || (r < 0 && m < 0)) {
		return r
	}

	const shifted = r + m
	if (shifted === m || shifted === 0) {
		return 0
	}
	return shifted
}
