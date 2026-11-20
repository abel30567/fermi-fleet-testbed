export function add(a, b) {
	return a + b
}

export function partialX(f, x, y, h = 1e-6) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}
	if (!Number.isFinite(h) || h === 0) {
		throw new RangeError('h must be a non-zero finite number')
	}
	return (f(x + h, y) - f(x - h, y)) / (2 * h)
}
