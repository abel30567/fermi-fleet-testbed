export function add(a, b) {
	return a + b
}

export function curl3D(fx, fy, fz, x, y, z, h = 1e-6) {
	if (typeof fx !== 'function' || typeof fy !== 'function' || typeof fz !== 'function') {
		throw new TypeError('Vector field components fx, fy, fz must be functions')
	}
	if (
		typeof x !== 'number' ||
		typeof y !== 'number' ||
		typeof z !== 'number' ||
		!Number.isFinite(x) ||
		!Number.isFinite(y) ||
		!Number.isFinite(z)
	) {
		throw new RangeError('Coordinates x, y, z must be finite numbers')
	}
	if (typeof h !== 'number' || !Number.isFinite(h) || h <= 0) {
		throw new RangeError('Step size h must be a positive finite number')
	}

	const inv2h = 1 / (2 * h)
	const dfzDy = (fz(x, y + h, z) - fz(x, y - h, z)) * inv2h
	const dfyDz = (fy(x, y, z + h) - fy(x, y, z - h)) * inv2h
	const dfxDz = (fx(x, y, z + h) - fx(x, y, z - h)) * inv2h
	const dfzDx = (fz(x + h, y, z) - fz(x - h, y, z)) * inv2h
	const dfyDx = (fy(x + h, y, z) - fy(x - h, y, z)) * inv2h
	const dfxDy = (fx(x, y + h, z) - fx(x, y - h, z)) * inv2h

	return [dfzDy - dfyDz, dfxDz - dfzDx, dfyDx - dfxDy]
}
