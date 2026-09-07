export function add(a, b) {
	return a + b
}

export function acceleration2(rx, ry, t, h = 1e-4) {
	const ax = (rx(t + h) - 2 * rx(t) + rx(t - h)) / (h * h)
	const ay = (ry(t + h) - 2 * ry(t) + ry(t - h)) / (h * h)
	return [ax, ay]
}
