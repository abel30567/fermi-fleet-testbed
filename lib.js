export function add(a, b) {
	return a + b
}

export function gradientND(f, point, h = 1e-6) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}
	if (!Array.isArray(point)) {
		throw new TypeError('point must be an array')
	}
	if (typeof h !== 'number' || !Number.isFinite(h) || h <= 0) {
		throw new RangeError('h must be a positive finite number')
	}

	const n = point.length
	for (let i = 0; i < n; i++) {
		if (typeof point[i] !== 'number' || !Number.isFinite(point[i])) {
			throw new TypeError('point must contain only finite numbers')
		}
	}

	const grad = new Array(n)
	const twoH = 2 * h
	for (let i = 0; i < n; i++) {
		const plus = point.slice()
		const minus = point.slice()
		plus[i] += h
		minus[i] -= h
		grad[i] = (f(plus) - f(minus)) / twoH
	}
	return grad
}
