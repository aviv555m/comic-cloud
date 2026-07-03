const fs = require('fs');
let code = fs.readFileSync('vite.config.ts', 'utf8');

// 1. Move the proxy object to a constant
const proxyStart = code.indexOf('proxy: {');
const proxyEndStr = '        }\n      }\n    }\n  },\n  plugins: [';
const proxyEnd = code.indexOf(proxyEndStr);

const proxyCode = code.substring(proxyStart + 7, proxyEnd + 21); // Include up to '    }'
// Let's just use string replacement carefully.

let newCode = code.replace(
\`  server: {
    host: "::",
    port: 8081,
    allowedHosts: ["cc.displayname.top"],
    proxy: {\`,
\`const proxyConfig = {\`
);

newCode = newCode.replace(
\`        }
      }
    }
  },
  plugins: [\`,
\`        }
      }
    }
};

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8081,
    allowedHosts: ["cc.displayname.top"],
    proxy: proxyConfig
  },
  preview: {
    host: "::",
    port: 8081,
    allowedHosts: ["cc.displayname.top"],
    proxy: proxyConfig
  },
  plugins: [\`
);

newCode = newCode.replace(
\`    {
      name: "image-proxy-middleware",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {\`,
\`    {
      name: "image-proxy-middleware",
      configureServer(server) {
        setupMiddlewares(server.middlewares);
      },
      configurePreviewServer(server) {
        setupMiddlewares(server.middlewares);
      }
    }
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      react: path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
      "react/jsx-runtime": path.resolve(__dirname, "./node_modules/react/jsx-runtime.js"),
      "react/jsx-dev-runtime": path.resolve(__dirname, "./node_modules/react/jsx-dev-runtime.js"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "three", "@react-three/fiber", "@react-three/drei"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "@tanstack/react-query", "three", "@react-three/fiber", "@react-three/drei"],
  },
}));

const setupMiddlewares = (middlewares: any) => {
  middlewares.use((req: any, res: any, next: any) => {\`
);

// Remove the end of the configureServer block
newCode = newCode.replace(
\`          } else {
            next();
          }
        });
      }
    }
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      react: path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
      "react/jsx-runtime": path.resolve(__dirname, "./node_modules/react/jsx-runtime.js"),
      "react/jsx-dev-runtime": path.resolve(__dirname, "./node_modules/react/jsx-dev-runtime.js"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "three", "@react-three/fiber", "@react-three/drei"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "@tanstack/react-query", "three", "@react-three/fiber", "@react-three/drei"],
  },
}));\`,
\`          } else {
            next();
          }
        });
};\`
);

fs.writeFileSync('vite.config.ts', newCode);
