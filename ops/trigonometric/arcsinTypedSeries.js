const HALF_PI = Math.PI / 2
const MAX_SERIES_TERMS = 64

/**
 * Evaluates arcsin(x) via its Maclaurin series for |x| <= 0.5:
 *   arcsin(x) = x + sum_{n=1..inf} ((2n - 1)!! / (2n)!!) * x^(2n + 1) / (2n + 1)
 *
 * @param {number} x - Input value satisfying |x| <= 0.5.
 * @returns {number} Approximation of arcsin(x) in radians.
 */
function arcsinMaclaurin(x) {
	const x2 = x * x
	let coeffPower = x
	let delta = 0

	for (let n = 1; n <= MAX_SERIES_TERMS; n++) {
		coeffPower *= ((2 * n - 1) / (2 * n)) * x2
		const term = coeffPower / (2 * n + 1)
		const nextDelta = delta + term
		if (nextDelta === delta && Math.abs(term) <= Math.abs(x) * Number.EPSILON * 0.25) {
			break
		}
		delta = nextDelta
		if (Math.abs(term) <= Math.abs(x + delta) * Number.EPSILON * 0.25) {
			break
		}
	}

	return x + delta
}

/**
 * Computes the inverse sine (arcsin) element-wise over a Float64Array using a
 * Maclaurin series for |x| <= 0.5 and the half-angle identity
 *   arcsin(|x|) = pi/2 - 2 * arcsin(sqrt((1 - |x|) / 2))
 * for 0.5 < |x| <= 1, returning results in radians in [-pi/2, pi/2].
 *
 * Elements with |x| > 1 or NaN produce NaN. Signed zero (-0 / +0) is preserved.
 * Does not mutate the input array.
 *
 * @param {Float64Array} input - Input array of values.
 * @returns {Float64Array} New Float64Array containing element-wise arcsin values in radians.
 * @throws {TypeError} If input is not a Float64Array.
 */
export function arcsinTypedSeries(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('Expected input to be a Float64Array')
	}

	const len = input.length
	const output = new Float64Array(len)

	for (let i = 0; i < len; i++) {
		const x = input[i]

		if (Number.isNaN(x) || x < -1 || x > 1) {
			output[i] = Number.NaN
			continue
		}

		if (x === 0) {
			output[i] = x
			continue
		}

		if (x === 1) {
			output[i] = HALF_PI
			continue
		}

		if (x === -1) {
			output[i] = -HALF_PI
			continue
		}

		const absX = Math.abs(x)
		if (absX <= 0.5) {
			output[i] = arcsinMaclaurin(x)
		} else {
			const z = Math.sqrt((1 - absX) / 2)
			const mag = HALF_PI - 2 * arcsinMaclaurin(z)
			output[i] = x < 0 ? -mag : mag
		}
	}

	return output
}
