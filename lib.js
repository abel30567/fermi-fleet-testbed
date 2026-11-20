export function add(a, b) {
	return a + b
}

/**
 * Compute real eigenvalues of a 2x2 matrix A = [[a, b], [c, d]],
 * sorted in descending order [lambda1, lambda2], or null if complex.
 *
 * @param {number[][]} A
 * @returns {[number, number] | null}
 */
export function eigen2x2(A) {
	if (
		!Array.isArray(A) ||
		A.length !== 2 ||
		!Array.isArray(A[0]) ||
		A[0].length !== 2 ||
		!Array.isArray(A[1]) ||
		A[1].length !== 2
	) {
		throw new TypeError('A must be a 2x2 matrix')
	}

	const [[a, b], [c, d]] = A
	if (
		typeof a !== 'number' ||
		typeof b !== 'number' ||
		typeof c !== 'number' ||
		typeof d !== 'number' ||
		!Number.isFinite(a) ||
		!Number.isFinite(b) ||
		!Number.isFinite(c) ||
		!Number.isFinite(d)
	) {
		throw new TypeError('Matrix entries must be finite numbers')
	}

	const disc = (a - d) * (a - d) + 4 * b * c
	if (disc < 0) {
		return null
	}

	const halfTrace = (a + d) / 2
	const halfSqrtDisc = Math.sqrt(disc) / 2
	const lambda1 = halfTrace + halfSqrtDisc
	const lambda2 = halfTrace - halfSqrtDisc

	return [lambda1 === 0 ? 0 : lambda1, lambda2 === 0 ? 0 : lambda2]
}
