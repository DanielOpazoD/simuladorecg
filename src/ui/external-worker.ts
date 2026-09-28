import { analyzeSamples } from '../engine/sample-analysis';
import { externalWindow, parseECGCsv, parseWfdb16, MAX_FILE_BYTES, type CsvOptions } from '../io/external-ecg';
import { evaluateExternalWindow } from '../io/external-assessment';
import { fingerprintECG } from '../io/external-review';

self.onmessage = async ({data}: MessageEvent) => {
  try {
    if (!data || !Number.isSafeInteger(data.id) || !['read','analyze'].includes(data.kind)) throw Error('Solicitud externa inválida.');
    if (data.kind === 'analyze') {
      if (!Number.isSafeInteger(data.startSample) || data.startSample < 0) throw Error('Inicio de ventana inválido.');
      // Gate first. No annotations, truth, synthetic events or diagnosis reach this pipeline.
      const result = evaluateExternalWindow(data.samples, analyzeSamples);
      self.postMessage({id:data.id, kind:data.kind, startSample:data.startSample, ...result});
      return;
    }
    const files: File[] = data.files;
    if (!Array.isArray(files) || files.length < 1 || files.length > 2 || files.some(f => !(f instanceof File) || f.size > MAX_FILE_BYTES)) throw Error('Selecciona un CSV o una pareja .hea + .dat; máximo 32 MiB por archivo.');
    const csv = files.find(f => /\.csv$/i.test(f.name));
    let record;
    if (files.length === 1 && csv) record = parseECGCsv(await csv.text(), data.csv as CsvOptions | undefined);
    else {
      const hea = files.find(f => /\.hea$/i.test(f.name)), dat = files.find(f => /\.dat$/i.test(f.name));
      if (!hea || !dat || hea.size > 65536) throw Error('Selecciona juntos el encabezado .hea y su señal .dat. No acepta imágenes, PDF ni JSON de casos.');
      record = parseWfdb16(await hea.text(), await dat.arrayBuffer(), dat.name);
    }
    const identity = await fingerprintECG(record);
    const result = evaluateExternalWindow(externalWindow(record, 0), analyzeSamples);
    self.postMessage({id:data.id, kind:data.kind, startSample:0, record, identity, ...result},
      {transfer:Object.values(record.leads).map(x => x.buffer)});
  } catch (e) { self.postMessage({id:data?.id, error:e instanceof Error ? e.message : 'No se pudo leer la señal.'}); }
};
