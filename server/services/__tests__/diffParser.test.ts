import { describe, expect, it } from 'vitest';
import { parseUnifiedDiff } from '../diffParser.js';

const SIMPLE_DIFF = `diff --git a/src/Foo.java b/src/Foo.java
index 1111..2222 100644
--- a/src/Foo.java
+++ b/src/Foo.java
@@ -1,4 +1,5 @@
 package com.example;

+import java.util.List;
 class Foo {
-  void bar() {}
+  void bar(List<String> xs) {}
 }`;

const ADDED_FILE_DIFF = `diff --git a/src/New.java b/src/New.java
new file mode 100644
index 0000..1111
--- /dev/null
+++ b/src/New.java
@@ -0,0 +1,3 @@
+package com.example;
+
+class New {}`;

const RENAMED_FILE_DIFF = `diff --git a/src/Old.java b/src/Renamed.java
similarity index 90%
rename from src/Old.java
rename to src/Renamed.java
index 1111..2222 100644
--- a/src/Old.java
+++ b/src/Renamed.java
@@ -1,3 +1,3 @@
 class X {
-  int a;
+  int b;
 }`;

const BINARY_DIFF = `diff --git a/icon.png b/icon.png
index 1111..2222 100644
Binary files a/icon.png and b/icon.png differ`;

const MULTI_HUNK_DIFF = `diff --git a/src/F.java b/src/F.java
--- a/src/F.java
+++ b/src/F.java
@@ -1,2 +1,2 @@
 hello
-world
+WORLD
@@ -50,2 +50,3 @@
 alpha
+inserted
 beta`;

describe('parseUnifiedDiff', () => {
  it('returns [] on empty input', () => {
    expect(parseUnifiedDiff('')).toEqual([]);
    expect(parseUnifiedDiff('\n  \n')).toEqual([]);
  });

  it('parses a basic modified-file diff', () => {
    const files = parseUnifiedDiff(SIMPLE_DIFF);
    expect(files).toHaveLength(1);
    const f = files[0];
    expect(f.path).toBe('src/Foo.java');
    expect(f.status).toBe('modified');
    expect(f.hunks).toHaveLength(1);
    expect(f.additions).toBe(2);
    expect(f.deletions).toBe(1);
    expect(f.binary).toBe(false);
  });

  it('counts +/- per hunk correctly', () => {
    const [f] = parseUnifiedDiff(MULTI_HUNK_DIFF);
    expect(f.hunks).toHaveLength(2);
    expect(f.hunks[0].additions).toBe(1);
    expect(f.hunks[0].deletions).toBe(1);
    expect(f.hunks[1].additions).toBe(1);
    expect(f.hunks[1].deletions).toBe(0);
  });

  it('records oldStart/newStart per hunk from the @@ header', () => {
    const [f] = parseUnifiedDiff(MULTI_HUNK_DIFF);
    expect(f.hunks[0].oldStart).toBe(1);
    expect(f.hunks[0].newStart).toBe(1);
    expect(f.hunks[1].oldStart).toBe(50);
    expect(f.hunks[1].newStart).toBe(50);
  });

  it('detects added files', () => {
    const [f] = parseUnifiedDiff(ADDED_FILE_DIFF);
    expect(f.status).toBe('added');
    expect(f.path).toBe('src/New.java');
    expect(f.hunks[0].additions).toBe(3);
    expect(f.hunks[0].deletions).toBe(0);
  });

  it('detects renamed files and records oldPath', () => {
    const [f] = parseUnifiedDiff(RENAMED_FILE_DIFF);
    expect(f.status).toBe('renamed');
    expect(f.path).toBe('src/Renamed.java');
    expect(f.oldPath).toBe('src/Old.java');
  });

  it('marks binary files and produces zero hunks', () => {
    const [f] = parseUnifiedDiff(BINARY_DIFF);
    expect(f.binary).toBe(true);
    expect(f.hunks).toHaveLength(0);
  });

  it('preserves the raw patch verbatim per file', () => {
    const [f] = parseUnifiedDiff(SIMPLE_DIFF);
    expect(f.rawPatch).toContain('diff --git a/src/Foo.java');
    expect(f.rawPatch).toContain('+  void bar(List<String> xs) {}');
  });

  it('handles multiple files in one diff blob', () => {
    const combined = SIMPLE_DIFF + '\n' + ADDED_FILE_DIFF;
    const files = parseUnifiedDiff(combined);
    expect(files).toHaveLength(2);
    expect(files[0].status).toBe('modified');
    expect(files[1].status).toBe('added');
  });
});
