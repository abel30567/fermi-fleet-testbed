export function add(a, b) {
	return a + b
}

export function covariance(xs, ys) {
	if (!Array.isArray(xs) || !Array.isArray(ys)) {
		throw new TypeError('Inputs must be arrays')
	}
	if (xs.length !== ys.length) {
		throw new RangeError('Input arrays must have equal length')
	}
	const n = xs.length
	if (n === 0) {
		throw new RangeError('Input arrays must not be empty')
	}

	let sumX = 0
	let sumY = 0
	for (let i = 0; i < n; i++) {
		sumX += xs[i]
		sumY += ys[i]
	}
	const meanX = sumX / n
	const meanY = sumY / n

	let covSum = 0
	for (let i = 0; i < n; i++) {
		covSum += (xs[i] - meanX) * (ys[i] - meanY)
	}
	const result = covSum / n
	return Object.is(result, -0) ? 0 : result
}
