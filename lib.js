export function add(a, b) {
	return a + b
}

export function tangentPlane(f, x0, y0, h = 1e-5) {
	const fx = (f(x0 + h, y0) - f(x0 - h, y0)) / (2 * h)
	const fy = (f(x0, y0 + h) - f(x0, y0 - h)) / (2 * h)
	const z0 = f(x0, y0)
	return { fx, fy, z0 }
}
