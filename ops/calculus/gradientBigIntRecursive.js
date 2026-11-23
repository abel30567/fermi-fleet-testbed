const SCALE = 10n ** 18n

/**
 * Divides two BigInts with symmetric round-half-away-from-zero semantics.
 * Assumes `denominator > 0n`.
 *
 * @param {bigint} numerator
 * @param {bigint} denominator
 * @returns {bigint}
 */
function divRoundBigInt(numerator, denominator) {
	const half = denominator / 2n
	return numerator >= 0n
		? (numerator + half) / denominator
		: (numerator - half) / denominator
}

/**
 * Recursively computes partial derivatives for coordinate indices `[low, high)`
 * using divide-and-conquer and writes fixed-point results into `out`.
 *
 * @param {(point: bigint[]) => bigint} fn
 * @param {bigint[]} point
 * @param {bigint} step
 * @param {bigint} twoStep
 * @param {number} low
 * @param {number} high
 * @param {bigint[]} out
 */
function computeGradientRange(fn, point, step, twoStep, low, high, out) {
	if (high - low === 1) {
		const idx = low
		const plusPoint = point.with(idx, point[idx] + step)
		const minusPoint = point.with(idx, point[idx] - step)

		const fPlus = fn(plusPoint)
		if (typeof fPlus !== 'bigint') {
			throw new TypeError(`fn must return a BigInt (received ${typeof fPlus})`)
		}

		const fMinus = fn(minusPoint)
		if (typeof fMinus !== 'bigint') {
			throw new TypeError(`fn must return a BigInt (received ${typeof fMinus})`)
		}

		out[idx] = divRoundBigInt((fPlus - fMinus) * SCALE, twoStep)
		return
	}

	const mid = low + ((high - low) >> 1)
	computeGradientRange(fn, point, step, twoStep, low, mid, out)
	computeGradientRange(fn, point, step, twoStep, mid, high, out)
}

/**
 * Computes the numerical gradient (vector of partial derivatives) of a
 * multivariable scalar function `fn` at `point` over exact BigInt integers,
 * using a recursive divide-and-conquer traversal over the coordinate axes.
 *
 * Each partial derivative is estimated via central finite difference:
 *   (fn(x + step * e_i) - fn(x - step * e_i)) / (2 * step)
 * and returned as a fixed-point BigInt scaled by 10^18 (with symmetric
 * round-half-away-from-zero rounding when the quotient is non-integer).
 *
 * Because the derivative is a ratio of output change to input change, the
 * 10^18 fixed-point output scale holds identically whether `point` and `fn`
 * operate on unscaled BigInt integers or on 10^18 fixed-point BigInt values.
 *
 * @param {(point: bigint[]) => bigint} fn - Scalar function mapping a BigInt coordinate vector to a BigInt.
 * @param {bigint[]} point - Non-empty array of BigInt coordinates where the gradient is evaluated.
 * @param {bigint} [step=1n] - Strictly positive BigInt step size for central finite differences.
 * @returns {bigint[]} Gradient vector as fixed-point BigInts scaled by 10^18.
 * @throws {TypeError} If `fn` is not a function, `point` is not an array of BigInts, `step` is not a BigInt, or `fn` returns a non-BigInt.
 * @throws {RangeError} If `point` is empty or `step <= 0n`.
 */
export function gradientBigIntRecursive(fn, point, step = 1n) {
	if (typeof fn !== 'function') {
		throw new TypeError('fn must be a function')
	}
	if (!Array.isArray(point)) {
		throw new TypeError('point must be an array of BigInt values')
	}
	if (point.length === 0) {
		throw new RangeError('point must not be empty')
	}

	const snapshot = new Array(point.length)
	for (let i = 0; i < point.length; i++) {
		if (typeof point[i] !== 'bigint') {
			throw new TypeError(`point[${i}] must be a BigInt`)
		}
		snapshot[i] = point[i]
	}

	if (typeof step !== 'bigint') {
		throw new TypeError('step must be a BigInt')
	}
	if (step <= 0n) {
		throw new RangeError('step must be a positive BigInt')
	}

	const result = new Array(snapshot.length)
	const twoStep = 2n * step
	computeGradientRange(fn, snapshot, step, twoStep, 0, snapshot.length, result)
	return result
}
