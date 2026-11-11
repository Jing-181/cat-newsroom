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
      input: {
        main: resolve(process.cwd(), "src/index.html"),
        workoutMetrics: resolve(process.cwd(), "src/preview/workout-metrics.html"),
        // 动作审查页是常驻的，要跟着构建走，不然部署后就没有了。
        // 地址是 /preview/motion.html，跟 dev server 下一致。
        motion: resolve(process.cwd(), "src/preview/motion.html"),
        // 三种画法的横向对照页。
        skins: resolve(process.cwd(), "src/preview/skins.html"),
      },
      output: {
        // 带内容 hash：部署后文件名变化，强制浏览器拉取新样式，规避 GitHub Pages 10 分钟强缓存导致旧样式残留
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
        manualChunks(id) {
          // vue 单独 vendor chunk，业务模块按模块目录独立 chunk
          if (id.includes("node_modules/vue") || id.includes("node_modules/@vue")) return "vue";
          // 共享层（lib/components）打进一个共享 chunk，业务模块 chunk 再引用它
          // 隔离回归入口只加载纯领域/表单模块，不能被 shared 带入 store/auth 副作用。
          if (/\/src\/lib\/(workout-metrics|workout|workout-view|workout-catalog|critters)\.js$/.test(id)) return "metrics-core";
          if (id.includes("/src/lib/") || id.includes("/src/components/")) return "shared";
          if (id.includes("/src/modules/")) return id.split("/src/modules/")[1].split("/")[0];
        },
      },
    },
  },
});
