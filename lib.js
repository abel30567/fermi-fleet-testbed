export function add(a, b) {
	return a + b
}

export function unitTangent2(rx, ry, t, h = 1e-5) {
	const dx = (rx(t + h) - rx(t - h)) / (2 * h)
	const dy = (ry(t + h) - ry(t - h)) / (2 * h)
	const speed = Math.hypot(dx, dy)
	if (speed < 1e-8) {
		throw new RangeError('speed is ~0; unit tangent is undefined')
	}
	return [dx / speed, dy / speed]
}
