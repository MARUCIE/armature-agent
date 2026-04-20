# orca-cli 深度 Code Review 与修复报告

## 范围

审查对象：`@orca-pt/cli` / `Orcapt/orca-cli`。当前环境没有用户提供的可写仓库副本，因此本次工作基于公开仓库信息与 npm 包源码 `@orca-pt/cli@1.0.3` 完成。产物包含可应用补丁、修复后源码包、可本地安装测试的 npm tarball。

## 结论

原始版本不是“可放心发布”的 CLI 质量。核心问题不是功能数量，而是基础工程可靠性不足：CLI 启动路径脆弱、测试脚本恒失败、API 请求实现重复且存在查询参数丢失、凭证文件权限过宽、Docker 操作存在 shell 拼接风险、端口处理会误杀用户进程、部署参数缺少校验、文档与命令提示不一致。

本次补丁将项目从“能跑一部分命令”提升到“基础命令稳定、失败可解释、敏感信息不裸露、核心输入可校验、发布包可测试”的状态。

## 修复摘要

### 1. CLI 启动与打包

- `bin/orca.js` 从 eager require 改为 lazy command loader。
- 修复某个深层命令依赖异常时 `orca --help`、`orca status` 也崩溃的问题。
- 新增 `src/index.js`，修复 `package.json` 声明了 `main: src/index.js` 但文件缺失的问题。
- `package.json` 的 `test` 从恒失败脚本改为真实 smoke test。
- Node engine 从 `>=14` 提升到 `>=16`，与 commander 11 和现代依赖的实际支持边界更一致。
- 文档中主命令统一为 `orca`，保留 `orcapt` 作为 fallback alias。

### 2. API 请求层

新增 `src/utils/api.js`：

- 统一 JSON API 请求。
- 修复原实现中 `path: url.pathname` 导致 query string 被丢弃的问题。
- 支持请求超时，默认 `30000ms`，可用 `ORCA_HTTP_TIMEOUT_MS` 覆盖。
- 兼容空响应体，不再对空 body 直接 `JSON.parse` 崩溃。
- JSON 解析失败时带前 500 字符响应摘要，便于排查。
- 保留两套现有鉴权头风格：`tenantToken` 与 `legacyWorkspaceToken`。

### 3. 安全与凭证

- `~/.orcapt` 目录权限设为 `0700`。
- `~/.orcapt/config.json` 和 UI config 权限设为 `0600`。
- `isLoggedIn()` 不再只信任 `authenticated: true`，现在必须同时具备 workspace、tenant、token。
- DB 连接串、密码、环境变量中的 token/password/secret/api key 等敏感值默认脱敏展示。
- Docker login 改用 `docker login --password-stdin`，不再通过 `echo password | ...` shell 拼接泄露或注入。
- Docker image inspect、tag、push 等调用从 shell `exec` 改为参数化 `execFile`/`spawn`。
- 删除通用 shell `exec` 用法，降低命令注入面。

### 4. 端口与进程体验

- `parsePort()` 统一校验端口范围 `1..65535`。
- `waitForPort()`、`isPortInUse()`、`killPort()` 均做端口合法性校验。
- `ensurePortAvailable()` 默认不再自动 kill 占用端口的未知进程，只给出明确错误；只有显式 `killExisting: true` 才会终止。
- Python/Node kickstart 启动后不再用固定 sleep 假装成功，改为等待实际端口 ready。

### 5. Storage 命令

- bucket delete 的 `--force` 查询参数不再丢失。
- file list 的 `--page`、`--per-page`、`--folder` 查询参数不再丢失。
- bucket/file 路径参数统一 `encodeURIComponent`。
- multipart 上传增加超时。
- 上传文件名做 multipart header 转义，避免特殊字符破坏请求体。
- bucket info/delete 使用配置中的 endpoint，而不是硬编码重复路径。

### 6. Lambda 命令

- `--memory` 校验范围：`128..10240`。
- `--timeout` 校验范围：`1..900`。
- `--env` 和 `--env-file` 严格按 `KEY=value` 解析，非法 key 直接报错。
- deploy/info 输出环境变量时自动脱敏。
- logs 的 `--page`、`--per-page` 做整数校验。
- 修正错误提示：移除不存在的 `lambda update` 提示，将 `orcapt whoami` 改为 `orca status`。

### 7. EC2 ship 命令

- `--internal-port` 做合法端口校验。
- logs 分页参数校验。
- env 解析与 Lambda 统一。
- deployment id 路径参数编码，query string 使用统一 helper。

### 8. Kickstart 与 UI

- `simple-git` 从顶层 require 改为 clone 时懒加载，避免 help/status 被 starter 项目依赖影响。
- Python/Node kickstart 统一校验 `--port`、`--agent-port`。
- 目录存在性检查不再吞掉权限错误、prompt 错误或删除失败错误。
- UI 启动命令统一为 `npx -y @orcapt/ui orca --port=... --agent-port=...`。
- UI config 文件权限收紧为 `0600`。

### 9. 测试

新增 `test/smoke.test.js`：

- 对 `src/**/*.js` 与 `bin/orca.js` 执行 `node --check`。
- 用临时 HOME 运行 `node bin/orca.js --help`，保证未登录状态也不会崩。
- 验证 public module entry `require('./src')` 可用。
- 验证 `parsePort()` 基础行为。

## 已验证命令

```bash
npm test
# orca-cli smoke tests passed

HOME=$(mktemp -d) node bin/orca.js --help
# exited 0

HOME=$(mktemp -d) node bin/orca.js status
# exited 0, prints unauthenticated guidance

node - <<'NODE'
const modules = [
 './src/commands/agents', './src/commands/db', './src/commands/fetch-doc',
 './src/commands/kickstart-node', './src/commands/kickstart-python',
 './src/commands/lambda', './src/commands/login', './src/commands/ship-ec2',
 './src/commands/storage', './src/commands/ui', './src/utils/api',
 './src/utils/cli', './src/utils/docker-helper', './src/utils/index',
 './src/config', './src'
];
for (const modulePath of modules) require(modulePath);
console.log('all modules require successfully');
NODE
# all modules require successfully
```

## Patch 规模

- 变更文件：20 个。
- Patch 行数：2510 行。
- 新增核心文件：
  - `src/utils/api.js`
  - `src/utils/cli.js`
  - `src/index.js`
  - `test/smoke.test.js`

## 未验证项与剩余风险

以下项目需要真实 Orca 后端、有效 workspace token、Docker registry 凭证或外网 starter repo 才能完成端到端验证；当前环境没有这些凭据：

- 登录后的真实 API 权限流。
- Lambda 实际 deploy/invoke/logs/remove。
- EC2/Hetzner runner 实际部署。
- Storage bucket/file 真实上传下载。
- Kickstart starter repo clone 后完整运行。
- Docker push 到真实 registry。

这些不是代码审查发现的阻断项，而是集成测试环境缺失导致的验证边界。

## 建议的下一步发布门槛

在合并该补丁前，至少补齐以下 CI：

```bash
npm ci
npm test
node bin/orca.js --help
node bin/orca.js status
node bin/orca.js ship ec2 deploy --help
node bin/orca.js ship lambda --help
```

再增加一套需要后端凭证的 nightly integration test，覆盖 storage、lambda、ec2、agents 四组真实 API。
