# Resonance Logs 文档

文档已按语言拆分，请在以下目录中选择：

| 语言 | 源码目录 | 说明 |
|------|----------|------|
| 简体中文 | [zh-CN/](./zh-CN/README.md) | 默认文档 |
| English | [en-US/](./en-US/README.md) | English documentation |
| 日本語 | [ja-JP/](./ja-JP/README.md) | 日本語ドキュメント |

## 构建 HTML

```bash
npm run doc:html
```

该命令会将 `{{ui:key}}` 展开为应用内对应语言的菜单文案，并生成 HTML。
输出目录：`doc/html_doc/`。请在浏览器中打开 `doc/html_doc/index.html` 查看完整文档。

### 维护说明

- **图片**：唯一源文件存放在 [shared/img/](./shared/img/)，不要在各语言目录下复制图片。`faq/*.md` 使用 `../../shared/img/...`，`features/*/*.md` 使用 `../../../shared/img/...`。
- **菜单路径**：撰写时可写 `{{ui:routes.tools.dps}}` 等占位符，运行 `npm run doc:html` 时会替换为应用 i18n 文案。

单语言调试：

```bash
node scripts/build-doc-html.cjs --locale=en-US
```
