{
  "compilerOptions": {
    /* Configurações do Projeto */
    "target": "ES2020",
    "lib": ["ES2020", "DOM"],
    "module": "commonjs",
    "rootDir": "./src",
    "outDir": "./dist",
    "typeRoots": ["./src/types", "./node_modules/@types"],

    /* Configurações de Módulos */
    "moduleResolution": "node",
    "esModuleInterop": true,

    /* Configurações de Qualidade de Código */
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true
  },
  "include": [
    "src/**/*"
  ],
  "exclude": [
    "node_modules",
    "**/*.test.ts"
  ]
}