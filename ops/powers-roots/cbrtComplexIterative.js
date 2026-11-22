/**
 * Computes the principal complex cube root of a complex number `z = { re, im }`
 * using an iterative Newton-Raphson method initialized near the principal branch
 * `cbrt(|z|) * exp(i * arg(z) / 3)`, with argument `arg(z)` in `(-π, π]`.
 *
 * The complex number is first scaled by an exact power of two (`2^(3k)`) to prevent
 * overflow or underflow during intermediate squaring and complex division across
 * the full IEEE 754 finite range, then Newton-Raphson iterations
 * `w_{n+1} = (2 * w_n + z / w_n^2) / 3` refine the root to machine precision.
 *
 * @param {{ re: number, im: number }} z - Complex number with finite `re` and `im` components.
 * @param {object} [options] - Optional convergence configuration.
 * @param {number} [options.maxIterations=64] - Maximum number of Newton-Raphson iterations (positive integer).
 * @param {number} [options.tolerance=1e-15] - Relative convergence tolerance (finite positive number).
 * @returns {{ re: number, im: number }} The principal complex cube root of `z`.
 * @throws {TypeError} If `z` is not an object with numeric `re` and `im` properties, or if `options` has invalid types.
 * @throws {RangeError} If `z.re` or `z.im` is not finite (`NaN`, `Infinity`, `-Infinity`), or if `options` values are out of range.
 */
export function cbrtComplexIterative(z, options) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError('z must be an object with numeric re and im properties')
	}
	if (typeof z.re !== 'number' || typeof z.im !== 'number') {
		throw new TypeError('z.re and z.im must be numbers')
	}
	if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
		throw new RangeError('z.re and z.im must be finite numbers')
	}

	let maxIterations = 64
	let tolerance = 1e-15

	if (options !== undefined) {
		if (options === null || typeof options !== 'object' || Array.isArray(options)) {
			throw new TypeError('options must be an object')
		}
		if (options.maxIterations !== undefined) {
			if (typeof options.maxIterations !== 'number') {
				throw new TypeError('options.maxIterations must be a number')
			}
			if (!Number.isInteger(options.maxIterations) || options.maxIterations < 1) {
				throw new RangeError('options.maxIterations must be a positive integer')
			}
			maxIterations = options.maxIterations
		}
		if (options.tolerance !== undefined) {
			if (typeof options.tolerance !== 'number') {
				throw new TypeError('options.tolerance must be a number')
			}
			if (!Number.isFinite(options.tolerance) || options.tolerance <= 0) {
				throw new RangeError('options.tolerance must be a finite positive number')
			}
			tolerance = options.tolerance
		}
	}

	// Normalize -0 to +0 so the branch cut along the negative real axis uses arg(-x + 0i) = +π consistently.
	const re = z.re === 0 ? 0 : z.re
	const im = z.im === 0 ? 0 : z.im

	if (re === 0 && im === 0) {
		return { re: 0, im: 0 }
	}

	// Scale z by 2^(-3 * scaleExp) so |zScaled| is O(1), preventing overflow/underflow in w^2.
	const maxAbs = Math.max(Math.abs(re), Math.abs(im))
	const scaleExp = Math.floor(Math.log2(maxAbs) / 3)
	const scale = 2 ** scaleExp
	const zRe = ((re / scale) / scale) / scale
	const zIm = ((im / scale) / scale) / scale

	// Principal-branch initial estimate: cbrt(r) * exp(i * theta / 3).
	const r = Math.hypot(zRe, zIm)
	const theta = Math.atan2(zIm, zRe)
	const mag = Math.cbrt(r)
	const angle = theta / 3

	let wRe = mag * Math.cos(angle)
	let wIm = mag * Math.sin(angle)

	// Iterative Newton-Raphson refinement for f(w) = w^3 - zScaled = 0:
	// w_{n+1} = (2 * w_n + zScaled / w_n^2) / 3
	for (let i = 0; i < maxIterations; i++) {
		const sqRe = wRe * wRe - wIm * wIm
		const sqIm = 2 * wRe * wIm
		const denom = sqRe * sqRe + sqIm * sqIm

		if (denom === 0) {
			break
		}

		const qRe = (zRe * sqRe + zIm * sqIm) / denom
		const qIm = (zIm * sqRe - zRe * sqIm) / denom

		const nextRe = (2 * wRe + qRe) / 3
		const nextIm = (2 * wIm + qIm) / 3

		const step = Math.hypot(nextRe - wRe, nextIm - wIm)
		const norm = Math.hypot(nextRe, nextIm)

		wRe = nextRe
		wIm = nextIm

		if (step <= tolerance * Math.max(1, norm)) {
			break
		}
	}

	const outRe = wRe * scale
	const outIm = wIm * scale

	return {
		re: outRe === 0 ? 0 : outRe,
		im: outIm === 0 ? 0 : outIm,
	}
}
