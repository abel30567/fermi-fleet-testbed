export function add(a, b) {
	return a + b
}

export function laplacian3D(f, x, y, z, h = 1e-4) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}
	if (!Number.isFinite(h) || h === 0) {
		throw new RangeError('h must be a non-zero finite number')
	}
	const f0 = f(x, y, z)
	const h2 = h * h
	const d2x = (f(x + h, y, z) - 2 * f0 + f(x - h, y, z)) / h2
	const d2y = (f(x, y + h, z) - 2 * f0 + f(x, y - h, z)) / h2
	const d2z = (f(x, y, z + h) - 2 * f0 + f(x, y, z - h)) / h2
	return d2x + d2y + d2z
}
