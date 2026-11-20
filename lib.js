export function add(a, b) {
	return a + b
}

export function gradient2D(f, x, y, h = 1e-6) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}
	if (!Number.isFinite(x) || !Number.isFinite(y)) {
		throw new RangeError('x and y must be finite numbers')
	}
	if (!Number.isFinite(h) || h <= 0) {
		throw new RangeError('h must be a positive finite number')
	}

	const dfdx = (f(x + h, y) - f(x - h, y)) / (2 * h)
	const dfdy = (f(x, y + h) - f(x, y - h)) / (2 * h)
	return [dfdx, dfdy]
}
