export function add(a, b) {
	return a + b
}

export function hessian2D(f, x, y, h = 1e-4) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}
	if (!Number.isFinite(x) || !Number.isFinite(y)) {
		throw new RangeError('x and y must be finite numbers')
	}
	if (!Number.isFinite(h) || h <= 0) {
		throw new RangeError('h must be a positive finite number')
	}

	const f0 = f(x, y)
	const h2 = h * h

	const fxx = (f(x + h, y) - 2 * f0 + f(x - h, y)) / h2
	const fyy = (f(x, y + h) - 2 * f0 + f(x, y - h)) / h2
	const fxy = (f(x + h, y + h) - f(x + h, y - h) - f(x - h, y + h) + f(x - h, y - h)) / (4 * h2)
	const fyx = fxy

	return [
		[fxx, fxy],
		[fyx, fyy],
	]
}
