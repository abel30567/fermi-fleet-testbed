export function add(a, b) {
	return a + b
}

export function jacobian22(F, x, y, h = 1e-5) {
	const [uxp, vxp] = F(x + h, y)
	const [uxm, vxm] = F(x - h, y)
	const [uyp, vyp] = F(x, y + h)
	const [uym, vym] = F(x, y - h)

	return [
		[(uxp - uxm) / (2 * h), (uyp - uym) / (2 * h)],
		[(vxp - vxm) / (2 * h), (vyp - vym) / (2 * h)],
	]
}
