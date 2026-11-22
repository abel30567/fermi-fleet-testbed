/**
 * Validate that an argument is a Float64Array containing only finite numbers.
 *
 * @param {unknown} input - Value to validate.
 * @param {string} name - Parameter name used in error messages.
 * @throws {TypeError} If input is not a Float64Array.
 * @throws {RangeError} If any element in input is not a finite number.
 */
function assertFiniteFloat64Array(input, name) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError(`Expected "${name}" to be a Float64Array`)
	}
	for (let i = 0; i < input.length; i++) {
		if (!Number.isFinite(input[i])) {
			throw new RangeError(
				`Expected "${name}[${i}]" to be a finite number, got ${input[i]}`
			)
		}
	}
}

/**
 * Recursively fill a rectangular sub-block of the flattened tensor product
 * using a divide-and-conquer strategy along the larger active dimension.
 *
 * @param {Float64Array} a - First input vector.
 * @param {Float64Array} b - Second input vector.
 * @param {Float64Array} out - Pre-allocated output buffer of length a.length * b.length.
 * @param {number} stride - Row stride (b.length).
 * @param {number} aStart - Inclusive start index in `a`.
 * @param {number} aEnd - Exclusive end index in `a`.
 * @param {number} bStart - Inclusive start index in `b`.
 * @param {number} bEnd - Exclusive end index in `b`.
 */
function fillBlockRecursive(a, b, out, stride, aStart, aEnd, bStart, bEnd) {
	const aLen = aEnd - aStart
	const bLen = bEnd - bStart

	if (aLen === 1 && bLen === 1) {
		out[aStart * stride + bStart] = a[aStart] * b[bStart]
		return
	}

	if (aLen >= bLen) {
		const aMid = aStart + (aLen >>> 1)
		fillBlockRecursive(a, b, out, stride, aStart, aMid, bStart, bEnd)
		fillBlockRecursive(a, b, out, stride, aMid, aEnd, bStart, bEnd)
	} else {
		const bMid = bStart + (bLen >>> 1)
		fillBlockRecursive(a, b, out, stride, aStart, aEnd, bStart, bMid)
		fillBlockRecursive(a, b, out, stride, aStart, aEnd, bMid, bEnd)
	}
}

/**
 * Compute the tensor (outer) product of two Float64Array vectors using a
 * recursive divide-and-conquer algorithm.
 *
 * For inputs `a` of length `m` and `b` of length `n`, returns a row-major
 * flattened `Float64Array` of length `m * n` where:
 *   `result[i * n + j] = a[i] * b[j]`
 *
 * @param {Float64Array} a - First finite Float64Array vector.
 * @param {Float64Array} b - Second finite Float64Array vector.
 * @returns {Float64Array} Flattened row-major tensor product of `a` and `b`.
 * @throws {TypeError} If either input is not a Float64Array.
 * @throws {RangeError} If any element in either input is non-finite (NaN or +/-Infinity),
 *   or if the output size exceeds Number.MAX_SAFE_INTEGER.
 */
export function tensorProductTypedRecursive(a, b) {
	assertFiniteFloat64Array(a, 'a')
	assertFiniteFloat64Array(b, 'b')

	const aLen = a.length
	const bLen = b.length

	if (aLen === 0 || bLen === 0) {
		return new Float64Array(0)
	}

	const totalLen = aLen * bLen
	if (!Number.isSafeInteger(totalLen)) {
		throw new RangeError('Resulting Float64Array length exceeds safe integer limit')
	}

	const out = new Float64Array(totalLen)
	fillBlockRecursive(a, b, out, bLen, 0, aLen, 0, bLen)
	return out
}
