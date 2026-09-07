export function add(a, b) {
	return a + b
}

export function arcLength2(rx, ry, t0, t1, n = 1000) {
	let length = 0
	const dt = (t1 - t0) / n
	let px = rx(t0)
	let py = ry(t0)
	for (let i = 1; i <= n; i++) {
		const t = t0 + i * dt
		const x = rx(t)
		const y = ry(t)
		length += Math.hypot(x - px, y - py)
		px = x
		py = y
	}
	return length
}
