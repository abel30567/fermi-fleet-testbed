export function add(a, b) {
	return a + b
}

export function partialY(f, x, y, h = 1e-6) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}
	if (typeof x !== 'number' || !Number.isFinite(x) || typeof y !== 'number' || !Number.isFinite(y)) {
		throw new RangeError('x and y must be finite numbers')
	}
	if (typeof h !== 'number' || !Number.isFinite(h) || h <= 0) {
		throw new RangeError('h must be a positive finite number')
	}
	return (f(x, y + h) - f(x, y - h)) / (2 * h)
}
