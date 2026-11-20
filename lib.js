export function add(a, b) {
	return a + b
}

export function qrDecompose(A) {
	if (!Array.isArray(A) || A.length === 0) {
		throw new TypeError('Matrix A must be a non-empty 2D array')
	}

	const m = A.length
	const firstRow = A[0]
	if (!Array.isArray(firstRow) || firstRow.length === 0) {
		throw new TypeError('Matrix A must be a non-empty 2D array')
	}

	const n = firstRow.length
	if (m < n) {
		throw new RangeError('Matrix A must have at least as many rows as columns (m >= n)')
	}

	const V = Array.from({ length: n }, () => new Array(m))
	let frobeniusSq = 0

	for (let i = 0; i < m; i++) {
		const row = A[i]
		if (!Array.isArray(row) || row.length !== n) {
			throw new TypeError('Matrix A must have uniform row lengths')
		}
		for (let j = 0; j < n; j++) {
			const val = row[j]
			if (typeof val !== 'number' || !Number.isFinite(val)) {
				throw new TypeError('Matrix A must contain only finite numbers')
			}
			V[j][i] = val
			frobeniusSq += val * val
		}
	}

	const normA = Math.sqrt(frobeniusSq)
	if (normA === 0) {
		throw new Error('Matrix A must be full column rank')
	}
	const rankTol = 1e-12 * normA

	const Q = Array.from({ length: m }, () => new Array(n).fill(0))
	const R = Array.from({ length: n }, () => new Array(n).fill(0))

	for (let j = 0; j < n; j++) {
		const vj = V[j]
		let normSq = 0
		for (let i = 0; i < m; i++) {
			normSq += vj[i] * vj[i]
		}
		const rjj = Math.sqrt(normSq)
		if (rjj <= rankTol) {
			throw new Error('Matrix A must be full column rank')
		}

		R[j][j] = rjj
		for (let i = 0; i < m; i++) {
			Q[i][j] = vj[i] / rjj
		}

		for (let k = j + 1; k < n; k++) {
			const vk = V[k]
			let rjk = 0
			for (let i = 0; i < m; i++) {
				rjk += Q[i][j] * vk[i]
			}
			R[j][k] = rjk
			for (let i = 0; i < m; i++) {
				vk[i] -= rjk * Q[i][j]
			}
		}
	}

	return { Q, R }
}
