import { describe, expect, it } from 'vitest';
import { reorderForReading } from '../readingOrder.js';
import type { DiffFile, NoiseTag } from '../../../shared/types.js';

function mkFile(path: string, opts: Partial<DiffFile> = {}): DiffFile {
  return {
    path,
    status: 'modified',
    additions: 10,
    deletions: 0,
    hunks: [],
    rawPatch: '',
    binary: false,
    noise: null,
    ...opts,
  };
}

describe('reorderForReading', () => {
  it('puts noise files last', () => {
    const files = [
      mkFile('package-lock.json', { noise: 'lockfile' as NoiseTag }),
      mkFile('src/Foo.java'),
    ];
    const sorted = reorderForReading(files);
    expect(sorted[0].path).toBe('src/Foo.java');
    expect(sorted[1].path).toBe('package-lock.json');
  });

  it('puts tests after production code', () => {
    const files = [
      mkFile('src/test/java/FooTest.java'),
      mkFile('src/main/java/Foo.java'),
    ];
    const sorted = reorderForReading(files);
    expect(sorted[0].path).toBe('src/main/java/Foo.java');
    expect(sorted[1].path).toBe('src/test/java/FooTest.java');
  });

  it('puts interface-like files before implementations', () => {
    const files = [
      mkFile('src/main/java/FooImpl.java'),
      mkFile('src/main/java/interface/Foo.java'),
    ];
    const sorted = reorderForReading(files);
    expect(sorted[0].path).toBe('src/main/java/interface/Foo.java');
  });

  it('puts schema/model files before regular code', () => {
    const files = [
      mkFile('src/handler.ts'),
      mkFile('src/model.ts'),
    ];
    const sorted = reorderForReading(files);
    expect(sorted[0].path).toBe('src/model.ts');
  });

  it('is a stable sort — equal-score files keep input order', () => {
    const files = [
      mkFile('src/a.ts'),
      mkFile('src/b.ts'),
      mkFile('src/c.ts'),
    ];
    const sorted = reorderForReading(files);
    expect(sorted.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
  });

  it('produces the full prod → test → noise order on a realistic mix', () => {
    const files = [
      mkFile('package-lock.json', { noise: 'lockfile' as NoiseTag }),
      mkFile('src/test/java/FooTest.java'),
      mkFile('src/main/java/Foo.java'),
      mkFile('src/main/java/model.ts'),
    ];
    const sorted = reorderForReading(files);
    expect(sorted.map((f) => f.path)).toEqual([
      'src/main/java/model.ts',
      'src/main/java/Foo.java',
      'src/test/java/FooTest.java',
      'package-lock.json',
    ]);
  });
});
