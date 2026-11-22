/**
 * Computes the real nth root of a single scalar pair `(x, n)`, i.e. `x^(1 / n)`.
 *
 * Uses exact fast paths for `n = ±1`, `±2`, `±3` and refines `Math.pow(|x|, 1 / |n|)`
 * via Newton-Raphson iteration when `|n| > 1` to eliminate binary representation
 * error in `1 / n`.
 *
 * @param {number} x - Radicand.
 * @param {number} n - Root degree.
 * @returns {number} The real nth root, or `NaN` when undefined over the reals.
 */
function scalarNthRoot(x, n) {
	if (Number.isNaN(x) || Number.isNaN(n) || n === 0) {
		return NaN
	}

	if (!Number.isFinite(n)) {
		if (x > 0 && Number.isFinite(x)) {
			return 1
		}
		if (x === 0) {
			return n > 0 ? 0 : Infinity
		}
		return NaN
	}

	if (n === 1) {
		return x
	}
	if (n === -1) {
		return 1 / x
	}

	const isOddInt = Number.isInteger(n) && Math.abs(n % 2) === 1

	if (x === 0) {
		const isNegZero = Object.is(x, -0)
		if (n > 0) {
			return isNegZero && isOddInt ? -0 : 0
		}
		return isNegZero && isOddInt ? -Infinity : Infinity
	}

	if (!Number.isFinite(x)) {
		if (x > 0) {
			return n > 0 ? Infinity : 0
		}
		if (!isOddInt) {
			return NaN
		}
		return n > 0 ? -Infinity : -0
	}

	let sign = 1
	let absX = x
	if (x < 0) {
		if (!isOddInt) {
			return NaN
		}
		sign = -1
		absX = -x
	}

	if (absX === 1) {
		return sign
	}

	const absN = Math.abs(n)
	let y
	if (absN === 2) {
		y = Math.sqrt(absX)
	} else if (absN === 3) {
		y = Math.cbrt(absX)
	} else {
		y = Math.pow(absX, 1 / absN)
		if (absN > 1 && Number.isFinite(y) && y > 0) {
			let prev = NaN
			for (let iter = 0; iter < 8; iter++) {
				const p = Math.pow(y, absN - 1)
				if (!Number.isFinite(p) || p === 0) {
					break
				}
				const next = y + (absX / p - y) / absN
				if (!Number.isFinite(next) || next <= 0) {
					break
				}
				if (next === y || next === prev) {
					y = next
					break
				}
				prev = y
				y = next
			}
		}
	}

	const result = n < 0 ? 1 / y : y
	return sign < 0 ? -result : result
}

/**
 * Computes the real nth root element-wise over two `Float64Array` inputs
 * (`values[i]^(1 / degrees[i])`) using a straightforward iterative loop.
 *
 * For negative radicands (`values[i] < 0`), a real root exists when the
 * corresponding degree `degrees[i]` is a finite odd integer (yielding
 * `-|values[i]|^(1 / degrees[i])`); otherwise the output element is `NaN`.
 * Zero degrees (`degrees[i] === 0`) and `NaN` inputs yield `NaN`.
 *
 * Neither input array is mutated.
 *
 * @param {Float64Array} values - Radicands (`x_i`) whose nth roots are computed.
 * @param {Float64Array} degrees - Root degrees (`n_i`) corresponding element-wise to `values`.
 * @returns {Float64Array} A new `Float64Array` of the same length containing the element-wise real nth roots.
 * @throws {TypeError} If `values` or `degrees` is not an instance of `Float64Array`.
 * @throws {RangeError} If `values` and `degrees` do not have the same length.
 */
export function nthRootTypedIterative(values, degrees) {
	if (!(values instanceof Float64Array)) {
		throw new TypeError('values must be a Float64Array')
	}
	if (!(degrees instanceof Float64Array)) {
		throw new TypeError('degrees must be a Float64Array')
	}
	if (values.length !== degrees.length) {
		throw new RangeError(
			`Input lengths must match: values has length ${values.length}, degrees has length ${degrees.length}`,
		)
	}

	const len = values.length
	const out = new Float64Array(len)

	for (let i = 0; i < len; i++) {
		out[i] = scalarNthRoot(values[i], degrees[i])
	}

	return out
}
