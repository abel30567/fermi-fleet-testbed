export function add(a, b) {
	return a + b
}

export function jacobianDet2D(u, v, x, y, h = 1e-6) {
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
	const dudx = (u(x + h, y) - u(x - h, y)) / twoH
	const dudy = (u(x, y + h) - u(x, y - h)) / twoH
	const dvdx = (v(x + h, y) - v(x - h, y)) / twoH
	const dvdy = (v(x, y + h) - v(x, y - h)) / twoH

	return dudx * dvdy - dudy * dvdx
}
