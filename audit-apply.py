from pathlib import Path
p=Path('tests/browser-fidelity.mjs');s=p.read_text();old="page.locator('[data-key=\"view.fit\"]')";new="page.locator('#inspector [data-key=\"view.fit\"]')";assert s.count(old) in (0,2);s=s.replace(old,new)
a="['.workspace-footer','.trace-caption','.keyboard-help']";b="['.workspace-footer','.trace-caption','.keyboard-help','.caliper-readout']";assert a in s;s=s.replace(a,b);p.write_text(s)
p=Path('src/style.css');s=p.read_text();a='''  font-size: 13px;
  color: var(--accent);
  flex-wrap: wrap;
}
.caliper-readout button {
  background: transparent;
  color: var(--accent);''';b=a.replace('var(--accent)','var(--ink)');assert a in s;s=s.replace(a,b);p.write_text(s)
p=Path('tests/caliper-input.test.ts');s=p.read_text();a="    expect(css).toContain('#ecg:focus-visible');";b=a+"\n    expect(css.match(/\\.caliper-readout \\{([^}]+)\\}/)![1]).toContain('color: var(--ink)');\n    expect(contrast(token('ink'),token('soft'))).toBeGreaterThanOrEqual(4.5);";assert a in s;s=s.replace(a,b);p.write_text(s)
p=Path('docs/p9-keyboard-calipers.md');s=p.read_text();note='''\nPrimera ejecución Chromium: el nuevo recorrido se detuvo porque el selector de
«Ajustar al ancho» coincidía con dos controles existentes. El test selecciona
ahora explícitamente el del inspector. No se modifican las expectativas de
precisión ni se interpreta ese error del test como un fallo del producto.
'''
if note not in s:s+=note
s+='''\nLa revisión de la captura detectó también contraste 4,28:1 en el texto Δt/ΔV
(acento sobre fondo suave). Se cambia solo ese texto al token de tinta y se añade
su contraste a la prueba de estilos computados en ambos temas; la curva y los
marcadores no cambian de color.\n''';p.write_text(s)
