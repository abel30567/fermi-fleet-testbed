/**
 * @typedef {{ v: number, d: number }} DualNumber
 * A dual number representing `v + d * ε` with `ε² = 0`, carrying a primal value `v`
 * and its forward-mode derivative `d`.
 */

/**
 * Normalizes `-0` to `+0` while preserving all other numbers.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Adds two dual numbers: `(v1 + d1·ε) + (v2 + d2·ε)`.
 *
 * @param {DualNumber} x
 * @param {DualNumber} y
 * @returns {DualNumber}
 */
function dualAdd(x, y) {
	return {
		v: x.v + y.v,
		d: x.d + y.d,
	}
}

/**
 * Subtracts two dual numbers: `(v1 + d1·ε) - (v2 + d2·ε)`.
 *
 * @param {DualNumber} x
 * @param {DualNumber} y
 * @returns {DualNumber}
 */
function dualSub(x, y) {
	return {
		v: x.v - y.v,
		d: x.d - y.d,
	}
}

/**
 * Multiplies two dual numbers: `(v1 + d1·ε) * (v2 + d2·ε) = (v1*v2) + (v1*d2 + d1*v2)·ε`.
 *
 * @param {DualNumber} x
 * @param {DualNumber} y
 * @returns {DualNumber}
 */
function dualMul(x, y) {
	return {
		v: x.v * y.v,
		d: x.v * y.d + x.d * y.v,
	}
}

/**
 * Adds two polynomials over dual numbers.
 *
 * @param {DualNumber[]} p
 * @param {DualNumber[]} q
 * @returns {DualNumber[]}
 */
function polyAdd(p, q) {
	const len = Math.max(p.length, q.length)
	const out = new Array(len)
	for (let i = 0; i < len; i++) {
		if (i < p.length && i < q.length) {
			out[i] = dualAdd(p[i], q[i])
		} else if (i < p.length) {
			out[i] = { v: p[i].v, d: p[i].d }
		} else {
			out[i] = { v: q[i].v, d: q[i].d }
		}
	}
	return out
}

/**
 * Subtracts two polynomials over dual numbers (`p - q`).
 *
 * @param {DualNumber[]} p
 * @param {DualNumber[]} q
 * @returns {DualNumber[]}
 */
function polySub(p, q) {
	const len = Math.max(p.length, q.length)
	const out = new Array(len)
	for (let i = 0; i < len; i++) {
		if (i < p.length && i < q.length) {
			out[i] = dualSub(p[i], q[i])
		} else if (i < p.length) {
			out[i] = { v: p[i].v, d: p[i].d }
		} else {
			out[i] = { v: -q[i].v, d: -q[i].d }
		}
	}
	return out
}

/**
 * Allocates a zero-initialized array of dual numbers.
 *
 * @param {number} len
 * @returns {DualNumber[]}
 */
function zeroPoly(len) {
	const out = new Array(len)
	for (let i = 0; i < len; i++) {
		out[i] = { v: 0, d: 0 }
	}
	return out
}

/**
 * Adds `src[0..count-1]` into `dst` starting at `offset` in place.
 *
 * @param {DualNumber[]} dst
 * @param {DualNumber[]} src
 * @param {number} offset
 * @param {number} [count=src.length]
 */
function addInto(dst, src, offset, count = src.length) {
	for (let i = 0; i < count; i++) {
		dst[offset + i].v += src[i].v
		dst[offset + i].d += src[i].d
	}
}

/**
 * Recursive Karatsuba divide-and-conquer polynomial multiplication over dual numbers.
 * Assumes both `a` and `b` are non-empty arrays of validated dual numbers.
 *
 * @param {DualNumber[]} a
 * @param {DualNumber[]} b
 * @returns {DualNumber[]}
 */
function karatsubaDual(a, b) {
	const n = a.length
	const m = b.length

	if (n === 1) {
		const a0 = a[0]
		const out = new Array(m)
		for (let j = 0; j < m; j++) {
			out[j] = dualMul(a0, b[j])
		}
		return out
	}

	if (m === 1) {
		const b0 = b[0]
		const out = new Array(n)
		for (let i = 0; i < n; i++) {
			out[i] = dualMul(a[i], b0)
		}
		return out
	}

	const maxLen = Math.max(n, m)
	const half = Math.floor(maxLen / 2)

	// Asymmetric split: when one operand fits entirely below the split point,
	// divide only the longer operand into two subproblems without padding.
	if (n <= half) {
		const b0 = b.slice(0, half)
		const b1 = b.slice(half)
		const z0 = karatsubaDual(a, b0)
		const z1 = karatsubaDual(a, b1)
		const out = zeroPoly(n + m - 1)
		addInto(out, z0, 0)
		addInto(out, z1, half)
		return out
	}

	if (m <= half) {
		const a0 = a.slice(0, half)
		const a1 = a.slice(half)
		const z0 = karatsubaDual(a0, b)
		const z1 = karatsubaDual(a1, b)
		const out = zeroPoly(n + m - 1)
		addInto(out, z0, 0)
		addInto(out, z1, half)
		return out
	}

	// Balanced Karatsuba split:
	// A(X) = A0(X) + X^half * A1(X), B(X) = B0(X) + X^half * B1(X)
	// Z0 = A0 * B0
	// Z2 = A1 * B1
	// Z1 = (A0 + A1) * (B0 + B1) - Z0 - Z2
	// A * B = Z0 + X^half * Z1 + X^(2*half) * Z2
	const a0 = a.slice(0, half)
	const a1 = a.slice(half)
	const b0 = b.slice(0, half)
	const b1 = b.slice(half)

	const z0 = karatsubaDual(a0, b0)
	const z2 = karatsubaDual(a1, b1)
	const aSum = polyAdd(a0, a1)
	const bSum = polyAdd(b0, b1)
	const z1Full = karatsubaDual(aSum, bSum)
	const z1 = polySub(polySub(z1Full, z0), z2)

	// Algebraically, Z1 = A0*B1 + A1*B0 has length at most max(n - 1, m - 1).
	const z1Len = Math.min(z1.length, maxLen - 1)

	const out = zeroPoly(n + m - 1)
	addInto(out, z0, 0)
	addInto(out, z1, half, z1Len)
	addInto(out, z2, 2 * half)
	return out
}

/**
 * Validates that an argument is an array of finite dual numbers `{ v, d }`
 * and returns a normalized defensive copy.
 *
 * @param {unknown} seq
 * @param {string} name
 * @returns {DualNumber[]}
 */
function validateDualSequence(seq, name) {
	if (!Array.isArray(seq)) {
		throw new TypeError(`${name} must be an array of dual numbers { v, d }`)
	}

	const copy = new Array(seq.length)
	for (let i = 0; i < seq.length; i++) {
		const el = seq[i]
		if (el === null || typeof el !== 'object' || Array.isArray(el)) {
			throw new TypeError(`${name}[${i}] must be a dual number object { v, d }`)
		}
		if (typeof el.v !== 'number' || typeof el.d !== 'number') {
			throw new TypeError(`${name}[${i}].v and ${name}[${i}].d must be numbers`)
		}
		if (!Number.isFinite(el.v) || !Number.isFinite(el.d)) {
			throw new RangeError(`${name}[${i}].v and ${name}[${i}].d must be finite numbers`)
		}
		copy[i] = { v: el.v, d: el.d }
	}
	return copy
}

/**
 * Computes the discrete linear convolution of two sequences of dual numbers `{ v, d }`,
 * propagating both primal values and forward-mode derivatives via recursive Karatsuba
 * divide-and-conquer polynomial multiplication over the ring of dual numbers.
 *
 * For non-empty sequences `a` (length `n`) and `b` (length `m`), returns a sequence `c`
 * of length `n + m - 1` where:
 *   `c[k] = Σ_{i + j = k} (a[i] · b[j])`
 * using dual multiplication `(v1, d1) · (v2, d2) = (v1*v2, v1*d2 + d1*v2)`.
 * If either sequence is empty, returns `[]`.
 *
 * @param {readonly DualNumber[]} a - First sequence of dual numbers `{ v, d }`.
 * @param {readonly DualNumber[]} b - Second sequence of dual numbers `{ v, d }`.
 * @returns {DualNumber[]} The discrete linear convolution of `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not an array, or any element is not `{ v: number, d: number }`.
 * @throws {RangeError} If any `v` or `d` value is `NaN`, `Infinity`, or `-Infinity`.
 */
export function convolutionDualRecursive(a, b) {
	const seqA = validateDualSequence(a, 'a')
	const seqB = validateDualSequence(b, 'b')

	if (seqA.length === 0 || seqB.length === 0) {
		return []
	}

	const raw = karatsubaDual(seqA, seqB)
	for (let i = 0; i < raw.length; i++) {
		raw[i].v = normalizeZero(raw[i].v)
		raw[i].d = normalizeZero(raw[i].d)
	}
	return raw
}
