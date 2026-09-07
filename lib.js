export function add(a, b) {
	return a + b
}

export function speed2(rx, ry, t, h = 1e-5) {
	const dx = (rx(t + h) - rx(t - h)) / (2 * h)
	const dy = (ry(t + h) - ry(t - h)) / (2 * h)
	return Math.hypot(dx, dy)
}
