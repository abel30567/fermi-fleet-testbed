export function add(a, b) {
	return a + b
}

export function implicitPartialZX(F, x, y, z, h = 1e-5) {
	const Fx = (F(x + h, y, z) - F(x - h, y, z)) / (2 * h)
	const Fz = (F(x, y, z + h) - F(x, y, z - h)) / (2 * h)
	if (Math.abs(Fz) < 1e-8) {
		throw new RangeError('Fz is ~0; dz/dx is undefined for this surface at this point')
	}
	return -Fx / Fz
}
