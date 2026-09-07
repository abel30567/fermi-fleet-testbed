export function add(a, b) {
	return a + b
}

export function totalDifferential(f, x, y, dx, dy, h = 1e-5) {
	const fx = (f(x + h, y) - f(x - h, y)) / (2 * h)
	const fy = (f(x, y + h) - f(x, y - h)) / (2 * h)
	return fx * dx + fy * dy
}
