export function add(a, b) {
	return a + b
}

export function partialZ(f, x, y, z, h = 1e-6) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}
	if (typeof h !== 'number' || !Number.isFinite(h) || h <= 0) {
		throw new RangeError('h must be a positive finite number')
	}
	return (f(x, y, z + h) - f(x, y, z - h)) / (2 * h)
}
