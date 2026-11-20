export function add(a, b) {
	return a + b
}

export function gaussSolve(A, b) {
	if (!Array.isArray(A) || !Array.isArray(b)) {
		throw new TypeError('A must be a 2D array and b must be an array')
	}
	const n = A.length
	if (b.length !== n) {
		throw new Error('Dimension mismatch between A and b')
	}
	if (n === 0) {
		return []
	}

	const M = new Array(n)
	for (let i = 0; i < n; i++) {
		if (!Array.isArray(A[i]) || A[i].length !== n) {
			throw new Error('Matrix A must be square')
		}
		const row = new Array(n + 1)
		for (let j = 0; j < n; j++) {
			row[j] = A[i][j]
		}
		row[n] = b[i]
		M[i] = row
	}

	const EPS = 1e-12

	for (let col = 0; col < n; col++) {
		let pivotRow = col
		let maxVal = Math.abs(M[col][col])
		for (let row = col + 1; row < n; row++) {
			const val = Math.abs(M[row][col])
			if (val > maxVal) {
				maxVal = val
				pivotRow = row
			}
		}

		if (!Number.isFinite(maxVal) || maxVal <= EPS) {
			throw new Error('Matrix is singular')
		}

		if (pivotRow !== col) {
			const tmp = M[col]
			M[col] = M[pivotRow]
			M[pivotRow] = tmp
		}

		const pivotVal = M[col][col]
		for (let row = col + 1; row < n; row++) {
			const factor = M[row][col] / pivotVal
			M[row][col] = 0
			for (let k = col + 1; k <= n; k++) {
				M[row][k] -= factor * M[col][k]
			}
		}
	}

	const x = new Array(n)
	for (let i = n - 1; i >= 0; i--) {
		let sum = M[i][n]
		for (let j = i + 1; j < n; j++) {
			sum -= M[i][j] * x[j]
		}
		const val = sum / M[i][i]
		x[i] = val === 0 ? 0 : val
	}

	return x
}
