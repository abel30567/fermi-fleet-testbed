/**
 * Computes the orthogonal vector projection of a complex vector `u` onto a
 * non-zero complex vector `v`, where each component is represented as
 * `{ re, im }` with finite real numbers.
 *
 * Mathematical definition:
 *   proj_v(u) = (<u, v> / <v, v>) * v
 * where the Hermitian inner product and squared Euclidean norm are:
 *   <u, v> = sum_{k=0}^{n-1} u_k * conj(v_k)
 *   <v, v> = sum_{k=0}^{n-1} |v_k|^2
 *
 * Note: This projection formula is invariant to the Hermitian inner product
 * convention (linear in the first vs. second argument) and invariant to any
 * non-zero complex scalar multiple of `v`.
 *
 * Algorithm:
 *   Uses a divide-and-conquer recursive strategy with O(log n) stack depth:
 *   1. Recursively validates all entries of `u` and `v` while finding their
 *      infinity norms (maximum component magnitudes).
 *   2. Derives exact power-of-two scaling factors from the infinity norms so
 *      intermediate products cannot overflow or underflow and no mantissa
 *      rounding error is introduced by scaling.
 *   3. Recursively accumulates the scaled Hermitian inner product `<u~, v~>`
 *      and squared norm `||v~||^2` via divide-and-conquer pairwise summation,
 *      reducing floating-point summation error from O(n * eps) to O(eps * log n).
 *   4. Recursively writes the projected vector `(alpha * v~) * scaleU` across
 *      disjoint halves of the output array, normalizing `-0` to `0`.
 *
 * Complexity:
 *   Time: O(n), Auxiliary space: O(n) for output + O(log n) recursion stack.
 *
 * @param {Array<{ re: number, im: number }>} u - Complex vector to project.
 * @param {Array<{ re: number, im: number }>} v - Non-zero complex vector to project onto.
 * @returns {Array<{ re: number, im: number }>} Orthogonal projection of `u` onto `v`.
 * @throws {TypeError} If `u` or `v` is not an Array, or any element is not a
 *   plain complex object `{ re, im }` with numeric `re` and `im` properties.
 * @throws {RangeError} If `u` or `v` is empty, lengths differ, any component is
 *   non-finite (`NaN`, `Infinity`, `-Infinity`), `v` is the zero vector, or the
 *   result overflows finite IEEE-754 floating-point range.
 */
export function projectionComplexRecursive(u, v) {
	if (!Array.isArray(u)) {
		throw new TypeError('First argument `u` must be an Array of complex numbers { re, im }')
	}
	if (!Array.isArray(v)) {
		throw new TypeError('Second argument `v` must be an Array of complex numbers { re, im }')
	}
	if (u.length !== v.length) {
		throw new RangeError(`Vector dimension mismatch: u.length (${u.length}) !== v.length (${v.length})`)
	}
	if (u.length === 0) {
		throw new RangeError('Vectors must be non-empty')
	}

	const n = u.length
	const { maxU, maxV } = validateAndMaxAbsDC(u, v, 0, n)

	if (maxV === 0) {
		throw new RangeError('Cannot project onto the zero vector')
	}

	const out = new Array(n)
	if (maxU === 0) {
		fillZeroDC(out, 0, n)
		return out
	}

	const scaleU = pow2Scale(maxU)
	const scaleV = pow2Scale(maxV)

	const { dotRe, dotIm, normSq } = innerAndNormDC(u, v, scaleU, scaleV, 0, n)
	const alphaRe = dotRe / normSq
	const alphaIm = dotIm / normSq

	scaleVectorDC(v, scaleV, alphaRe, alphaIm, scaleU, 0, n, out)
	return out
}

function normalizeZero(x) {
	return x === 0 ? 0 : x
}

function pow2Scale(maxAbs) {
	const exp = Math.min(1023, Math.max(-1074, Math.floor(Math.log2(maxAbs))))
	return 2 ** exp
}

function validateComplex(z, name, index) {
	if (typeof z !== 'object' || z === null || Array.isArray(z)) {
		throw new TypeError(`${name}[${index}] must be a complex number object { re, im }`)
	}
	if (typeof z.re !== 'number' || typeof z.im !== 'number') {
		throw new TypeError(`${name}[${index}].re and ${name}[${index}].im must be numbers`)
	}
	if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
		throw new RangeError(`${name}[${index}] components must be finite numbers`)
	}
}

function validateAndMaxAbsDC(u, v, start, end) {
	if (end - start === 1) {
		const uk = u[start]
		const vk = v[start]
		validateComplex(uk, 'u', start)
		validateComplex(vk, 'v', start)
		return {
			maxU: Math.max(Math.abs(uk.re), Math.abs(uk.im)),
			maxV: Math.max(Math.abs(vk.re), Math.abs(vk.im)),
		}
	}

	const mid = start + ((end - start) >>> 1)
	const left = validateAndMaxAbsDC(u, v, start, mid)
	const right = validateAndMaxAbsDC(u, v, mid, end)
	return {
		maxU: Math.max(left.maxU, right.maxU),
		maxV: Math.max(left.maxV, right.maxV),
	}
}

function innerAndNormDC(u, v, scaleU, scaleV, start, end) {
	if (end - start === 1) {
		const ur = u[start].re / scaleU
		const ui = u[start].im / scaleU
		const vr = v[start].re / scaleV
		const vi = v[start].im / scaleV
		return {
			dotRe: ur * vr + ui * vi,
			dotIm: ui * vr - ur * vi,
			normSq: vr * vr + vi * vi,
		}
	}

	const mid = start + ((end - start) >>> 1)
	const left = innerAndNormDC(u, v, scaleU, scaleV, start, mid)
	const right = innerAndNormDC(u, v, scaleU, scaleV, mid, end)
	return {
		dotRe: left.dotRe + right.dotRe,
		dotIm: left.dotIm + right.dotIm,
		normSq: left.normSq + right.normSq,
	}
}

function fillZeroDC(out, start, end) {
	if (end - start === 1) {
		out[start] = { re: 0, im: 0 }
		return
	}

	const mid = start + ((end - start) >>> 1)
	fillZeroDC(out, start, mid)
	fillZeroDC(out, mid, end)
}

function scaleVectorDC(v, scaleV, alphaRe, alphaIm, scaleU, start, end, out) {
	if (end - start === 1) {
		const vr = v[start].re / scaleV
		const vi = v[start].im / scaleV
		const re = (alphaRe * vr - alphaIm * vi) * scaleU
		const im = (alphaRe * vi + alphaIm * vr) * scaleU
		if (!Number.isFinite(re) || !Number.isFinite(im)) {
			throw new RangeError('Projection result overflowed finite floating-point range')
		}
		out[start] = {
			re: normalizeZero(re),
			im: normalizeZero(im),
		}
		return
	}

	const mid = start + ((end - start) >>> 1)
	scaleVectorDC(v, scaleV, alphaRe, alphaIm, scaleU, start, mid, out)
	scaleVectorDC(v, scaleV, alphaRe, alphaIm, scaleU, mid, end, out)
}
