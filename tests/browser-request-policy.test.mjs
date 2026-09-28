import { describe, expect, it } from 'vitest';
import { isLocalGet } from './support/browser-request-policy.mjs';

const origin = 'http://127.0.0.1:5173';

describe('Accessibility flow network guard', () => {
  it.each([
    `${origin}/build-info.json`,
    `blob:${origin}/82728af3-0453-4294-a59d-16f90af5c4ca`,
  ])('allows a same-origin GET: %s', url => {
    expect(isLocalGet({ method: 'GET', url }, origin)).toBe(true);
  });

  it('allows an HTTPS object URL only for its HTTPS origin', () => {
    expect(isLocalGet({ method: 'GET', url: 'blob:https://ecg.example/export' }, 'https://ecg.example')).toBe(true);
  });

  it.each([
    'http://127.0.0.1:5174/file',
    'https://127.0.0.1:5173/file',
    'http://localhost:5173/file',
    'http://127.0.0.1:51730/file',
    'http://127.0.0.1:5173@external.example/file',
    'blob:http://127.0.0.1:5174/export',
    'blob:http://127.0.0.1:51730/export',
    'blob:https://external.example/export',
    'blob:null/export',
    'data:text/plain,export',
  ])('rejects a foreign or opaque origin: %s', url => {
    expect(isLocalGet({ method: 'GET', url }, origin)).toBe(false);
  });

  it.each(['POST', 'PUT', 'DELETE', 'HEAD'])('rejects %s even for local ordinary and blob URLs', method => {
    for (const url of [`${origin}/file`, `blob:${origin}/export`])
      expect(isLocalGet({ method, url }, origin)).toBe(false);
  });

  it('fails closed for malformed URLs and opaque expected origins', () => {
    expect(() => isLocalGet({ method: 'GET', url: 'not an absolute URL' }, origin)).toThrow(TypeError);
    expect(isLocalGet({ method: 'GET', url: 'blob:null/export' }, 'null')).toBe(false);
  });
});
