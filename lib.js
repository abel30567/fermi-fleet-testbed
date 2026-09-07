export function add(a, b) {
	return a + b
}

export function linearApprox2(f, x0, y0, x, y, h = 1e-5) {
	const fx = (f(x0 + h, y0) - f(x0 - h, y0)) / (2 * h)
	const fy = (f(x0, y0 + h) - f(x0, y0 - h)) / (2 * h)
	return f(x0, y0) + fx * (x - x0) + fy * (y - y0)
}
