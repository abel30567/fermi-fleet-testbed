/**
 * Normalizes negative zero (`-0`) to positive zero (`0`).
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Computes `exp(logR) * factor` safely across the full IEEE-754 finite range.
 *
 * When `logR` is outside the normal exponential range `[-708, 709]`, evaluates
 * `sign(factor) * exp(logR + ln(|factor|))` so that products whose magnitude
 * slightly exceeds `Number.MAX_VALUE` while their components remain finite
 * (e.g., `1.5e308 + 1.5e308i`) do not spuriously overflow, and `factor === 0`
 * never produces `NaN` via `Infinity * 0`.
 *
 * @param {number} logR - Natural logarithm of the product modulus.
 * @param {number} factor - Trigonometric component in `[-1, 1]`.
 * @returns {number}
 */
function scaleExp(logR, factor) {
	if (factor === 0) {
		return 0
	}
	if (logR >= -708 && logR <= 709) {
		return Math.exp(logR) * factor
	}
	return Math.sign(factor) * Math.exp(logR + Math.log(Math.abs(factor)))
}

/**
 * Computes the discrete product of an array of complex numbers `{ re, im }`
 * using the complex exponential-logarithm (polar) identity with exact
 * quarter-turn phase decomposition and Neumaier compensated summation.
 *
 * ## Mathematical Identity
 * For nonzero complex numbers $z_k = a_k + i b_k \in \mathbb{C} \setminus \{0\}$:
 * $$\prod_{k=0}^{n-1} z_k = \exp\!\left(\sum_{k=0}^{n-1} \operatorname{Ln}(z_k)\right)
 *   = \exp\!\left(\sum_{k=0}^{n-1} \ln |z_k|\right)
 *     \cdot \exp\!\left(i \sum_{k=0}^{n-1} \arg(z_k)\right)$$
 *
 * ## Numerical Stability & Branch-Cut Handling
 * - **Empty product**: Returns the multiplicative identity `{ re: 1, im: 0 }`.
 * - **Zero factors**: If any element is `0 + 0i`, returns `{ re: 0, im: 0 }`
 *   after validating all elements in the input array.
 * - **Overflow/underflow-safe log-modulus**: Computes
 *   $\ln |a + bi| = \ln(\max(|a|, |b|)) + \tfrac{1}{2}\ln\!\left(1 + (\min(|a|, |b|) / \max(|a|, |b|))^2\right)$
 *   via `Math.log1p`, avoiding intermediate overflow/underflow for all finite
 *   IEEE-754 inputs (including extreme magnitudes whose intermediate direct
 *   products would overflow or underflow).
 * - **Exact quarter-turn decomposition**: Each argument is decomposed as
 *   $\arg(z_k) = q_k \frac{\pi}{2} + \delta_k$ with $q_k \in \{0, 1, 2, 3\}$
 *   and $\delta_k \in [-\pi/4, \pi/4]$. Quarter-turns are accumulated exactly
 *   modulo 4, guaranteeing exact results (zero drift) for purely real and
 *   purely imaginary factors (e.g., powers of $i$ and $-1$).
 * - **Compensated summation**: Both $\sum \ln |z_k|$ and $\sum \delta_k$ use
 *   Neumaier compensated summation to reduce floating-point cancellation error.
 *
 * @param {Array<{ re: number, im: number }>} values - Array of complex numbers `{ re, im }`.
 * @returns {{ re: number, im: number }} The complex product of all elements in `values`.
 * @throws {TypeError} If `values` is not an array, or any element is not a
 *   non-null object with numeric `re` and `im` properties.
 * @throws {RangeError} If any element has a non-finite (`NaN`, `Infinity`, or `-Infinity`)
 *   `re` or `im` component.
 */
export function productComplexSeries(values) {
	if (!Array.isArray(values)) {
		throw new TypeError('values must be an array of complex numbers { re, im }')
	}

	let hasZero = false
	let logAbsSum = 0
	let logAbsComp = 0
	let thetaSum = 0
	let thetaComp = 0
	let quarterTurns = 0

	for (let i = 0; i < values.length; i++) {
		const z = values[i]
		if (z === null || typeof z !== 'object' || Array.isArray(z)) {
			throw new TypeError(`values[${i}] must be a complex number object { re, im }`)
		}

		const { re, im } = z
		if (typeof re !== 'number' || typeof im !== 'number') {
			throw new TypeError(`values[${i}].re and values[${i}].im must be numbers`)
		}
		if (!Number.isFinite(re) || !Number.isFinite(im)) {
			throw new RangeError(`values[${i}].re and values[${i}].im must be finite numbers`)
		}

		if (re === 0 && im === 0) {
			hasZero = true
			continue
		}
		if (hasZero) {
			continue
		}

		const absRe = Math.abs(re)
		const absIm = Math.abs(im)
		let logAbs
		if (absRe >= absIm) {
			const ratio = absIm / absRe
			logAbs = Math.log(absRe) + 0.5 * Math.log1p(ratio * ratio)
		} else {
			const ratio = absRe / absIm
			logAbs = Math.log(absIm) + 0.5 * Math.log1p(ratio * ratio)
		}

		// Neumaier compensated summation for log-modulus
		{
			const t = logAbsSum + logAbs
			if (Math.abs(logAbsSum) >= Math.abs(logAbs)) {
				logAbsComp += (logAbsSum - t) + logAbs
			} else {
				logAbsComp += (logAbs - t) + logAbsSum
			}
			logAbsSum = t
		}

		// Exact quarter-turn + residual argument decomposition
		let q
		let residual
		if (absRe >= absIm) {
			if (re > 0) {
				q = 0
				residual = im === 0 ? 0 : Math.atan2(im, re)
			} else {
				q = 2
				residual = im === 0 ? 0 : Math.atan2(-im, -re)
			}
		} else if (im > 0) {
			q = 1
			residual = re === 0 ? 0 : Math.atan2(-re, im)
		} else {
			q = 3
			residual = re === 0 ? 0 : Math.atan2(re, -im)
		}

		quarterTurns = (quarterTurns + q) & 3

		if (residual !== 0) {
			// Neumaier compensated summation for residual phase
			const t = thetaSum + residual
			if (Math.abs(thetaSum) >= Math.abs(residual)) {
				thetaComp += (thetaSum - t) + residual
			} else {
				thetaComp += (residual - t) + thetaSum
			}
			thetaSum = t
		}
	}

	if (hasZero) {
		return { re: 0, im: 0 }
	}

	const totalLogAbs = logAbsSum + logAbsComp
	const totalTheta = thetaSum + thetaComp
	const cosTheta = Math.cos(totalTheta)
	const sinTheta = Math.sin(totalTheta)

	let reFactor
	let imFactor
	switch (quarterTurns) {
		case 0:
			reFactor = cosTheta
			imFactor = sinTheta
			break
		case 1:
			reFactor = -sinTheta
			imFactor = cosTheta
			break
		case 2:
			reFactor = -cosTheta
			imFactor = -sinTheta
			break
		default:
			reFactor = sinTheta
			imFactor = -cosTheta
			break
	}

	return {
		re: normalizeZero(scaleExp(totalLogAbs, reFactor)),
		im: normalizeZero(scaleExp(totalLogAbs, imFactor)),
	}
}
