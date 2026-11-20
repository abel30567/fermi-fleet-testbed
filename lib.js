export function add(a, b) {
	return a + b
}

export function laplacian2D(f, x, y, h = 1e-4) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}
	if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) {
		throw new TypeError('x and y must be finite numbers')
	}
	if (typeof h !== 'number' || !Number.isFinite(h) || h <= 0) {
		throw new RangeError('h must be a positive finite number')
	}

	const fxy = f(x, y)
	const d2x = f(x + h, y) - 2 * fxy + f(x - h, y)
	const d2y = f(x, y + h) - 2 * fxy + f(x, y - h)
	return (d2x + d2y) / (h * h)
}
