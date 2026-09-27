# Acoplamiento QRS → repolarización secundaria

La versión previa usaba plantillas ST-T fijas para varios trastornos de activación. Este bloque deriva la repolarización secundaria desde los mismos kernels QRS finales de cada latido.

- BRI y activación ventricular: oposición al QRS integrado.
- BRD/BRD incompleto: oposición al componente terminal retardado.
- WPW: oposición al vector delta modelado.
- Conducción normal: sin capa secundaria nueva.
- Isquemia, electrolitos y sobrecarga siguen separadas.

AHA/ACCF/HRS describe ST-T secundarios generalmente opuestos al QRS medio en BRI, al componente terminal en BRD y a la delta en preexcitación. La magnitud depende de la alteración QRS. Esta implementación es una aproximación vectorial educativa, no un modelo celular ni una regla diagnóstica calibrada.

Referencias: Surawicz et al., Circulation 2009;119:e235-e240, doi:10.1161/CIRCULATIONAHA.108.191095. Rautaharju et al., Circulation 2009;119:e241-e250, doi:10.1161/CIRCULATIONAHA.108.191096. Potse et al., Europace 2017; PMID 28011826.
