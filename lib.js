export function add(a, b) {
	return a + b
}

export function lineIntegralScalar(f, rx, ry, t0, t1, n = 1000) {
	const dt = (t1 - t0) / n
	let sum = 0
	for (let i = 0; i < n; i++) {
		const ta = t0 + i * dt
		const tb = ta + dt
		const tm = (ta + tb) / 2
		const dx = (rx(tb) - rx(ta)) / dt
		const dy = (ry(tb) - ry(ta)) / dt
		const speed = Math.sqrt(dx * dx + dy * dy)
		sum += f(rx(tm), ry(tm)) * speed * dt
	}
	return sum
}
