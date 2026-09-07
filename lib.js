export function add(a, b) {
	return a + b
}

export function fluxThroughCurve(P, Q, rx, ry, t0, t1, n = 1000) {
	const dt = (t1 - t0) / n
	const h = dt / 2
	let flux = 0
	for (let i = 0; i < n; i++) {
		const t = t0 + i * dt
		const tMid = t + h
		const x = rx(tMid)
		const y = ry(tMid)
		const dx = (rx(tMid + h) - rx(tMid - h)) / dt
		const dy = (ry(tMid + h) - ry(tMid - h)) / dt
		flux += (P(x, y) * dy - Q(x, y) * dx) * dt
	}
	return flux
}
