export function add(a, b) {
	return a + b
}

export function gradient3D(f, x, y, z, h = 1e-6) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}
	if (typeof h !== 'number' || !Number.isFinite(h) || h <= 0) {
		throw new RangeError('h must be a positive finite number')
	}
	const twoH = 2 * h
	const dfdx = (f(x + h, y, z) - f(x - h, y, z)) / twoH
	const dfdy = (f(x, y + h, z) - f(x, y - h, z)) / twoH
	const dfdz = (f(x, y, z + h) - f(x, y, z - h)) / twoH
	return [dfdx, dfdy, dfdz]
}
