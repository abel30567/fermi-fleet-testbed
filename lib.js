export function add(a, b) {
	return a + b
}

export function directionalDerivative(f, x, y, ux, uy, h = 1e-5) {
	const norm = Math.sqrt(ux * ux + uy * uy)
	if (norm === 0) {
		throw new RangeError('direction vector must not be zero')
	}
	const nx = ux / norm
	const ny = uy / norm
	return (f(x + h * nx, y + h * ny) - f(x - h * nx, y - h * ny)) / (2 * h)
}
