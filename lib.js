export function add(a, b) {
	return a + b
}

export function matTrace(A) {
	if (!Array.isArray(A)) {
		throw new TypeError('Expected a square 2D array')
	}
	const n = A.length
	let sum = 0
	for (let i = 0; i < n; i++) {
		if (!Array.isArray(A[i]) || A[i].length !== n) {
			throw new Error('Matrix must be square')
		}
		sum += A[i][i]
	}
	return sum
}
