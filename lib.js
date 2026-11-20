export function add(a, b) {
	return a + b
}

export function luDecompose(A) {
	if (!Array.isArray(A)) {
		throw new TypeError('Input must be a 2D array')
	}

	const n = A.length
	for (let i = 0; i < n; i++) {
		if (!Array.isArray(A[i]) || A[i].length !== n) {
			throw new Error('Matrix must be square')
		}
	}

	const L = Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
	)
	const U = Array.from({ length: n }, () => new Array(n).fill(0))

	for (let i = 0; i < n; i++) {
		for (let k = i; k < n; k++) {
			let sum = 0
			for (let j = 0; j < i; j++) {
				sum += L[i][j] * U[j][k]
			}
			const val = A[i][k] - sum
			U[i][k] = val === 0 ? 0 : val
		}

		if (Math.abs(U[i][i]) < 1e-12) {
			throw new Error(`Zero pivot encountered at index ${i}`)
		}

		for (let k = i + 1; k < n; k++) {
			let sum = 0
			for (let j = 0; j < i; j++) {
				sum += L[k][j] * U[j][i]
			}
			const val = (A[k][i] - sum) / U[i][i]
			L[k][i] = val === 0 ? 0 : val
		}
	}

	return { L, U }
}
