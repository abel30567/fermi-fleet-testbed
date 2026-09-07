export function add(a, b) {
	return a + b
}

export function laplacian3(f, x, y, z, h = 1e-4) {
	const dxx = (f(x + h, y, z) - 2 * f(x, y, z) + f(x - h, y, z)) / (h * h)
	const dyy = (f(x, y + h, z) - 2 * f(x, y, z) + f(x, y - h, z)) / (h * h)
	const dzz = (f(x, y, z + h) - 2 * f(x, y, z) + f(x, y, z - h)) / (h * h)
	return dxx + dyy + dzz
}
