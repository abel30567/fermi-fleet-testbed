export function add(a, b) {
	return a + b
}

// dz/dt for z = f(x(t), y(t)), via central difference
export function chainRuleDt(f, xt, yt, t0, h = 1e-5) {
	const zPlus = f(xt(t0 + h), yt(t0 + h))
	const zMinus = f(xt(t0 - h), yt(t0 - h))
	return (zPlus - zMinus) / (2 * h)
}
