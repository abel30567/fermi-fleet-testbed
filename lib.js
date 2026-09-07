export function add(a, b) {
	return a + b
}

export function curvature2(rx, ry, t, h = 1e-4) {
	const dx = (rx(t + h) - rx(t - h)) / (2 * h)
	const dy = (ry(t + h) - ry(t - h)) / (2 * h)
	const ddx = (rx(t + h) - 2 * rx(t) + rx(t - h)) / (h * h)
	const ddy = (ry(t + h) - 2 * ry(t) + ry(t - h)) / (h * h)
	const speed = Math.sqrt(dx * dx + dy * dy)
	return Math.abs(dx * ddy - dy * ddx) / (speed * speed * speed)
}
