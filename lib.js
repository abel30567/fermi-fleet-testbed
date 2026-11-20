export function add(a, b) {
	return a + b
}

export function linearRegression(xs, ys) {
	if (!Array.isArray(xs) || !Array.isArray(ys)) {
		throw new TypeError('xs and ys must be arrays')
	}
	if (xs.length !== ys.length) {
		throw new RangeError('xs and ys must have the same length')
	}
	const n = xs.length
	if (n < 2) {
		throw new RangeError('at least two data points are required')
	}

	let sumX = 0
	let sumY = 0
	for (let i = 0; i < n; i++) {
		const x = xs[i]
		const y = ys[i]
		if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) {
			throw new TypeError('all elements of xs and ys must be finite numbers')
		}
		sumX += x
		sumY += y
	}

	const meanX = sumX / n
	const meanY = sumY / n

	let sxx = 0
	let syy = 0
	let sxy = 0
	for (let i = 0; i < n; i++) {
		const dx = xs[i] - meanX
		const dy = ys[i] - meanY
		sxx += dx * dx
		syy += dy * dy
		sxy += dx * dy
	}

	if (sxx === 0) {
		throw new RangeError('variance of xs must be non-zero')
	}

	const rawSlope = sxy / sxx
	const slope = rawSlope === 0 ? 0 : rawSlope
	const rawIntercept = meanY - slope * meanX
	const intercept = rawIntercept === 0 ? 0 : rawIntercept

	let r2
	if (syy === 0) {
		r2 = 1
	} else {
		let ssRes = 0
		for (let i = 0; i < n; i++) {
			const residual = ys[i] - (slope * xs[i] + intercept)
			ssRes += residual * residual
		}
		const rawR2 = 1 - ssRes / syy
		r2 = rawR2 <= 0 ? 0 : rawR2 >= 1 ? 1 : rawR2
	}

	return { slope, intercept, r2 }
}
