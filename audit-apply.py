from pathlib import Path
p=Path('tests/browser-fidelity.mjs')
s=p.read_text()
old="page.locator('[data-key=\"view.fit\"]')"
new="page.locator('#inspector [data-key=\"view.fit\"]')"
assert s.count(old)==2
p.write_text(s.replace(old,new))
p=Path('docs/p9-keyboard-calipers.md')
p.write_text(p.read_text()+'''\nPrimera ejecución Chromium: el nuevo recorrido se detuvo porque el selector de
«Ajustar al ancho» coincidía con dos controles existentes. El test selecciona
ahora explícitamente el del inspector. No se modifican las expectativas de
precisión ni se interpreta ese error del test como un fallo del producto.
''')
