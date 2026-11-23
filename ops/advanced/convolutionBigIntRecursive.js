/**
 * Validate that an input is a dense array of exact BigInt values.
 *
 * @param {unknown} arr - Value to validate.
 * @param {string} name - Parameter name for error reporting.
 * @returns {bigint[]} Validated BigInt array.
 * @throws {TypeError} If the input is not an array or contains non-BigInt elements.
 */
function validateBigIntArray(arr, name) {
	if (!Array.isArray(arr)) {
		throw new TypeError(`${name} must be an Array of BigInt values`)
	}
	for (let i = 0; i < arr.length; i++) {
		if (typeof arr[i] !== 'bigint') {
			throw new TypeError(`${name}[${i}] must be a BigInt`)
		}
	}
	return arr
}

/**
 * Element-wise sum of two BigInt polynomial coefficient arrays.
 *
 * @param {bigint[]} a
 * @param {bigint[]} b
 * @returns {bigint[]}
 */
function addBigIntPolys(a, b) {
	const len = Math.max(a.length, b.length)
	const out = new Array(len)
	for (let i = 0; i < len; i++) {
		out[i] = (i < a.length ? a[i] : 0n) + (i < b.length ? b[i] : 0n)
	}
	return out
}

/**
 * Recursive divide-and-conquer discrete convolution (Karatsuba polynomial multiplication)
 * over non-empty BigInt arrays.
 *
 * @param {bigint[]} p
 * @param {bigint[]} q
 * @returns {bigint[]}
 */
function karatsubaConvolve(p, q) {
	const n = p.length
	const m = q.length

	if (n === 0 || m === 0) {
		return []
	}
	if (n === 1) {
		const factor = p[0]
		const out = new Array(m)
		for (let i = 0; i < m; i++) {
			out[i] = factor * q[i]
		}
		return out
	}
	if (m === 1) {
		const factor = q[0]
		const out = new Array(n)
		for (let i = 0; i < n; i++) {
			out[i] = p[i] * factor
		}
		return out
	}

	// Ensure p is the shorter (or equal-length) sequence.
	if (n > m) {
		return karatsubaConvolve(q, p)
	}

	// When q is at least twice as long as p, divide q in half recursively (overlap-add).
	if (m >= 2 * n) {
		const mid = m >> 1
		const low = karatsubaConvolve(p, q.slice(0, mid))
		const high = karatsubaConvolve(p, q.slice(mid))
		const out = new Array(n + m - 1).fill(0n)
		for (let i = 0; i < low.length; i++) {
			out[i] += low[i]
		}
		for (let i = 0; i < high.length; i++) {
			out[i + mid] += high[i]
		}
		return out
	}

	// Balanced case: 2 <= n <= m < 2 * n, so 1 <= mid < n <= m.
	const mid = m >> 1
	const pLow = p.slice(0, mid)
	const pHigh = p.slice(mid)
	const qLow = q.slice(0, mid)
	const qHigh = q.slice(mid)

	const z0 = karatsubaConvolve(pLow, qLow)
	const z2 = karatsubaConvolve(pHigh, qHigh)
	const z1 = karatsubaConvolve(addBigIntPolys(pLow, pHigh), addBigIntPolys(qLow, qHigh))

	const out = new Array(n + m - 1).fill(0n)
	for (let i = 0; i < z0.length; i++) {
		out[i] += z0[i]
		out[i + mid] -= z0[i]
	}
	for (let i = 0; i < z1.length; i++) {
		out[i + mid] += z1[i]
	}
	for (let i = 0; i < z2.length; i++) {
		out[i + mid] -= z2[i]
		out[i + 2 * mid] += z2[i]
	}
	return out
}

/**
 * Compute the exact linear discrete convolution of two BigInt sequences using
 * a recursive divide-and-conquer (Karatsuba) algorithm.
 *
 * For non-empty inputs `a` (length N) and `b` (length M), returns an array `c`
 * of length `N + M - 1` where `c[k] = sum_{i + j = k} a[i] * b[j]`.
 * If either input is empty, returns an empty array `[]`.
 *
 * @param {bigint[]} a - First sequence of exact BigInt values.
 * @param {bigint[]} b - Second sequence of exact BigInt values.
 * @returns {bigint[]} Exact linear discrete convolution of `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not an array or contains non-BigInt values.
 */
export function convolutionBigIntRecursive(a, b) {
	validateBigIntArray(a, 'a')
	validateBigIntArray(b, 'b')
	if (a.length === 0 || b.length === 0) {
		return []
	}
	return karatsubaConvolve(a, b)
}
