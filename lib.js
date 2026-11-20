export function add(a, b) {
	return a + b
}

export function divergence2D(fx, fy, x, y, h = 1e-6) {
	if (typeof fx !== 'function' || typeof fy !== 'function') {
		throw new TypeError('fx and fy must be functions')
	}
	if (!Number.isFinite(x) || !Number.isFinite(y)) {
		throw new RangeError('x and y must be finite numbers')
	}
	if (!Number.isFinite(h) || h <= 0) {
		throw new RangeError('h must be a positive finite number')
	}

	const dfxDx = (fx(x + h, y) - fx(x - h, y)) / (2 * h)
	const dfyDy = (fy(x, y + h) - fy(x, y - h)) / (2 * h)
	return dfxDx + dfyDy
}
