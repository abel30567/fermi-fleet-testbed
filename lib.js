export function add(a, b) {
	return a + b
}

export function jacobianDet3D(u, v, w, x, y, z, h = 1e-6) {
	if (typeof u !== 'function' || typeof v !== 'function' || typeof w !== 'function') {
		throw new TypeError('u, v, and w must be functions')
	}
	if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
		throw new RangeError('x, y, and z must be finite numbers')
	}
	if (!Number.isFinite(h) || h <= 0) {
		throw new RangeError('h must be a positive finite number')
	}

	const inv2h = 1 / (2 * h)

	const ux = (u(x + h, y, z) - u(x - h, y, z)) * inv2h
	const uy = (u(x, y + h, z) - u(x, y - h, z)) * inv2h
	const uz = (u(x, y, z + h) - u(x, y, z - h)) * inv2h

	const vx = (v(x + h, y, z) - v(x - h, y, z)) * inv2h
	const vy = (v(x, y + h, z) - v(x, y - h, z)) * inv2h
	const vz = (v(x, y, z + h) - v(x, y, z - h)) * inv2h

	const wx = (w(x + h, y, z) - w(x - h, y, z)) * inv2h
	const wy = (w(x, y + h, z) - w(x, y - h, z)) * inv2h
	const wz = (w(x, y, z + h) - w(x, y, z - h)) * inv2h

	return (
		ux * (vy * wz - vz * wy) -
		uy * (vx * wz - vz * wx) +
		uz * (vx * wy - vy * wx)
	)
}
