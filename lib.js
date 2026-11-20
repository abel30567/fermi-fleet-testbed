export function add(a, b) {
	return a + b
}

export function pearsonCorrelation(xs, ys) {
	if (!Array.isArray(xs) || !Array.isArray(ys)) {
		throw new TypeError('Inputs xs and ys must be arrays')
	}
	const n = xs.length
	if (n !== ys.length) {
		throw new RangeError(`Input arrays must have the same length (${n} !== ${ys.length})`)
	}
	if (n < 2) {
		throw new RangeError('Input arrays must contain at least 2 elements')
	}

	let sumX = 0
	let sumY = 0
	for (let i = 0; i < n; i++) {
		const x = xs[i]
		const y = ys[i]
		if (typeof x !== 'number' || !Number.isFinite(x) || typeof y !== 'number' || !Number.isFinite(y)) {
			throw new TypeError('All elements in xs and ys must be finite numbers')
		}
		sumX += x
		sumY += y
	}

	const meanX = sumX / n
	const meanY = sumY / n

	let cov = 0
	let varX = 0
	let varY = 0
	for (let i = 0; i < n; i++) {
		const dx = xs[i] - meanX
		const dy = ys[i] - meanY
		cov += dx * dy
		varX += dx * dx
		varY += dy * dy
	}

	if (varX === 0 || varY === 0) {
		throw new RangeError('Zero variance: Pearson correlation is undefined for constant series')
	}

	const prod = varX * varY
	const denom = Number.isFinite(prod) && prod > 0
		? Math.sqrt(prod)
		: Math.sqrt(varX) * Math.sqrt(varY)
	const r = cov / denom
	const clamped = Math.max(-1, Math.min(1, r))
	return clamped === 0 ? 0 : clamped
}
