import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";

export default defineConfig({
  root: "src",
  base: "./", // 相对路径，支持 GitHub Pages 子路径部署，访问地址保持不变
  plugins: [vue()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    minify: "esbuild", // 压缩混淆
    sourcemap: false,
    rollupOptions: {
      input: { main: resolve(process.cwd(), "src/index.html") },
      output: {
        // 带内容 hash：部署后文件名变化，强制浏览器拉取新样式，规避 GitHub Pages 10 分钟强缓存导致旧样式残留
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
        manualChunks(id) {
          // vue 单独 vendor chunk，业务模块按模块目录独立 chunk
          if (id.includes("node_modules/vue") || id.includes("node_modules/@vue")) return "vue";
          // 共享层（lib/components）打进一个共享 chunk，业务模块 chunk 再引用它
          if (id.includes("/src/lib/") || id.includes("/src/components/")) return "shared";
          if (id.includes("/src/modules/")) return id.split("/src/modules/")[1].split("/")[0];
        },
      },
    },
  },
});
