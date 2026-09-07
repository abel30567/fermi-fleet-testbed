export function add(a, b) {
	return a + b
}

export function richardsonPartialX(f, x, y, h = 1e-3) {
	const centralDiff = (step) => (f(x + step, y) - f(x - step, y)) / (2 * step)
	const dh = centralDiff(h)
	const dh2 = centralDiff(h / 2)
	return (4 * dh2 - dh) / 3
}
