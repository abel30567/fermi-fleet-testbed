export function add(a, b) {
	return a + b
}

export function tangentPlaneZ(f, x0, y0, x, y, h = 1e-6) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}
	if (
		!Number.isFinite(x0) ||
		!Number.isFinite(y0) ||
		!Number.isFinite(x) ||
		!Number.isFinite(y)
	) {
		throw new RangeError('coordinates x0, y0, x, y must be finite numbers')
	}
	if (!Number.isFinite(h) || h <= 0) {
		throw new RangeError('h must be a positive finite number')
	}
	const z0 = f(x0, y0)
	const fx = (f(x0 + h, y0) - f(x0 - h, y0)) / (2 * h)
	const fy = (f(x0, y0 + h) - f(x0, y0 - h)) / (2 * h)
	return z0 + fx * (x - x0) + fy * (y - y0)
}
