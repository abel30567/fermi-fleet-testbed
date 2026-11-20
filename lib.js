export function add(a, b) {
	return a + b
}

export function meanVariance(values) {
	if (!Array.isArray(values) || values.length === 0) {
		throw new Error('values must be a non-empty array')
	}

	let mean = 0
	let m2 = 0
	for (let i = 0; i < values.length; i++) {
		const x = values[i]
		if (typeof x !== 'number' || !Number.isFinite(x)) {
			throw new TypeError('All values must be finite numbers')
		}
		const delta = x - mean
		mean += delta / (i + 1)
		const delta2 = x - mean
		m2 += delta * delta2
	}

	const variance = m2 / values.length
	const stdDev = Math.sqrt(variance)
	return { mean, variance, stdDev }
}
