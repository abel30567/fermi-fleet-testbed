export function add(a, b) {
	return a + b
}

export function jacobian3D(u, v, w, x, y, z, h = 1e-6) {
	if (typeof u !== 'function' || typeof v !== 'function' || typeof w !== 'function') {
		throw new TypeError('u, v, and w must be functions')
	}
	if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
		throw new RangeError('x, y, and z must be finite numbers')
	}
	if (!Number.isFinite(h) || h <= 0) {
		throw new RangeError('h must be a positive finite number')
	}

	const twoH = 2 * h
	return [u, v, w].map((f) => [
		(f(x + h, y, z) - f(x - h, y, z)) / twoH,
		(f(x, y + h, z) - f(x, y - h, z)) / twoH,
		(f(x, y, z + h) - f(x, y, z - h)) / twoH,
	])
}
