export function add(a, b) {
	return a + b
}

export function partialZ(f, x, y, z, h = 1e-5) {
	return (f(x, y, z + h) - f(x, y, z - h)) / (2 * h)
}
