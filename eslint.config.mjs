import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: {
      // Allow BOTH browser and Node.js globals
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    // Your backend JS files use CommonJS
    files: ["**/*.js"],
    languageOptions: { sourceType: "commonjs" },
  },
]);
