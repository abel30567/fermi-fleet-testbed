export function add(a, b) {
	return a + b
}

export function cholesky(A) {
	if (!Array.isArray(A) || A.length === 0) {
		throw new TypeError('Matrix must be a non-empty square 2D array')
	}

	const n = A.length
	for (let i = 0; i < n; i++) {
		if (!Array.isArray(A[i]) || A[i].length !== n) {
			throw new RangeError('Matrix must be square')
		}
		for (let j = 0; j < n; j++) {
			const val = A[i][j]
			if (typeof val !== 'number' || !Number.isFinite(val)) {
				throw new TypeError('Matrix entries must be finite numbers')
			}
		}
	}

	for (let i = 0; i < n; i++) {
		for (let j = i + 1; j < n; j++) {
			const tol = 1e-12 * Math.max(1, Math.abs(A[i][j]), Math.abs(A[j][i]))
			if (Math.abs(A[i][j] - A[j][i]) > tol) {
				throw new Error('Matrix is not symmetric')
			}
		}
	}

	const L = Array.from({ length: n }, () => new Array(n).fill(0))

	for (let i = 0; i < n; i++) {
		for (let j = 0; j <= i; j++) {
			let sum = 0
			for (let k = 0; k < j; k++) {
				sum += L[i][k] * L[j][k]
			}
			if (i === j) {
				const diag = A[i][i] - sum
				if (!(diag > 0) || !Number.isFinite(diag)) {
					throw new Error('Matrix is not positive definite')
				}
				L[i][j] = Math.sqrt(diag)
			} else {
				L[i][j] = (A[i][j] - sum) / L[j][j]
			}
		}
	}

	return L
}
