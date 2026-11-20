export function add(a, b) {
	return a + b
}

export function trapezoid1D(f, a, b, n = 1000) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}
	if (typeof a !== 'number' || !Number.isFinite(a)) {
		throw new RangeError('a must be a finite number')
	}
	if (typeof b !== 'number' || !Number.isFinite(b)) {
		throw new RangeError('b must be a finite number')
	}
	if (!Number.isInteger(n) || n < 1) {
		throw new RangeError('n must be a positive integer')
	}
	if (a === b) {
		return 0
	}

	const h = (b - a) / n
	let sum = 0.5 * (f(a) + f(b))
	for (let i = 1; i < n; i++) {
		sum += f(a + i * h)
	}
	return sum * h
}
