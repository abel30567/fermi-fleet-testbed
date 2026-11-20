export function add(a, b) {
	return a + b
}

export function romberg1D(f, a, b, maxOrder = 6) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}
	if (!Number.isFinite(a) || !Number.isFinite(b)) {
		throw new RangeError('a and b must be finite numbers')
	}
	if (!Number.isInteger(maxOrder) || maxOrder < 0) {
		throw new RangeError('maxOrder must be a non-negative integer')
	}
	if (a === b) {
		return 0
	}

	let h = b - a
	let prev = [0.5 * h * (f(a) + f(b))]

	for (let i = 1; i <= maxOrder; i++) {
		h *= 0.5
		const count = 2 ** (i - 1)
		let sum = 0
		for (let k = 0; k < count; k++) {
			sum += f(a + (2 * k + 1) * h)
		}

		const curr = new Array(i + 1)
		curr[0] = 0.5 * prev[0] + h * sum

		let factor = 4
		for (let j = 1; j <= i; j++) {
			curr[j] = curr[j - 1] + (curr[j - 1] - prev[j - 1]) / (factor - 1)
			factor *= 4
		}

		prev = curr
	}

	return prev[maxOrder]
}
