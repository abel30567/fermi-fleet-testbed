export function add(a, b) {
	return a + b
}

export function gradient3(f, x, y, z, h = 1e-5) {
	const dfdx = (f(x + h, y, z) - f(x - h, y, z)) / (2 * h)
	const dfdy = (f(x, y + h, z) - f(x, y - h, z)) / (2 * h)
	const dfdz = (f(x, y, z + h) - f(x, y, z - h)) / (2 * h)
	return [dfdx, dfdy, dfdz]
}
