import { analyzeSamples } from '../engine/sample-analysis';
import { externalWindow, parseECGCsv, parseWfdb16, MAX_FILE_BYTES, type CsvOptions } from '../io/external-ecg';

self.onmessage = async ({data}: MessageEvent) => {
  try {
    if (data.kind === 'analyze') {
      // Only fs/leads reach the analyzer. No synthetic audit, diagnosis or annotations.
      const measurement = analyzeSamples(data.samples);
      self.postMessage({ measurement });
      return;
    }
    const files: File[] = data.files;
    if (!Array.isArray(files) || files.length < 1 || files.length > 2 || files.some(f => f.size > MAX_FILE_BYTES)) throw Error('Selecciona un CSV o una pareja .hea + .dat; máximo 32 MiB por archivo.');
    const csv = files.find(f => /\.csv$/i.test(f.name));
    let record;
    if (files.length === 1 && csv) record = parseECGCsv(await csv.text(), data.csv as CsvOptions | undefined);
    else {
      const hea = files.find(f => /\.hea$/i.test(f.name)), dat = files.find(f => /\.dat$/i.test(f.name));
      if (!hea || !dat || hea.size > 65536) throw Error('Selecciona juntos el encabezado .hea y su señal .dat. No acepta imágenes, PDF ni JSON de casos.');
      record = parseWfdb16(await hea.text(), await dat.arrayBuffer(), dat.name);
    }
    const measurement = analyzeSamples(externalWindow(record, 0));
    // No raw header, comments, patient fields or source filename are returned/stored.
    self.postMessage({ record, measurement }, { transfer: Object.values(record.leads).map(x => x.buffer) });
  } catch (e) { self.postMessage({ error: e instanceof Error ? e.message : 'No se pudo leer la señal.' }); }
};
