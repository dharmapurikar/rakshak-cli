// Bundled ESLint flat config for rakshak's eslint-security image.
// Enables the security plugin across all JS/TS files. The wrapper appends
// `--format json` for output; project-level overrides still win if the user
// mounts their own config.
import security from "eslint-plugin-security";

export default [
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx,jsx}"],
    plugins: { security },
    rules: {
      ...security.configs.recommended.rules,
    },
  },
];
