import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loader } from '@monaco-editor/react';
import { App } from './App.js';
import { usePrefs } from './state/preferences.js';
import { useStore } from './state/store.js';
import './styles.css';

// Expose store for dev/test inspection.
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __PRA__: unknown }).__PRA__ = useStore;
}

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

// Set initial theme on body before first paint to avoid flash.
document.body.dataset.theme = usePrefs.getState().theme;

// Register custom Monaco themes. We also extend Monaco's Java tokenizer so
// method calls get their own token — without this, both methods and
// variables look identical (both come out as "identifier") and VS Code
// Dark+ loses its signature yellow method color.
loader.init().then((monaco) => {
  patchJavaTokenizer(monaco);


  // ---------- VS Code Dark+ ----------
  // Canonical Dark+ token colors (from VS Code source). Method-name yellow
  // can't be perfectly applied because Monaco doesn't distinguish method
  // calls from other identifiers — both get the "identifier" token. We pick
  // the variable color (light blue) for it, which still feels Dark+.
  monaco.editor.defineTheme('vscode-dark-plus-custom', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: 'd4d4d4', background: '1e1e1e' },
      { token: 'comment', foreground: '6a9955', fontStyle: 'italic' },
      { token: 'comment.doc', foreground: '6a9955', fontStyle: 'italic' },

      // Keywords (storage/control) — Dark+ uses #569CD6 blue. Some control
      // keywords are #C586C0 purple in Dark+ but Monaco doesn't distinguish
      // them, so we keep the dominant blue for all.
      { token: 'keyword', foreground: '569cd6' },
      { token: 'keyword.flow', foreground: 'c586c0' },

      { token: 'string', foreground: 'ce9178' },
      { token: 'string.escape', foreground: 'd7ba7d' },
      { token: 'number', foreground: 'b5cea8' },
      { token: 'number.hex', foreground: 'b5cea8' },
      { token: 'number.float', foreground: 'b5cea8' },
      { token: 'regexp', foreground: 'd16969' },

      // Types — Pascal-case identifiers and explicit type tokens
      { token: 'type', foreground: '4ec9b0' },
      { token: 'type.identifier', foreground: '4ec9b0' },

      // Methods — our patched tokenizer emits 'function' for method calls
      { token: 'function', foreground: 'dcdcaa' },

      // Variables / other identifiers
      { token: 'identifier', foreground: '9cdcfe' },

      { token: 'delimiter', foreground: 'd4d4d4' },
      { token: 'operator', foreground: 'd4d4d4' },

      // Java annotations (@Override etc.) — Monaco emits 'annotation' for these
      { token: 'annotation', foreground: 'dcdcaa' },
      { token: 'tag', foreground: '569cd6' },                    // HTML/XML
      { token: 'attribute.name', foreground: '9cdcfe' },
      { token: 'attribute.value', foreground: 'ce9178' },
      { token: 'metatag', foreground: 'dcdcaa' },
      { token: 'predefined', foreground: '4fc1ff' },
      { token: 'constant', foreground: '4fc1ff' },
    ],
    colors: {
      'editor.background': '#1e1e1e',
      'editor.foreground': '#d4d4d4',
      'editorLineNumber.foreground': '#858585',
      'editorLineNumber.activeForeground': '#c6c6c6',
      'editor.selectionBackground': '#264f78',
      'editor.lineHighlightBackground': '#2a2d2e',
      'editorCursor.foreground': '#aeafad',
      'editorIndentGuide.background': '#404040',
      'editorIndentGuide.activeBackground': '#707070',
      'editorGutter.background': '#1e1e1e',

      'diffEditor.insertedLineBackground': '#9bb95530',
      'diffEditor.insertedTextBackground': '#9bb95550',
      'diffEditor.removedLineBackground': '#e54a4a30',
      'diffEditor.removedTextBackground': '#e54a4a50',
      'diffEditor.diagonalFill': '#1e1e1e',
      'diffEditor.border': '#3c3c3c',
      'diffEditor.unchangedRegionBackground': '#252525',
      'diffEditor.unchangedRegionForeground': '#858585',
    },
  });


  // GitHub Dark — colors match github.com's dark theme
  monaco.editor.defineTheme('github-dark-custom', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: 'c9d1d9', background: '0d1117' },
      { token: 'comment', foreground: '8b949e', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'ff7b72' },
      { token: 'string', foreground: 'a5d6ff' },
      { token: 'number', foreground: '79c0ff' },
      { token: 'type', foreground: 'ffa657' },
      { token: 'identifier', foreground: 'c9d1d9' },
      { token: 'delimiter', foreground: 'c9d1d9' },
      { token: 'tag', foreground: '7ee787' },
      { token: 'attribute.name', foreground: '79c0ff' },
      { token: 'attribute.value', foreground: 'a5d6ff' },
      { token: 'function', foreground: 'd2a8ff' },
    ],
    colors: {
      'editor.background': '#0d1117',
      'editor.foreground': '#c9d1d9',
      'editorLineNumber.foreground': '#484f58',
      'editorLineNumber.activeForeground': '#c9d1d9',
      'editor.selectionBackground': '#264f78',
      'editor.lineHighlightBackground': '#161b22',
      'editorCursor.foreground': '#c9d1d9',
      'editorIndentGuide.background': '#21262d',
      'editorGutter.background': '#0d1117',

      'diffEditor.insertedLineBackground': '#3fb95025',
      'diffEditor.insertedTextBackground': '#3fb95040',
      'diffEditor.removedLineBackground': '#f8514925',
      'diffEditor.removedTextBackground': '#f8514940',
      'diffEditor.diagonalFill': '#0d1117',
      'diffEditor.border': '#30363d',
      'diffEditor.unchangedRegionBackground': '#161b22',
      'diffEditor.unchangedRegionForeground': '#6e7681',
    },
  });


  monaco.editor.defineTheme('darcula-custom', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: 'bcbec4', background: '1e1f22' },
      { token: 'comment', foreground: '7a7e85', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'cf8e6d' },
      { token: 'string', foreground: '6aab73' },
      { token: 'number', foreground: '2aacb8' },
      { token: 'type', foreground: 'b3ae60' },
      { token: 'identifier', foreground: 'bcbec4' },
      { token: 'delimiter', foreground: 'bcbec4' },
      { token: 'tag', foreground: 'e8bf6a' },
      { token: 'attribute.name', foreground: 'bababa' },
      { token: 'attribute.value', foreground: '6aab73' },
    ],
    colors: {
      'editor.background': '#1e1f22',
      'editor.foreground': '#bcbec4',
      'editorLineNumber.foreground': '#4e5157',
      'editorLineNumber.activeForeground': '#bcbec4',
      'editor.selectionBackground': '#2e436e',
      'editor.lineHighlightBackground': '#26282e',
      'editorCursor.foreground': '#cccccc',
      'editorWhitespace.foreground': '#3b3b3b',
      'editorIndentGuide.background': '#2b2d30',
      'editorIndentGuide.activeBackground': '#43454a',
      'editorGutter.background': '#1e1f22',

      // Diff backgrounds — very subtle so the code reads clearly
      'diffEditor.insertedLineBackground': '#2b4f3a30',
      'diffEditor.insertedTextBackground': '#3e7b4240',
      'diffEditor.removedLineBackground': '#5c2f2f30',
      'diffEditor.removedTextBackground': '#8b3a3a40',

      // No diagonal stripes — flat editor bg where one side has no content
      'diffEditor.diagonalFill': '#1e1f22',

      'diffEditor.border': '#2b2d30',
      'diffEditor.unchangedRegionBackground': '#26282e',
      'diffEditor.unchangedRegionForeground': '#7a7e85',

      'editorOverviewRuler.modifiedForeground': '#57965caa',
      'editorOverviewRuler.addedForeground': '#57965caa',
      'editorOverviewRuler.deletedForeground': '#db5c5c90',
    },
  });
});

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/**
 * Extend Monaco's Java tokenizer so method calls emit a "function" token.
 * Default tokenizer treats `someMethod(` and `someVariable` identically (both
 * are "identifier"), which collapses Dark+'s yellow methods into the variable
 * blue. We add ONE rule that matches lowercase identifier followed by `(` and
 * assigns it the "function" token; everything else stays unchanged.
 */
function patchJavaTokenizer(monaco: typeof import('monaco-editor')) {
  // Same keyword set as Monaco's stock Java tokenizer.
  const keywords = [
    'abstract','continue','for','new','switch','assert','default','goto','package',
    'synchronized','boolean','do','if','private','this','break','double','implements',
    'protected','throw','byte','else','import','public','throws','case','enum',
    'instanceof','return','transient','catch','extends','int','short','try','char',
    'final','interface','static','void','class','finally','long','strictfp','volatile',
    'const','float','native','super','while','true','false','yield','record','sealed',
    'non-sealed','permits',
  ];
  const operators = [
    '=','>','<','!','~','?',':','==','<=','>=','!=','&&','||','++','--','+','-',
    '*','/','&','|','^','%','<<','>>','>>>','+=','-=','*=','/=','&=','|=','^=','%=',
    '<<=','>>=','>>>=',
  ];

  monaco.languages.setMonarchTokensProvider('java', {
    defaultToken: '',
    tokenPostfix: '.java',
    keywords,
    operators,
    symbols: /[=><!~?:&|+\-*/^%]+/,
    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
    digits: /\d+(_+\d+)*/,
    octaldigits: /[0-7]+(_+[0-7]+)*/,
    binarydigits: /[0-1]+(_+[0-1]+)*/,
    hexdigits: /[[0-9a-fA-F]+(_+[0-9a-fA-F]+)*/,
    tokenizer: {
      root: [
        ['non-sealed', 'keyword.non-sealed'],

        // NEW: method calls — lowercase identifier immediately followed by `(`.
        // Keywords still take precedence so `if(` isn't tagged a method.
        [/[a-z_$][\w$]*(?=\s*\()/, {
          cases: { '@keywords': { token: 'keyword.$0' }, '@default': 'function' },
        }],

        // NEW: classes / types — Pascal-case identifier (Java convention).
        [/[A-Z][\w$]*/, 'type.identifier'],

        // Other identifiers + keywords (the original stock rule).
        [/[a-zA-Z_$][\w$]*/, {
          cases: { '@keywords': { token: 'keyword.$0' }, '@default': 'identifier' },
        }],

        { include: '@whitespace' },
        [/[{}()[\]]/, '@brackets'],
        [/[<>](?!@symbols)/, '@brackets'],
        [/@symbols/, { cases: { '@operators': 'delimiter', '@default': '' } }],
        [/@\s*[a-zA-Z_$][\w$]*/, 'annotation'],
        [/(@digits)[eE]([\-+]?(@digits))?[fFdD]?/, 'number.float'],
        [/(@digits)\.(@digits)([eE][\-+]?(@digits))?[fFdD]?/, 'number.float'],
        [/0[xX](@hexdigits)[Ll]?/, 'number.hex'],
        [/0(@octaldigits)[Ll]?/, 'number.octal'],
        [/0[bB](@binarydigits)[Ll]?/, 'number.binary'],
        [/(@digits)[fFdD]/, 'number.float'],
        [/(@digits)[lL]?/, 'number'],
        [/[;,.]/, 'delimiter'],
        [/"([^"\\]|\\.)*$/, 'string.invalid'],
        [/"""/, 'string', '@multistring'],
        [/"/, 'string', '@string'],
        [/'[^\\']'/, 'string'],
        [/(')(@escapes)(')/, ['string', 'string.escape', 'string']],
        [/'/, 'string.invalid'],
      ],
      whitespace: [
        [/[ \t\r\n]+/, ''],
        [/\/\*\*(?!\/)/, 'comment.doc', '@javadoc'],
        [/\/\*/, 'comment', '@comment'],
        [/\/\/.*$/, 'comment'],
      ],
      comment: [
        [/[^/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[/*]/, 'comment'],
      ],
      javadoc: [
        [/[^/*]+/, 'comment.doc'],
        [/\/\*/, 'comment.doc.invalid'],
        [/\*\//, 'comment.doc', '@pop'],
        [/[/*]/, 'comment.doc'],
      ],
      string: [
        [/[^\\"]+/, 'string'],
        [/@escapes/, 'string.escape'],
        [/\\./, 'string.escape.invalid'],
        [/"/, 'string', '@pop'],
      ],
      multistring: [
        [/[^\\"]+/, 'string'],
        [/@escapes/, 'string.escape'],
        [/\\./, 'string.escape.invalid'],
        [/"""/, 'string', '@pop'],
        [/./, 'string'],
      ],
    },
  });
}
