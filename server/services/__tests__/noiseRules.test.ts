import { describe, expect, it } from 'vitest';
import { classifyFileNoise, classifyHunkNoise, annotateNoise } from '../noiseRules.js';
import type { DiffFile, Hunk } from '../../../shared/types.js';

function mkHunk(oldContent: string, newContent: string): Hunk {
  return {
    oldStart: 1, oldLines: oldContent.split('\n').length,
    newStart: 1, newLines: newContent.split('\n').length,
    oldContent, newContent,
    additions: 0, deletions: 0,
    noise: null,
  };
}

describe('classifyFileNoise', () => {
  it('flags common lockfiles', () => {
    expect(classifyFileNoise('package-lock.json')).toBe('lockfile');
    expect(classifyFileNoise('yarn.lock')).toBe('lockfile');
    expect(classifyFileNoise('pnpm-lock.yaml')).toBe('lockfile');
    expect(classifyFileNoise('apps/web/package-lock.json')).toBe('lockfile');
    expect(classifyFileNoise('go.sum')).toBe('lockfile');
  });

  it('flags build / generated output dirs', () => {
    expect(classifyFileNoise('target/classes/Foo.class')).toBe('generated');
    expect(classifyFileNoise('dist/index.js')).toBe('generated');
    expect(classifyFileNoise('build/foo.txt')).toBe('generated');
    expect(classifyFileNoise('node_modules/lodash/index.js')).toBe('generated');
  });

  it('flags minified bundles', () => {
    expect(classifyFileNoise('vendor.min.js')).toBe('generated');
    expect(classifyFileNoise('app.min.css')).toBe('generated');
  });

  it('flags IDE config dirs / files', () => {
    expect(classifyFileNoise('.idea/workspace.xml')).toBe('ide-config');
    expect(classifyFileNoise('.vscode/settings.json')).toBe('ide-config');
    expect(classifyFileNoise('MyModule.iml')).toBe('ide-config');
  });

  it('returns null for regular source files', () => {
    expect(classifyFileNoise('src/main/java/Foo.java')).toBeNull();
    expect(classifyFileNoise('README.md')).toBeNull();
    expect(classifyFileNoise('package.json')).toBeNull(); // only LOCK is noise
  });
});

describe('classifyHunkNoise', () => {
  it('flags imports-only Java edits', () => {
    const hunk = mkHunk(
      'import java.util.List;\nimport java.util.Map;',
      'import java.util.List;\nimport java.util.Map;\nimport java.util.Set;',
    );
    expect(classifyHunkNoise(hunk, 'Foo.java')).toBe('imports-only');
  });

  it('does NOT flag Java hunks that change real code', () => {
    const hunk = mkHunk(
      'import java.util.List;\nclass Foo { void x() { return; } }',
      'import java.util.List;\nclass Foo { void x() { doSomething(); } }',
    );
    expect(classifyHunkNoise(hunk, 'Foo.java')).toBeNull();
  });

  it('flags TypeScript imports-only hunks', () => {
    const hunk = mkHunk(
      "import { a } from 'x';",
      "import { a, b } from 'x';\nimport { c } from 'y';",
    );
    expect(classifyHunkNoise(hunk, 'src/foo.ts')).toBe('imports-only');
  });

  it('flags hunks where only blank lines were added/removed', () => {
    // The classifier looks at changed LINES (not changed characters within
    // a line). So a hunk whose only change is inserting an empty line
    // counts as whitespace-only; trailing-whitespace tweaks to a code line
    // do NOT (the changed line still has content).
    const hunk = mkHunk('foo();', 'foo();\n   ');
    expect(classifyHunkNoise(hunk, 'src/foo.ts')).toBe('whitespace-only');
  });

  it('returns null for non-import-capable file types', () => {
    const hunk = mkHunk('hello', 'hello\nworld');
    expect(classifyHunkNoise(hunk, 'README.md')).toBeNull();
  });
});

describe('annotateNoise', () => {
  it('sets file noise + skips hunk classification when file is noise', () => {
    const files: DiffFile[] = [{
      path: 'package-lock.json',
      status: 'modified',
      additions: 100, deletions: 80,
      hunks: [mkHunk('old', 'new')],
      rawPatch: '', binary: false, noise: null,
    }];
    annotateNoise(files);
    expect(files[0].noise).toBe('lockfile');
    // Hunk noise should NOT be set when file is already noise (skip optimization)
    expect(files[0].hunks[0].noise).toBeNull();
  });

  it('classifies hunks per file when the file itself is clean', () => {
    const files: DiffFile[] = [{
      path: 'src/Foo.java',
      status: 'modified',
      additions: 2, deletions: 0,
      hunks: [
        mkHunk('import a;', 'import a;\nimport b;'),                  // imports-only
        mkHunk('class Foo { x() { return 1; } }', 'class Foo { x() { return 2; } }'), // real
      ],
      rawPatch: '', binary: false, noise: null,
    }];
    annotateNoise(files);
    expect(files[0].noise).toBeNull();
    expect(files[0].hunks[0].noise).toBe('imports-only');
    expect(files[0].hunks[1].noise).toBeNull();
  });
});
