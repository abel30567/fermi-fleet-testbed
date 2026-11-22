/**
 * Normalizes negative zero (-0) to positive zero (+0).
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value
}

/**
 * Validates that a value is a finite complex number `{ re, im }`.
 *
 * @param {unknown} value
 * @param {string} label
 */
function validateComplex(value, label) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${label} must be a complex number object { re, im }`)
	}
	if (typeof value.re !== 'number' || typeof value.im !== 'number') {
		throw new TypeError(`${label}.re and ${label}.im must be numbers`)
	}
	if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) {
		throw new RangeError(`${label}.re and ${label}.im must be finite numbers`)
	}
}

/**
 * Error-free transformation (Knuth's TwoSum) for floating-point addition.
 * Returns `[s, e]` such that `s + e === x + y` exactly in real arithmetic.
 *
 * @param {number} x
 * @param {number} y
 * @returns {[number, number]}
 */
function twoSum(x, y) {
	const s = x + y
	if (!Number.isFinite(s)) {
		throw new RangeError('Complex dot product overflowed finite double precision')
	}
	const v = s - x
	const e = (x - (s - v)) + (y - v)
	return [s, e]
}

/**
 * Combines two compensated sums `(s1, e1)` and `(s2, e2)`.
 *
 * @param {number} s1
 * @param {number} e1
 * @param {number} s2
 * @param {number} e2
 * @returns {[number, number]}
 */
function addCompensated(s1, e1, s2, e2) {
	const [s, e] = twoSum(s1, s2)
	return [s, e1 + e2 + e]
}

/**
 * Divide-and-conquer recursive pairwise compensated summation for the complex
 * dot product over the half-open index range `[start, end)`.
 *
 * @param {Array<{ re: number, im: number }>} a
 * @param {Array<{ re: number, im: number }>} b
 * @param {number} start
 * @param {number} end
 * @param {boolean} conjugate
 * @returns {{ re: number, reErr: number, im: number, imErr: number }}
 */
function dotRangeRecursive(a, b, start, end, conjugate) {
	const length = end - start
	if (length === 0) {
		return { re: 0, reErr: 0, im: 0, imErr: 0 }
	}
	if (length === 1) {
		const { re: ar, im: ai } = a[start]
		const { re: br, im: bi } = b[start]

		const p1 = ar * br
		const p2 = conjugate ? ai * bi : -(ai * bi)
		const q1 = conjugate ? ai * br : ar * bi
		const q2 = conjugate ? -(ar * bi) : ai * br

		if (
			!Number.isFinite(p1) ||
			!Number.isFinite(p2) ||
			!Number.isFinite(q1) ||
			!Number.isFinite(q2)
		) {
			throw new RangeError('Complex dot product overflowed finite double precision')
		}

		const [re, reErr] = twoSum(p1, p2)
		const [im, imErr] = twoSum(q1, q2)
		return { re, reErr, im, imErr }
	}

	const mid = start + Math.floor(length / 2)
	const left = dotRangeRecursive(a, b, start, mid, conjugate)
	const right = dotRangeRecursive(a, b, mid, end, conjugate)

	const [re, reErr] = addCompensated(left.re, left.reErr, right.re, right.reErr)
	const [im, imErr] = addCompensated(left.im, left.imErr, right.im, right.imErr)
	return { re, reErr, im, imErr }
}

/**
 * Computes the dot product of two complex vectors using a divide-and-conquer
 * recursive pairwise summation algorithm with Knuth TwoSum error compensation.
 *
 * **Convention:**
 * - By default (`options.conjugate = true`), computes the standard mathematical
 *   Hermitian inner product (sesquilinear, linear in `a`, conjugate-linear in `b`):
 *   $$\mathbf{a} \cdot \mathbf{b} = \sum_{k=0}^{n-1} a_k \overline{b_k}$$
 *   This guarantees positive-definiteness ($\mathbf{a} \cdot \mathbf{a} = \|\mathbf{a}\|_2^2 \ge 0$),
 *   conjugate symmetry ($\mathbf{a} \cdot \mathbf{b} = \overline{\mathbf{b} \cdot \mathbf{a}}$),
 *   and the Cauchy-Schwarz inequality.
 * - When `options.conjugate = false`, computes the unconjugated bilinear dot product:
 *   $$\sum_{k=0}^{n-1} a_k b_k$$
 * - For empty vectors (`length === 0`), returns `{ re: 0, im: 0 }`.
 *
 * **Algorithm:**
 * Recursively bisects the index range `[start, end)` into two halves of size
 * $\lfloor n/2 \rfloor$ and $\lceil n/2 \rceil$, computes the complex product at
 * leaf elements, and combines partial sums with Knuth's error-free `twoSum`
 * transformation. This achieves $O(\log n)$ recursion depth and significantly
 * better numerical stability than naive iterative summation.
 *
 * @param {Array<{ re: number, im: number }>} a First complex vector.
 * @param {Array<{ re: number, im: number }>} b Second complex vector (same length as `a`).
 * @param {{ conjugate?: boolean }} [options] Optional configuration.
 * @param {boolean} [options.conjugate=true] Whether to conjugate elements of `b` (Hermitian inner product).
 * @returns {{ re: number, im: number }} The complex dot product with `-0` normalized to `0`.
 * @throws {TypeError} If `a` or `b` is not an Array, `options` is invalid, `options.conjugate` is not a boolean, or any element is not a `{ re, im }` object with numeric components.
 * @throws {RangeError} If `a` and `b` have different lengths, any component is non-finite (`NaN`, `±Infinity`), or intermediate/final sums overflow finite IEEE-754 double precision.
 */
export function dotProductComplexRecursive(a, b, options = {}) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument "a" must be an array of complex numbers')
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument "b" must be an array of complex numbers')
	}
	if (typeof options !== 'object' || options === null || Array.isArray(options)) {
		throw new TypeError('Third argument "options" must be a plain object')
	}
	const { conjugate = true } = options
	if (typeof conjugate !== 'boolean') {
		throw new TypeError('options.conjugate must be a boolean')
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Vector dimension mismatch: a has length ${a.length}, b has length ${b.length}`
		)
	}

	for (let i = 0; i < a.length; i++) {
		validateComplex(a[i], `a[${i}]`)
		validateComplex(b[i], `b[${i}]`)
	}

	const result = dotRangeRecursive(a, b, 0, a.length, conjugate)
	const re = result.re + result.reErr
	const im = result.im + result.imErr

	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError('Complex dot product overflowed finite double precision')
	}

	return {
		re: normalizeZero(re),
		im: normalizeZero(im),
	}
}
