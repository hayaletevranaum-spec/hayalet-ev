const js = require("@eslint/js");
const tseslint = require("typescript-eslint");

/* global __dirname */

// ============================================================
// SHARED RULE SETS — DRY yapısı
// ============================================================

/**
 * Tüm TS dosyaları için ortak temel kurallar (tip-bağımsız)
 */
const sharedTsBaseRules = {
  // Kullanılmayan değişkenler
  "@typescript-eslint/no-unused-vars": [
    "error",
    {
      argsIgnorePattern: "^(_|e|err|error|evt|event)",
      varsIgnorePattern: "^(_|e|err|error|evt|event)",
      caughtErrorsIgnorePattern: "^(_|e|err|error)",
    },
  ],

  // any yasağı
  "@typescript-eslint/no-explicit-any": "error",
  "@typescript-eslint/no-unsafe-assignment": "error",
  "@typescript-eslint/no-unsafe-member-access": "error",
  "@typescript-eslint/no-unsafe-call": "error",
  "@typescript-eslint/no-unsafe-return": "error",
  "@typescript-eslint/no-unsafe-argument": "error",

  // require yasağı
  "@typescript-eslint/no-require-imports": "error",

  // ts-comment: allow-with-description standardı (tüm bölümler için)
  "@typescript-eslint/ban-ts-comment": [
    "error",
    {
      "ts-expect-error": "allow-with-description",
      "ts-ignore": true,
      "ts-nocheck": true,
      "ts-check": false,
      minimumDescriptionLength: 10,
    },
  ],

  // import type zorunluluğu — top-level type import zorunlu, inline type yasak
  "@typescript-eslint/consistent-type-imports": [
    "error",
    { prefer: "type-imports", fixStyle: "separate-type-imports" },
  ],

  // null assertion yasağı
  "@typescript-eslint/no-non-null-assertion": "error",

  // nullish coalescing ve optional chain tercihi
  "@typescript-eslint/prefer-nullish-coalescing": "error",
  "@typescript-eslint/prefer-optional-chain": "error",

  // strict boolean — tüm bölümlerde açık parametrelerle standardize
  // allowNullableObject: true — DOM API'leri ve cheerio nullable object döndürebilir, false positive engeli
  "@typescript-eslint/strict-boolean-expressions": [
    "error",
    {
      allowString: false,
      allowNumber: false,
      allowNullableObject: true,
      allowNullableBoolean: false,
      allowNullableString: false,
      allowNullableNumber: false,
      allowAny: false,
    },
  ],

  // Tip güvenliği
  "@typescript-eslint/no-unnecessary-type-assertion": "error",
  "@typescript-eslint/no-unnecessary-condition": "error",
  "@typescript-eslint/no-unnecessary-type-parameters": "error",

  // Genel kurallar
  "no-unused-vars": "off", // TS versiyonu kullanılıyor
  "no-empty": ["error", { allowEmptyCatch: true }],
  // Proje geneli: error + allow list (tüm bölümler için standart)
  "no-console": ["error", { allow: ["warn", "error", "info"] }],
  "prefer-const": "error",
  "no-undef": "off", // TypeScript hallediyor
  "no-await-in-loop": "error",
};

/**
 * Tüm TS dosyaları için tip-bağımlı (type-aware) kurallar
 */
const sharedTypeAwareRules = {
  // Promise güvenliği
  "@typescript-eslint/no-floating-promises": "error",
  "@typescript-eslint/no-misused-promises": "error",
  "@typescript-eslint/await-thenable": "error",
  "@typescript-eslint/require-await": "error",
  "@typescript-eslint/promise-function-async": "error",
  "@typescript-eslint/return-await": ["error", "always"],
  "@typescript-eslint/prefer-promise-reject-errors": "error",

  // Throw güvenliği
  "@typescript-eslint/only-throw-error": "error",

  // Template expression güvenliği
  "@typescript-eslint/restrict-template-expressions": [
    "error",
    {
      allowNumber: true,
      allowBoolean: false,
      allowAny: false,
      allowNullish: false,
      allowRegExp: false,
    },
  ],

  // Diğer tip güvenliği
  "@typescript-eslint/no-base-to-string": "error",
  "@typescript-eslint/switch-exhaustiveness-check": "error",
  "@typescript-eslint/no-confusing-void-expression": "error",
  "@typescript-eslint/no-redundant-type-constituents": "error",
  "@typescript-eslint/no-duplicate-enum-values": "error",
  "@typescript-eslint/no-invalid-void-type": "error",
  "@typescript-eslint/no-meaningless-void-operator": "error",
  "@typescript-eslint/consistent-return": "error",
};

/**
 * Explicit return type zorunluluğu (AI-safety)
 */
const explicitReturnTypeRule = {
  "@typescript-eslint/explicit-function-return-type": [
    "error",
    {
      allowExpressions: false,
      allowTypedFunctionExpressions: true,
      allowHigherOrderFunctions: true,
      allowDirectConstAssertionInArrowFunctions: true,
      allowConciseArrowFunctionExpressionsStartingWithVoid: false,
    },
  ],
};

/**
 * Naming convention (AI-safety)
 */
const namingConventionRule = {
  "@typescript-eslint/naming-convention": [
    "error",
    {
      selector: "variable",
      format: ["camelCase", "UPPER_CASE"],
      leadingUnderscore: "allow",
      trailingUnderscore: "forbid",
    },
    {
      selector: "function",
      format: ["camelCase"],
      leadingUnderscore: "allow",
    },
    {
      selector: "typeLike",
      format: ["PascalCase"],
    },
  ],
};

/**
 * Import cycle prevention (AI-safety)
 */
const importCycleRules = {
  // import/no-cycle ve import/no-self-import: dependency-cruiser (.dependency-cruiser.cjs)
  // ile proje genelinde zaten kontrol ediliyor, harici plugin gerektirmez
};

// NOTE: Room TypeScript — strict contract aligned with main app.
// Room-specific escape hatches below remain explicit `off` overrides.
const roomTsContractRules = {
  ...sharedTsBaseRules,
  ...sharedTypeAwareRules,
  ...namingConventionRule,
  ...importCycleRules,
  "@typescript-eslint/no-explicit-any": "error",
  "@typescript-eslint/no-unsafe-assignment": "error",
  "@typescript-eslint/no-unsafe-member-access": "error",
  "@typescript-eslint/no-unsafe-call": "error",
  "@typescript-eslint/no-unsafe-return": "error",
  "@typescript-eslint/no-unsafe-argument": "error",
  "@typescript-eslint/no-unnecessary-type-assertion": "error",
  "@typescript-eslint/no-unnecessary-condition": "error",
  "@typescript-eslint/prefer-nullish-coalescing": "off",
  "@typescript-eslint/prefer-optional-chain": "off",
  "@typescript-eslint/strict-boolean-expressions": "off",
  "@typescript-eslint/explicit-function-return-type": "off",
  "@typescript-eslint/require-await": "off",
  "@typescript-eslint/promise-function-async": "off",
  "@typescript-eslint/return-await": "off",
  "@typescript-eslint/no-confusing-void-expression": "off",
  "@typescript-eslint/no-base-to-string": "off",
  // Enable once factory `deps` params are explicitly typed (Parameters<> stops collapsing to `any`).
  "@typescript-eslint/no-redundant-type-constituents": "off",
  "@typescript-eslint/naming-convention": "off",
  "@typescript-eslint/restrict-template-expressions": "off",
  "prefer-rest-params": "off",
  "prefer-spread": "off",
};

/**
 * Path system kuralları (process.cwd() ve hardcoded path yasağı)
 */
function makePathRules(message_cwd, message_path) {
  return {
    "no-restricted-syntax": [
      "error",
      {
        selector: "CallExpression[callee.property.name='cwd'][callee.object.name='process']",
        message: message_cwd,
      },
      {
        selector: "CallExpression > Literal[value=/[.][.][/][.][.][/]/]",
        message: message_path,
      },
    ],
  };
}

// ============================================================
// ESLint CONFIG
// ============================================================

module.exports = tseslint.config(
  // === Global Linter Options ===
  {
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
  },

  // === Global Ignores ===
  {
    ignores: [
      "node_modules/**",
      "node_modules/.cache/**",
      "dist/**",
      "build/**",
      "logs/**",
      "commands/**",
      "data/**",
      "config/**",
      "tmp/**",
      "temp/**",
      "screenshots/**",
      ".vite/**",
      "protocol/**",
      "rooms/.build/**",
      "rooms/**/shared/vendor/**",
      "**/*.min.js",
      "*.min.js",
      "*.tsbuildinfo",
      "package-lock.json",
    ],
  },

  // === Base JS Config ===
  js.configs.recommended,

  // === Node Utility Scripts ===
  {
    files: ["scripts/**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        AbortSignal: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        clearImmediate: "readonly",
        clearInterval: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        fetch: "readonly",
        global: "readonly",
        process: "readonly",
        setImmediate: "readonly",
        setInterval: "readonly",
        setTimeout: "readonly",
      },
    },
    rules: {
      "no-console": ["error", { allow: ["log", "warn", "error", "info"] }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-undef": "error",
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^(_|e|err|error|evt|event)",
          caughtErrorsIgnorePattern: "^(_|e|err|error)",
          varsIgnorePattern: "^(_|e|err|error|evt|event)",
        },
      ],
      "prefer-const": "error",
    },
  },

  // === TypeScript Utility Scripts ===
  {
    files: ["scripts/**/*.ts"],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        project: "./scripts/tsconfig.json",
        tsconfigRootDir: __dirname,
      },
      globals: {
        AbortController: "readonly",
        AbortSignal: "readonly",
        Buffer: "readonly",
        console: "readonly",
        process: "readonly",
        setImmediate: "readonly",
        setInterval: "readonly",
        setTimeout: "readonly",
        clearImmediate: "readonly",
        clearInterval: "readonly",
        clearTimeout: "readonly",
      },
    },
    rules: {
      ...sharedTsBaseRules,
      ...sharedTypeAwareRules,
    },
  },

  // === JavaScript Config (Renderer - src/js) - NO TYPE-AWARE RULES ===
  {
    files: ["src/js/**/*.js"],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        fetch: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        btoa: "readonly",
        atob: "readonly",
        FileReader: "readonly",
        Blob: "readonly",
        File: "readonly",
        FormData: "readonly",
        MutationObserver: "readonly",
        ResizeObserver: "readonly",
        IntersectionObserver: "readonly",
        CustomEvent: "readonly",
        Event: "readonly",
        EventTarget: "readonly",
        HTMLElement: "readonly",
        Element: "readonly",
        Node: "readonly",
        NodeList: "readonly",
        DOMParser: "readonly",
        XMLSerializer: "readonly",
        Image: "readonly",
        Audio: "readonly",
        MediaRecorder: "readonly",
        AudioContext: "readonly",
        WebSocket: "readonly",
        AbortController: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        alert: "readonly",
        confirm: "readonly",
        prompt: "readonly",
        Option: "readonly",
        BroadcastChannel: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        requestIdleCallback: "readonly",
        cancelIdleCallback: "readonly",
        getComputedStyle: "readonly",
        performance: "readonly",
        crypto: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        Headers: "readonly",
        Request: "readonly",
        Response: "readonly",
      },
    },
    rules: {
      // Tip-bağımsız kuralların JS'e uygun alt kümesi
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^(_|e|err|error|evt|event)",
          varsIgnorePattern: "^(_|e|err|error|evt|event)",
          caughtErrorsIgnorePattern: "^(_|e|err|error)",
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-require-imports": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-expect-error": "allow-with-description",
          "ts-ignore": true,
          "ts-nocheck": true,
          "ts-check": false,
          minimumDescriptionLength: 10,
        },
      ],
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-non-null-assertion": "error",
      ...namingConventionRule,

      "no-unused-vars": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-console": ["error", { allow: ["warn", "error", "info"] }],
      "prefer-const": "error",
      "no-undef": "off",
      "no-await-in-loop": "error",
    },
  },

  // === Room UI JavaScript Files ===
  {
    files: [
      "rooms/**/ui/**/*.js",
      "rooms/**/main-functions/**/ui/**/*.js",
      "rooms/**/shared/ui/**/*.js",
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        fetch: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        HTMLElement: "readonly",
        Element: "readonly",
        Node: "readonly",
        NodeList: "readonly",
        CustomEvent: "readonly",
        Event: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        getComputedStyle: "readonly",
        performance: "readonly",
        crypto: "readonly",
      },
    },
    rules: {
      "no-unused-vars": "off",
      "no-redeclare": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-console": ["error", { allow: ["warn", "error", "info"] }],
      "prefer-const": "error",
      "no-undef": "off",
      "no-await-in-loop": "error",
    },
  },

  // === Room Host + Shared JavaScript Files ===
  {
    files: [
      "rooms/**/host/**/*.js",
      "rooms/**/shared/host/**/*.js",
      "rooms/**/shared/types/**/*.js",
      "rooms/**/main-functions/**/host/**/*.js",
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        clearImmediate: "readonly",
        setImmediate: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        AbortController: "readonly",
        fetch: "readonly",
      },
    },
    rules: {
      "no-unused-vars": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-console": ["error", { allow: ["warn", "error", "info"] }],
      "prefer-const": "error",
      "no-undef": "off",
      "no-await-in-loop": "error",
    },
  },

  // === Room TypeScript Files ===
  {
    files: [
      "rooms/**/ui/**/*.ts",
      "rooms/**/shared/ui/**/*.ts",
      "rooms/**/host/**/*.ts",
      "rooms/laboratory/services/forensic-signature-mapper.ts",
      "rooms/laboratory/services/report-builder.ts",
      "rooms/**/shared/host/**/*.ts",
      "rooms/**/shared/types/**/*.ts",
      "rooms/**/main-functions/**/ui/**/*.ts",
      "rooms/**/main-functions/**/host/**/*.ts",
    ],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        project: "./rooms/tsconfig.rooms.json",
        tsconfigRootDir: __dirname,
      },
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        global: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setImmediate: "readonly",
        clearImmediate: "readonly",
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        fetch: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        btoa: "readonly",
        atob: "readonly",
        FileReader: "readonly",
        Blob: "readonly",
        File: "readonly",
        FormData: "readonly",
        MutationObserver: "readonly",
        ResizeObserver: "readonly",
        IntersectionObserver: "readonly",
        CustomEvent: "readonly",
        Event: "readonly",
        EventTarget: "readonly",
        HTMLElement: "readonly",
        Element: "readonly",
        Node: "readonly",
        NodeList: "readonly",
        DOMParser: "readonly",
        XMLSerializer: "readonly",
        Image: "readonly",
        Audio: "readonly",
        MediaRecorder: "readonly",
        AudioContext: "readonly",
        WebSocket: "readonly",
        AbortController: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        alert: "readonly",
        confirm: "readonly",
        prompt: "readonly",
        Option: "readonly",
        BroadcastChannel: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        requestIdleCallback: "readonly",
        cancelIdleCallback: "readonly",
        getComputedStyle: "readonly",
        performance: "readonly",
        crypto: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        Headers: "readonly",
        Request: "readonly",
        Response: "readonly",
      },
    },
    rules: {
      ...roomTsContractRules,
    },
  },

  // === Room Host TypeScript Files - strict host boundary ===
  {
    files: [
      "rooms/**/host/**/*.ts",
      "rooms/**/shared/host/**/*.ts",
      "rooms/**/main-functions/**/host/**/*.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
    },
  },

  // === Room Shared TypeScript Type Files - strict type boundary ===
  {
    files: ["rooms/**/shared/types/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
    },
  },

  // === Room UI TypeScript Files - strict UI boundary ===
  {
    files: [
      "rooms/**/ui/**/*.ts",
      "rooms/**/shared/ui/**/*.ts",
      "rooms/**/main-functions/**/ui/**/*.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
    },
  },

  // === Room Type Declaration Files ===
  {
    files: ["rooms/**/*.d.ts"],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        project: "./rooms/tsconfig.rooms.json",
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-require-imports": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "no-undef": "off",
    },
  },

  // === TypeScript Regression Tests (scripts/tests) ===
  // Test files use mocks that need `async` without `await` and assertions with `!`.
  {
    files: ["scripts/tests/**/*.test.ts", "scripts/tests/**/*.helpers.ts"],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        project: "./scripts/tsconfig.json",
        tsconfigRootDir: __dirname,
      },
      globals: {
        Buffer: "readonly",
        console: "readonly",
        process: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setImmediate: "readonly",
        clearImmediate: "readonly",
        assert: "readonly",
        test: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^(_|e|err|error|evt|event)",
          varsIgnorePattern: "^(_|e|err|error|evt|event)",
          caughtErrorsIgnorePattern: "^(_|e|err|error)",
        },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-require-imports": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/promise-function-async": "off",
      "@typescript-eslint/await-thenable": "off",
      "@typescript-eslint/return-await": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unnecessary-type-parameters": "off",
      "@typescript-eslint/strict-boolean-expressions": "off",
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "@typescript-eslint/prefer-optional-chain": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/no-base-to-string": "off",
      "no-unused-vars": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-console": ["error", { allow: ["warn", "error", "info"] }],
      "no-undef": "off",
      "no-await-in-loop": "off",
    },
  },

  // === TypeScript Config (Renderer - src/js) - WITH TYPE-AWARE RULES ===
  {
    files: ["src/js/**/*.ts"],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        project: "./src/tsconfig.json",
        tsconfigRootDir: __dirname,
      },
      globals: {
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        fetch: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        btoa: "readonly",
        atob: "readonly",
        FileReader: "readonly",
        Blob: "readonly",
        File: "readonly",
        FormData: "readonly",
        MutationObserver: "readonly",
        ResizeObserver: "readonly",
        IntersectionObserver: "readonly",
        CustomEvent: "readonly",
        Event: "readonly",
        EventTarget: "readonly",
        HTMLElement: "readonly",
        Element: "readonly",
        Node: "readonly",
        NodeList: "readonly",
        DOMParser: "readonly",
        XMLSerializer: "readonly",
        Image: "readonly",
        Audio: "readonly",
        MediaRecorder: "readonly",
        AudioContext: "readonly",
        WebSocket: "readonly",
        AbortController: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        alert: "readonly",
        confirm: "readonly",
        prompt: "readonly",
        Option: "readonly",
        BroadcastChannel: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        requestIdleCallback: "readonly",
        cancelIdleCallback: "readonly",
        getComputedStyle: "readonly",
        performance: "readonly",
        crypto: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        Headers: "readonly",
        Request: "readonly",
        Response: "readonly",
      },
    },
    rules: {
      ...sharedTsBaseRules,
      ...sharedTypeAwareRules,
      ...explicitReturnTypeRule,
      ...namingConventionRule,
      ...importCycleRules,
    },
  },

  // === Electron Main Process Config (JS files) ===
  {
    files: ["electron/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setImmediate: "readonly",
        clearImmediate: "readonly",
        require: "readonly",
        module: "readonly",
        exports: "readonly",
        global: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        AbortController: "readonly",
        AbortSignal: "readonly",
        fetch: "readonly",
        FormData: "readonly",
        Blob: "readonly",
        File: "readonly",
        Headers: "readonly",
        Request: "readonly",
        Response: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        crypto: "readonly",
        performance: "readonly",
      },
    },
    rules: {
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^(_|e|err|error|evt|event)",
          varsIgnorePattern: "^(_|e|err|error|evt|event)",
          caughtErrorsIgnorePattern: "^(_|e|err|error)",
        },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-console": ["error", { allow: ["warn", "error", "info"] }],
      "prefer-const": "error",
      "no-undef": "error",
      "no-await-in-loop": "error",
    },
  },

  // === Electron Preload + Webview Preload (renderer context with Node access) ===
  // Not: webview-preload.cjs bu blok tarafından da kapsanıyor (geniş globals listesi içeriyor)
  {
    files: ["electron/preload.cjs", "electron/webview-preload.cjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        Buffer: "readonly",
        require: "readonly",
        module: "readonly",
        exports: "readonly",
        window: "readonly",
        document: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        navigator: "readonly",
        location: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        fetch: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        Blob: "readonly",
        File: "readonly",
        FileReader: "readonly",
        FormData: "readonly",
        AbortController: "readonly",
        AbortSignal: "readonly",
        Event: "readonly",
        CustomEvent: "readonly",
        HTMLElement: "readonly",
        Element: "readonly",
        Node: "readonly",
        NodeList: "readonly",
        MutationObserver: "readonly",
        getComputedStyle: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        XMLHttpRequest: "readonly",
        performance: "readonly",
        crypto: "readonly",
        atob: "readonly",
        btoa: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        DataTransfer: "readonly",
        DragEvent: "readonly",
        ClipboardEvent: "readonly",
        KeyboardEvent: "readonly",
        MouseEvent: "readonly",
        InputEvent: "readonly",
      },
    },
    rules: {
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^(_|e|err|error|evt|event)",
          varsIgnorePattern: "^(_|e|err|error|evt|event)",
          caughtErrorsIgnorePattern: "^(_|e|err|error)",
        },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-console": ["error", { allow: ["warn", "error", "info"] }],
      "prefer-const": "error",
      "no-undef": "error",
    },
  },

  // === Electron TypeScript Files ===
  {
    files: ["electron/**/*.ts"],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        project: "./electron/tsconfig.electron.json",
        tsconfigRootDir: __dirname,
      },
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        URL: "readonly",
        fetch: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
      },
    },
    rules: {
      ...sharedTsBaseRules,
      ...sharedTypeAwareRules,
      ...explicitReturnTypeRule,
      ...namingConventionRule,
      ...importCycleRules,
      ...makePathRules(
        "process.cwd() is banned. Use Paths.getProjectRoot() from electron/paths.ts instead.",
        "Hardcoded relative paths (../) are banned. Use Paths from electron/paths.ts instead."
      ),
    },
  },

  // === MCP Server TypeScript Files ===
  {
    files: ["mcp-server/**/*.ts"],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        project: "./mcp-server/tsconfig.mcp.json",
        tsconfigRootDir: __dirname,
      },
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        URL: "readonly",
        fetch: "readonly",
      },
    },
    rules: {
      ...sharedTsBaseRules,
      ...sharedTypeAwareRules,
      ...explicitReturnTypeRule,
      ...namingConventionRule,
      ...importCycleRules,
      "prefer-const": "error",
      ...makePathRules(
        "process.cwd() is banned in MCP server. Use PROJECT_ROOT from utils/project-root.ts instead.",
        "Hardcoded relative paths (../) are banned. Use PROJECT_ROOT from utils/project-root.ts instead."
      ),
    },
  },

  // === Ghost-Agent Renderer TypeScript Files ===
  {
    files: ["ghost-agent/src/**/*.ts"],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        project: "./ghost-agent/tsconfig.json",
        tsconfigRootDir: __dirname,
      },
      globals: {
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        fetch: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        btoa: "readonly",
        atob: "readonly",
        FileReader: "readonly",
        Blob: "readonly",
        File: "readonly",
        FormData: "readonly",
        MutationObserver: "readonly",
        ResizeObserver: "readonly",
        IntersectionObserver: "readonly",
        CustomEvent: "readonly",
        Event: "readonly",
        EventTarget: "readonly",
        HTMLElement: "readonly",
        Element: "readonly",
        Node: "readonly",
        NodeList: "readonly",
        DOMParser: "readonly",
        XMLSerializer: "readonly",
        Image: "readonly",
        Audio: "readonly",
        MediaRecorder: "readonly",
        AudioContext: "readonly",
        WebSocket: "readonly",
        AbortController: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        alert: "readonly",
        confirm: "readonly",
        prompt: "readonly",
        Option: "readonly",
        BroadcastChannel: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        requestIdleCallback: "readonly",
        cancelIdleCallback: "readonly",
        getComputedStyle: "readonly",
        performance: "readonly",
        crypto: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        Headers: "readonly",
        Request: "readonly",
        Response: "readonly",
      },
    },
    rules: {
      ...sharedTsBaseRules,
      ...sharedTypeAwareRules,
      ...explicitReturnTypeRule,
      ...namingConventionRule,
      ...importCycleRules,
    },
  },

  // === Ghost-Agent Electron TypeScript Files ===
  {
    files: ["ghost-agent/electron/**/*.ts"],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        project: "./ghost-agent/tsconfig.electron.json",
        tsconfigRootDir: __dirname,
      },
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        URL: "readonly",
        fetch: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
      },
    },
    rules: {
      ...sharedTsBaseRules,
      ...sharedTypeAwareRules,
      ...explicitReturnTypeRule,
      ...namingConventionRule,
      ...importCycleRules,
    },
  },

  // === Ghost-Agent Preload (renderer context with Node access) ===
  {
    files: ["ghost-agent/electron/preload.cjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        Buffer: "readonly",
        require: "readonly",
        module: "readonly",
        exports: "readonly",
        window: "readonly",
        document: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        navigator: "readonly",
        location: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        fetch: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        Blob: "readonly",
        File: "readonly",
        FileReader: "readonly",
        FormData: "readonly",
        AbortController: "readonly",
        AbortSignal: "readonly",
        Event: "readonly",
        CustomEvent: "readonly",
        HTMLElement: "readonly",
        Element: "readonly",
        Node: "readonly",
        NodeList: "readonly",
        MutationObserver: "readonly",
        getComputedStyle: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        performance: "readonly",
        crypto: "readonly",
        atob: "readonly",
        btoa: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
      },
    },
    rules: {
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^(_|e|err|error|evt|event)",
          varsIgnorePattern: "^(_|e|err|error|evt|event)",
          caughtErrorsIgnorePattern: "^(_|e|err|error)",
        },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-console": ["error", { allow: ["warn", "error", "info"] }],
      "prefer-const": "error",
      "no-undef": "error",
    },
  },

  // === Shared Type Definitions (src/types) ===
  // Not: Bu dosyalar src/tsconfig.json, electron/tsconfig.electron.json ve mcp-server/tsconfig.mcp.json'a dahil.
  // Type-aware lint kurallarının bu dosyalarda da çalışması için açıkça tanımlanmalı.
  {
    files: ["src/types/**/*.ts"],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        project: "./src/tsconfig.json", // base config — tüm tsconfig'lere dahil
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      ...sharedTsBaseRules,
      ...sharedTypeAwareRules,
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "prefer-const": "error",
    },
  }
);
