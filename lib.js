export function add(a, b) {
	return a + b
}

export function lineIntegralVector(F, r, t0, t1, n = 500) {
	if (typeof F !== 'function') {
		throw new TypeError('F must be a function')
	}
	if (typeof r !== 'function') {
		throw new TypeError('r must be a function')
	}
	if (
		typeof t0 !== 'number' ||
		!Number.isFinite(t0) ||
		typeof t1 !== 'number' ||
		!Number.isFinite(t1)
	) {
		throw new RangeError('t0 and t1 must be finite numbers')
	}
	if (!Number.isInteger(n) || n <= 0) {
		throw new RangeError('n must be a positive integer')
	}
	if (t0 === t1) {
		return 0
	}

	const dt = (t1 - t0) / n
	const halfDt = dt * 0.5
	const gaussOffset = halfDt / Math.sqrt(3)
	const maxH = 0.05 * Math.abs(dt)

	function dotIntegrand(t) {
		const p = r(t)
		const f = F(p)
		const h = Math.min(1e-4 * Math.max(1, Math.abs(t)), maxH)
		const inv12h = 1 / (12 * h)

		const rm2 = r(t - 2 * h)
		const rm1 = r(t - h)
		const rp1 = r(t + h)
		const rp2 = r(t + 2 * h)

		if (typeof p === 'number') {
			const dr = (-rp2 + 8 * rp1 - 8 * rm1 + rm2) * inv12h
			return f * dr
		}

		const dim = p.length
		if (!Array.isArray(f) || f.length !== dim) {
			throw new RangeError('Vector field F(r(t)) dimension must match curve r(t) dimension')
		}

		let dot = 0
		for (let k = 0; k < dim; k++) {
			const drk = (-rp2[k] + 8 * rp1[k] - 8 * rm1[k] + rm2[k]) * inv12h
			dot += f[k] * drk
		}
		return dot
	}

	let sum = 0
	for (let i = 0; i < n; i++) {
		const mid = t0 + (i + 0.5) * dt
		sum += dotIntegrand(mid - gaussOffset) + dotIntegrand(mid + gaussOffset)
	}

	return sum * halfDt
}
