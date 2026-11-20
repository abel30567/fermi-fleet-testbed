export function add(a, b) {
	return a + b
}

export function gramSchmidt(vectors) {
	if (!Array.isArray(vectors)) {
		throw new TypeError('vectors must be an array')
	}
	if (vectors.length === 0) {
		return []
	}

	const first = vectors[0]
	if (!Array.isArray(first) || first.length === 0) {
		throw new TypeError('each vector must be a non-empty array of finite numbers')
	}
	const dim = first.length

	for (let i = 0; i < vectors.length; i++) {
		const vec = vectors[i]
		if (!Array.isArray(vec)) {
			throw new TypeError('each vector must be an array of finite numbers')
		}
		if (vec.length !== dim) {
			throw new RangeError('all vectors must have the same dimension')
		}
		for (let k = 0; k < dim; k++) {
			if (typeof vec[k] !== 'number' || !Number.isFinite(vec[k])) {
				throw new TypeError('vector components must be finite numbers')
			}
		}
	}

	const eps = 1e-12
	const basis = []

	for (let i = 0; i < vectors.length; i++) {
		const v = vectors[i].slice()

		for (let j = 0; j < basis.length; j++) {
			const q = basis[j]
			let dot = 0
			for (let k = 0; k < dim; k++) {
				dot += q[k] * v[k]
			}
			for (let k = 0; k < dim; k++) {
				v[k] -= dot * q[k]
			}
		}

		const norm = Math.hypot(...v)
		if (norm <= eps) {
			throw new RangeError('vectors must be linearly independent')
		}

		const unit = new Array(dim)
		for (let k = 0; k < dim; k++) {
			const val = v[k] / norm
			unit[k] = val === 0 ? 0 : val
		}
		basis.push(unit)
	}

	return basis
}
