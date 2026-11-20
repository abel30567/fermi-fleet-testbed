export function add(a, b) {
	return a + b
}

export function matTranspose(A) {
	if (!Array.isArray(A)) {
		throw new TypeError('Matrix must be a 2D array')
	}
	const rows = A.length
	if (rows === 0) {
		return []
	}
	if (!Array.isArray(A[0])) {
		throw new TypeError('Matrix rows must be arrays')
	}
	const cols = A[0].length
	for (let i = 1; i < rows; i++) {
		if (!Array.isArray(A[i]) || A[i].length !== cols) {
			throw new Error('Matrix rows must have equal length')
		}
	}
	if (cols === 0) {
		return []
	}
	const result = Array.from({ length: cols }, () => new Array(rows))
	for (let i = 0; i < rows; i++) {
		for (let j = 0; j < cols; j++) {
			result[j][i] = A[i][j]
		}
	}
	return result
}
