export function add(a, b) {
	return a + b
}

export function lagrangeInterpolate(xs, ys, x) {
	if (!Array.isArray(xs) || !Array.isArray(ys)) {
		throw new TypeError('xs and ys must be arrays')
	}
	const n = xs.length
	if (n === 0 || n !== ys.length) {
		throw new RangeError('xs and ys must be non-empty arrays of the same length')
	}
	if (typeof x !== 'number' || Number.isNaN(x)) {
		throw new TypeError('x must be a valid number')
	}

	const seen = new Set()
	for (let i = 0; i < n; i++) {
		if (seen.has(xs[i])) {
			throw new RangeError('xs must contain distinct values')
		}
		seen.add(xs[i])
	}

	let result = 0
	for (let i = 0; i < n; i++) {
		if (x === xs[i]) {
			return ys[i]
		}
		let basis = 1
		for (let j = 0; j < n; j++) {
			if (j !== i) {
				basis *= (x - xs[j]) / (xs[i] - xs[j])
			}
		}
		result += ys[i] * basis
	}

	return result
}
