export function add(a, b) {
	return a + b
}

export function powerIteration(A, maxIter = 200, tol = 1e-10) {
	if (!Array.isArray(A) || A.length === 0) {
		throw new TypeError('A must be a non-empty square matrix')
	}
	const n = A.length
	for (let i = 0; i < n; i++) {
		if (!Array.isArray(A[i]) || A[i].length !== n) {
			throw new TypeError('A must be a square matrix')
		}
		for (let j = 0; j < n; j++) {
			if (typeof A[i][j] !== 'number' || !Number.isFinite(A[i][j])) {
				throw new TypeError('Matrix entries must be finite numbers')
			}
		}
	}
	if (!Number.isInteger(maxIter) || maxIter < 1) {
		throw new RangeError('maxIter must be a positive integer')
	}
	if (typeof tol !== 'number' || !Number.isFinite(tol) || tol < 0) {
		throw new RangeError('tol must be a non-negative finite number')
	}

	const cleanZero = (x) => (x === 0 ? 0 : x)

	const matVec = (M, x) => {
		const out = new Array(n)
		for (let i = 0; i < n; i++) {
			let sum = 0
			const row = M[i]
			for (let j = 0; j < n; j++) {
				sum += row[j] * x[j]
			}
			out[i] = sum
		}
		return out
	}

	const dot = (u, v) => {
		let sum = 0
		for (let i = 0; i < n; i++) {
			sum += u[i] * v[i]
		}
		return sum
	}

	const norm = (u) => Math.hypot(...u)

	const canonicalize = (u) => {
		let pivot = 0
		for (let i = 0; i < n; i++) {
			if (Math.abs(u[i]) > 1e-12) {
				pivot = u[i]
				break
			}
		}
		const sign = pivot < 0 ? -1 : 1
		return u.map((x) => cleanZero(sign * x))
	}

	if (n === 1) {
		return {
			eigenvalue: cleanZero(A[0][0]),
			eigenvector: [1],
		}
	}

	let v = new Array(n)
	for (let i = 0; i < n; i++) {
		v[i] = 1 + 0.3141592653589793 * i
	}
	const vNorm = norm(v)
	for (let i = 0; i < n; i++) {
		v[i] /= vNorm
	}

	if (norm(matVec(A, v)) === 0) {
		let found = false
		for (let k = 0; k < n; k++) {
			const e = new Array(n).fill(0)
			e[k] = 1
			if (norm(matVec(A, e)) > 0) {
				v = e
				found = true
				break
			}
		}
		if (!found) {
			const e0 = new Array(n).fill(0)
			e0[0] = 1
			return { eigenvalue: 0, eigenvector: e0 }
		}
	}

	let prevLambda = NaN

	for (let iter = 0; iter < maxIter; iter++) {
		const w = matVec(A, v)
		const wNorm = norm(w)
		if (wNorm === 0) {
			return {
				eigenvalue: 0,
				eigenvector: canonicalize(v),
			}
		}

		const lambda = dot(v, w)
		const nextV = new Array(n)
		for (let i = 0; i < n; i++) {
			nextV[i] = w[i] / wNorm
		}

		const align = dot(v, nextV) < 0 ? -1 : 1
		let diffSq = 0
		for (let i = 0; i < n; i++) {
			nextV[i] *= align
			const d = nextV[i] - v[i]
			diffSq += d * d
		}
		const vecDiff = Math.sqrt(diffSq)
		v = nextV

		const lambdaDiff = Number.isNaN(prevLambda)
			? Infinity
			: Math.abs(lambda - prevLambda)
		prevLambda = lambda

		if (vecDiff <= tol && lambdaDiff <= tol * Math.max(1, Math.abs(lambda))) {
			break
		}
	}

	const Av = matVec(A, v)
	const eigenvalue = cleanZero(dot(v, Av))

	return {
		eigenvalue,
		eigenvector: canonicalize(v),
	}
}
