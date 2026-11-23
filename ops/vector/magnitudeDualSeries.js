/**
 * Computes the Euclidean magnitude (L2 norm) of a vector of dual numbers `{ v, d }`,
 * carrying the primal value `v` alongside its forward-mode derivative `d`.
 *
 * For a dual vector `x = v + d * ε` (with `ε² = 0`), the squared norm is:
 *   `||x||² = Σ (v_i + d_i * ε)² = Σ v_i² + (2 Σ v_i d_i) * ε`
 *
 * Scaling by `M = max_i |v_i|` (`u_i = v_i / M`, `S_u = Σ u_i²`) avoids
 * intermediate overflow/underflow. Applying the binomial/Taylor series
 * `sqrt(S_u + Δ * ε) = sqrt(S_u) * (1 + Δ / (2 * S_u) * ε)` (exact for dual
 * numbers since `ε² = 0`) yields:
 *   `v_out = M * sqrt(S_u)`
 *   `d_out = (Σ u_i * d_i) / sqrt(S_u)`
 *
 * Edge cases:
 * - An empty vector returns `{ v: 0, d: 0 }`.
 * - A zero primal vector (`v_i === 0` for all `i`) returns `{ v: 0, d: 0 }` when
 *   all `d_i === 0`, and `{ v: 0, d: NaN }` when any `d_i !== 0` (since the L2
 *   norm is non-differentiable at the origin).
 *
 * @param {Array<{ v: number, d: number }>} vec - Array of dual number components.
 * @returns {{ v: number, d: number }} Dual number representing the vector magnitude and its derivative.
 * @throws {TypeError} If `vec` is not an array or any element is not an object with numeric `v` and `d`.
 * @throws {RangeError} If any `v` or `d` component is not a finite number.
 */
export function magnitudeDualSeries(vec) {
	if (!Array.isArray(vec)) {
		throw new TypeError('vec must be an array of dual numbers { v, d }')
	}

	const n = vec.length
	let maxAbsV = 0
	let hasNonZeroD = false

	for (let i = 0; i < n; i++) {
		const elem = vec[i]
		if (elem === null || typeof elem !== 'object') {
			throw new TypeError(`vec[${i}] must be a dual number object { v, d }`)
		}
		const { v, d } = elem
		if (typeof v !== 'number') {
			throw new TypeError(`vec[${i}].v must be a number`)
		}
		if (typeof d !== 'number') {
			throw new TypeError(`vec[${i}].d must be a number`)
		}
		if (!Number.isFinite(v)) {
			throw new RangeError(`vec[${i}].v must be a finite number`)
		}
		if (!Number.isFinite(d)) {
			throw new RangeError(`vec[${i}].d must be a finite number`)
		}

		const absV = Math.abs(v)
		if (absV > maxAbsV) {
			maxAbsV = absV
		}
		if (d !== 0) {
			hasNonZeroD = true
		}
	}

	if (n === 0) {
		return { v: 0, d: 0 }
	}

	if (maxAbsV === 0) {
		return { v: 0, d: hasNonZeroD ? Number.NaN : 0 }
	}

	// Scale primal components by maxAbsV to avoid overflow/underflow in squares.
	let sumScaledSq = 0
	let sumScaledDot = 0
	for (let i = 0; i < n; i++) {
		const u = vec[i].v / maxAbsV
		sumScaledSq += u * u
		sumScaledDot += u * vec[i].d
	}

	const scaledNorm = Math.sqrt(sumScaledSq)
	const vOut = maxAbsV * scaledNorm
	// First-order Taylor / binomial series of sqrt(S_u + (2 * sumScaledDot / M) * ε):
	// sqrt(S_u) * (1 + (sumScaledDot / (M * S_u)) * ε) -> M * sqrt(S_u) + (sumScaledDot / sqrt(S_u)) * ε
	const dOut = sumScaledDot / scaledNorm

	return {
		v: vOut === 0 ? 0 : vOut,
		d: dOut === 0 ? 0 : dOut,
	}
}
