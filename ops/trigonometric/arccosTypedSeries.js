const HALF_PI = Math.PI / 2
const MAX_SERIES_TERMS = 60

/**
 * Evaluates arcsin(z) via its Maclaurin power series for |z| <= 0.5:
 *   arcsin(z) = sum_{n=0}^{inf} ((2n-1)!! / (2n)!!) * z^(2n+1) / (2n+1)
 *
 * @param {number} z Input value with |z| <= 0.5.
 * @returns {number} Approximation of arcsin(z) in radians.
 */
function arcsinSeries(z) {
	if (z === 0) {
		return 0
	}
	const z2 = z * z
	let factor = z
	let sum = z
	for (let n = 1; n <= MAX_SERIES_TERMS; n++) {
		factor *= ((2 * n - 1) / (2 * n)) * z2
		const term = factor / (2 * n + 1)
		const next = sum + term
		if (next === sum) {
			break
		}
		sum = next
	}
	return sum
}

/**
 * Computes the element-wise inverse cosine (arccos, in radians in [0, pi])
 * of a Float64Array using a Maclaurin series for arcsin combined with
 * half-angle range-reduction identities for high precision across [-1, 1]:
 *   - |x| <= 0.5: pi/2 - arcsinSeries(x)
 *   - x > 0.5:    2 * arcsinSeries(sqrt((1 - x) / 2))
 *   - x < -0.5:   pi - 2 * arcsinSeries(sqrt((1 + x) / 2))
 *
 * Out-of-domain elements (|x| > 1 or NaN) yield NaN.
 *
 * @param {Float64Array} input Input array of values in [-1, 1].
 * @returns {Float64Array} New Float64Array containing arccos(x) for each element.
 * @throws {TypeError} If input is not a Float64Array.
 */
export function arccosTypedSeries(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('arccosTypedSeries expects a Float64Array input')
	}

	const len = input.length
	const out = new Float64Array(len)

	for (let i = 0; i < len; i++) {
		const x = input[i]
		if (!(x >= -1 && x <= 1)) {
			out[i] = Number.NaN
		} else if (x === 1) {
			out[i] = 0
		} else if (x === -1) {
			out[i] = Math.PI
		} else if (x === 0) {
			out[i] = HALF_PI
		} else if (x > 0.5) {
			out[i] = 2 * arcsinSeries(Math.sqrt((1 - x) * 0.5))
		} else if (x < -0.5) {
			out[i] = Math.PI - 2 * arcsinSeries(Math.sqrt((1 + x) * 0.5))
		} else {
			out[i] = HALF_PI - arcsinSeries(x)
		}
	}

	return out
}
