export function add(a, b) {
	return a + b
}

export function matInv2(A) {
	if (
		!Array.isArray(A) ||
		A.length !== 2 ||
		!Array.isArray(A[0]) ||
		!Array.isArray(A[1]) ||
		A[0].length !== 2 ||
		A[1].length !== 2
	) {
		throw new TypeError('Expected a 2x2 matrix')
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

	const det = a * d - b * c
	if (det === 0 || !Number.isFinite(det)) {
		throw new Error('Matrix is singular')
	}

	const norm = (x) => (x === 0 ? 0 : x)
	const inv = [
		[norm(d / det), norm(-b / det)],
		[norm(-c / det), norm(a / det)],
	]

	if (
		!Number.isFinite(inv[0][0]) ||
		!Number.isFinite(inv[0][1]) ||
		!Number.isFinite(inv[1][0]) ||
		!Number.isFinite(inv[1][1])
	) {
		throw new Error('Matrix is singular')
	}

	return inv
}
