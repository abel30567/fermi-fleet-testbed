export function add(a, b) {
	return a + b
}

export function curl2D(fx, fy, x, y, h = 1e-6) {
	if (typeof fx !== 'function' || typeof fy !== 'function') {
		throw new TypeError('fx and fy must be functions')
	}
	if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) {
		throw new RangeError('x and y must be finite numbers')
	}
	if (typeof h !== 'number' || !Number.isFinite(h) || h <= 0) {
		throw new RangeError('h must be a positive finite number')
	}

	const dfyDx = (fy(x + h, y) - fy(x - h, y)) / (2 * h)
	const dfxDy = (fx(x, y + h) - fx(x, y - h)) / (2 * h)
	return dfyDx - dfxDy
}
