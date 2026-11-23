/**
 * Computes the base-10 logarithm of a dual number `x = v + d·ε` (where `ε² = 0`),
 * carrying a forward-mode derivative alongside the primal value.
 *
 * Derivation via the Mercator series identity:
 *   log10(v + d·ε) = log10(v) + log10(1 + (d / v)·ε)
 *                  = log10(v) + (1 / ln(10)) · Σ_{k≥1} ((-1)^(k-1) / k) · ((d / v)·ε)^k
 *                  = log10(v) + (d / v) · log10(e) · ε
 * because all higher-order terms vanish (`ε^k = 0` for `k ≥ 2`).
 *
 * @param {{ v: number, d: number }} x - Dual number with finite primal value `v > 0` and finite derivative `d`.
 * @returns {{ v: number, d: number }} Dual number `{ v: log10(x.v), d: x.d * Math.LOG10E / x.v }`.
 * @throws {TypeError} If `x` is not a non-null object with numeric `v` and `d` properties.
 * @throws {RangeError} If `x.v` or `x.d` is non-finite (NaN or ±Infinity), or if `x.v <= 0`.
 */
export function log10DualSeries(x) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('Expected dual number to be a non-null object { v, d }');
	}

	const { v, d } = x;

	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError('Dual number components v and d must be numbers');
	}

	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError('Dual number components v and d must be finite numbers');
	}

	if (v <= 0) {
		throw new RangeError('log10DualSeries requires primal value v > 0');
	}

	const value = Math.log10(v);
	// Scale before dividing when |d| is huge and v < 1 to avoid spurious overflow;
	// otherwise divide d / v first to avoid overflow for large v or underflow for tiny d.
	const derivative =
		d === 0
			? 0
			: Math.abs(d) > 1e150 && v < 1
				? (d * Math.LOG10E) / v
				: (d / v) * Math.LOG10E;

	return { v: value, d: derivative };
}
