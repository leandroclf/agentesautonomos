module.exports = {
  // Basic formatting
  semi: true,
  trailingComma: 'none',
  singleQuote: true,
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  
  // Object and array formatting
  bracketSpacing: true,
  bracketSameLine: false,
  
  // Arrow function parentheses
  arrowParens: 'avoid',
  
  // Quote properties
  quoteProps: 'as-needed',
  
  // JSX (if needed in future)
  jsxSingleQuote: true,
  jsxBracketSameLine: false,
  
  // End of line
  endOfLine: 'lf',
  
  // Embedded language formatting
  embeddedLanguageFormatting: 'auto',
  
  // HTML whitespace sensitivity
  htmlWhitespaceSensitivity: 'css',
  
  // Prose wrap
  proseWrap: 'preserve',
  
  // Vue files
  vueIndentScriptAndStyle: false,
  
  // Override for specific file types
  overrides: [
    {
      files: '*.json',
      options: {
        printWidth: 80,
        tabWidth: 2
      }
    },
    {
      files: '*.md',
      options: {
        printWidth: 80,
        proseWrap: 'always',
        tabWidth: 2
      }
    },
    {
      files: '*.yml',
      options: {
        tabWidth: 2,
        singleQuote: false
      }
    },
    {
      files: '*.yaml',
      options: {
        tabWidth: 2,
        singleQuote: false
      }
    },
    {
      files: ['package.json', 'package-lock.json'],
      options: {
        tabWidth: 2,
        printWidth: 120
      }
    },
    {
      files: '*.config.js',
      options: {
        printWidth: 120
      }
    }
  ]
};