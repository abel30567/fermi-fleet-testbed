export function add(a, b) {
	return a + b
}

export function matDet3(A) {
	if (
		!Array.isArray(A) ||
		A.length !== 3 ||
		!Array.isArray(A[0]) ||
		!Array.isArray(A[1]) ||
		!Array.isArray(A[2]) ||
		A[0].length !== 3 ||
		A[1].length !== 3 ||
		A[2].length !== 3
	) {
		throw new TypeError('matDet3 expects a 3x3 matrix')
	}
	const [[a, b, c], [d, e, f], [g, h, i]] = A
	const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
	return det === 0 ? 0 : det
}
