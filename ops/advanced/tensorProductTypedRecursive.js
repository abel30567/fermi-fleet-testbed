/**
 * @fileoverview Recursive divide-and-conquer tensor product (outer / Kronecker product)
 * over {@link Float64Array} inputs.
 */

/**
 * Recursively validates that every element in `arr[start..end)` is a finite number.
 *
 * Uses divide-and-conquer bisection so call-stack depth is O(log n) and errors
 * deterministically report the lowest offending index.
 *
 * @param {Float64Array} arr - Typed array to validate.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @param {string} name - Parameter name for error reporting.
 * @throws {RangeError} If any element is NaN, Infinity, or -Infinity.
 */
function assertFiniteRecursive(arr, start, end, name) {
	const len = end - start;
	if (len <= 0) {
		return;
	}
	if (len === 1) {
		if (!Number.isFinite(arr[start])) {
			throw new RangeError(
				`${name}[${start}] must be a finite number, received ${arr[start]}`
			);
		}
		return;
	}
	const mid = start + (len >>> 1);
	assertFiniteRecursive(arr, start, mid, name);
	assertFiniteRecursive(arr, mid, end, name);
}

/**
 * Recursively computes the sub-block `a[aStart..aEnd) ⊗ b[bStart..bEnd)` into `out`
 * in row-major order using divide-and-conquer bisection along the larger dimension.
 *
 * Call-stack depth is O(log(a.length) + log(b.length)).
 *
 * @param {Float64Array} a - Left input vector.
 * @param {number} aStart - Inclusive start index into `a`.
 * @param {number} aEnd - Exclusive end index into `a`.
 * @param {Float64Array} b - Right input vector.
 * @param {number} bStart - Inclusive start index into `b`.
 * @param {number} bEnd - Exclusive end index into `b`.
 * @param {Float64Array} out - Pre-allocated output buffer of length `a.length * b.length`.
 * @param {number} stride - Row stride (equal to `b.length`).
 */
function fillTensorBlock(a, aStart, aEnd, b, bStart, bEnd, out, stride) {
	const aLen = aEnd - aStart;
	const bLen = bEnd - bStart;
	if (aLen <= 0 || bLen <= 0) {
		return;
	}
	if (aLen === 1 && bLen === 1) {
		out[aStart * stride + bStart] = a[aStart] * b[bStart];
		return;
	}
	if (aLen >= bLen) {
		const aMid = aStart + (aLen >>> 1);
		fillTensorBlock(a, aStart, aMid, b, bStart, bEnd, out, stride);
		fillTensorBlock(a, aMid, aEnd, b, bStart, bEnd, out, stride);
	} else {
		const bMid = bStart + (bLen >>> 1);
		fillTensorBlock(a, aStart, aEnd, b, bStart, bMid, out, stride);
		fillTensorBlock(a, aStart, aEnd, b, bMid, bEnd, out, stride);
	}
}

/**
 * Computes the tensor product (outer / Kronecker product) of two {@link Float64Array}
 * inputs using a recursive divide-and-conquer algorithm.
 *
 * Given `a` of length `m` and `b` of length `n`, returns a new `Float64Array` of
 * length `m * n` in row-major order such that:
 *
 *     result[i * n + j] === a[i] * b[j]   for 0 <= i < m, 0 <= j < n
 *
 * Neither input array is mutated. If either input is empty, returns an empty
 * `Float64Array` of length `0`.
 *
 * @param {Float64Array} a - Left-hand Float64Array operand (all elements finite).
 * @param {Float64Array} b - Right-hand Float64Array operand (all elements finite).
 * @returns {Float64Array} Row-major tensor product `a ⊗ b` of length `a.length * b.length`.
 * @throws {TypeError} If `a` or `b` is not an instance of `Float64Array`.
 * @throws {RangeError} If any element of `a` or `b` is non-finite (`NaN`, `Infinity`, `-Infinity`),
 *   or if the resulting output length exceeds safe integer bounds.
 */
export function tensorProductTypedRecursive(a, b) {
	if (!(a instanceof Float64Array)) {
		throw new TypeError('First argument "a" must be a Float64Array');
	}
	if (!(b instanceof Float64Array)) {
		throw new TypeError('Second argument "b" must be a Float64Array');
	}

	assertFiniteRecursive(a, 0, a.length, 'a');
	assertFiniteRecursive(b, 0, b.length, 'b');

	const m = a.length;
	const n = b.length;
	if (m === 0 || n === 0) {
		return new Float64Array(0);
	}

	const outLength = m * n;
	if (!Number.isSafeInteger(outLength)) {
		throw new RangeError(`Tensor product length ${outLength} exceeds safe integer limit`);
	}

	const out = new Float64Array(outLength);
	fillTensorBlock(a, 0, m, b, 0, n, out, n);
	return out;
}
