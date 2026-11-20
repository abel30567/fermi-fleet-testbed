export function add(a, b) {
	return a + b
}

export function jacobian2D(u, v, x, y, h = 1e-6) {
	if (typeof u !== 'function' || typeof v !== 'function') {
		throw new TypeError('u and v must be functions')
	}
	if (!Number.isFinite(x) || !Number.isFinite(y)) {
		throw new RangeError('x and y must be finite numbers')
	}
	if (!Number.isFinite(h) || h <= 0) {
		throw new RangeError('h must be a positive finite number')
	}

	const twoH = 2 * h
	const duDx = (u(x + h, y) - u(x - h, y)) / twoH
	const duDy = (u(x, y + h) - u(x, y - h)) / twoH
	const dvDx = (v(x + h, y) - v(x - h, y)) / twoH
	const dvDy = (v(x, y + h) - v(x, y - h)) / twoH

	return [
		[duDx, duDy],
		[dvDx, dvDy],
	]
}
