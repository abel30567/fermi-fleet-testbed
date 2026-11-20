export function add(a, b) {
	return a + b
}

export function divergence3D(fx, fy, fz, x, y, z, h = 1e-6) {
	if (typeof fx !== 'function' || typeof fy !== 'function' || typeof fz !== 'function') {
		throw new TypeError('fx, fy, and fz must be functions')
	}
	if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
		throw new RangeError('Coordinates x, y, and z must be finite numbers')
	}
	if (!Number.isFinite(h) || h <= 0) {
		throw new RangeError('Step size h must be a positive finite number')
	}

	const dfx = (fx(x + h, y, z) - fx(x - h, y, z)) / (2 * h)
	const dfy = (fy(x, y + h, z) - fy(x, y - h, z)) / (2 * h)
	const dfz = (fz(x, y, z + h) - fz(x, y, z - h)) / (2 * h)

	return dfx + dfy + dfz
}
