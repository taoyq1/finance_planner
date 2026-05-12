# 资产配置管理器

这是一个本地静态 Web 应用，用来管理人民币资产配置。

## 打开方式

直接用浏览器打开 `index.html` 即可：

```text
D:\desktop\workspace\finance-planner\index.html
```

数据保存在当前浏览器的 `localStorage` 中，不会上传到服务器。换浏览器或清理浏览器数据前，请先在页面右上角导出 JSON 备份。

## 随时随地使用

要在手机上随时访问，建议把这个目录部署到支持 HTTPS 的静态网站服务，例如 GitHub Pages、Cloudflare Pages、Netlify 或 Vercel。

部署后，用手机浏览器打开网址，可以通过“添加到主屏幕”安装成类似 App 的入口。当前版本是本地优先应用，数据仍保存在手机浏览器中；如果需要多设备自动同步，需要再接入登录和云数据库。

## 隐私云同步

当前版本已支持 Supabase 云同步。隐私设计如下：

- 登录邮箱和登录密码会交给 Supabase 做身份验证。
- 资产数据、持仓、历史记录、图表快照会先在浏览器本地加密。
- 云数据库只保存密文、盐值、初始化向量和更新时间。
- “同步加密密码”不会上传，也不会保存在云端。
- 如果忘记同步加密密码，云端密文无法恢复，只能用本地数据或 JSON 备份重新上传。

浏览器加密使用 `PBKDF2-SHA-256` 派生密钥，`AES-GCM-256` 加密数据。请使用和登录密码不同的高强度同步加密密码。

### Supabase 建表 SQL

在 Supabase SQL Editor 执行：

```sql
create table if not exists public.portfolio_vaults (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_payload jsonb not null,
  client_updated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.portfolio_vaults enable row level security;

create policy "Users can read own encrypted vault"
on public.portfolio_vaults
for select
using (auth.uid() = user_id);

create policy "Users can insert own encrypted vault"
on public.portfolio_vaults
for insert
with check (auth.uid() = user_id);

create policy "Users can update own encrypted vault"
on public.portfolio_vaults
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_portfolio_vaults_updated_at on public.portfolio_vaults;

create trigger set_portfolio_vaults_updated_at
before update on public.portfolio_vaults
for each row
execute function public.set_updated_at();
```

### 页面配置

1. 在 Supabase 项目中复制 `Project URL` 和 `anon public` key。
2. 打开页面，点击“云同步”。
3. 填入 Supabase URL 和 Anon Key，保存配置。
4. 输入邮箱、登录密码、同步加密密码。
5. 注册或登录。
6. 点击“加密上传”把本地数据同步到云端。
7. 在另一台设备登录后，输入同一个同步加密密码。页面会自动检查云端更新，也可以点击“下载解密”手动恢复。

开启“自动上传”后，每次保存持仓、历史记录或快照，页面会自动加密上传。页面打开并已登录时，会每 60 秒检查一次云端是否有更新。

如果勾选“记住本设备”，同步加密密码会保存在当前浏览器本地，后续打开页面可自动拉取和解密云端数据。这个选项更方便，但手机解锁和浏览器环境的安全性会变得更重要；公共设备不要勾选。

## 产品优选自动更新

页面包含“产品优选”模块，用来展示每个仓位的候选产品和综合评分。

数据文件：

- `data/products_seed.json`：候选产品清单，可手动增删产品。
- `data/products_universe.json`：全市场 ETF 扫描结果，只在手动扫描时刷新。
- `data/products_candidates.json`：全市场初筛后的候选池。
- `data/products.json`：候选池的最新指标和评分，前端读取这个文件。
- `scripts/update_products.py`：更新脚本，支持 `update` 和 `scan` 两种模式。
- `.github/workflows/update-products.yml`：每周一自动运行 `update`，也可以手动选择 `scan`。

GitHub 上传后，需要确认仓库的 Actions 有写入权限：

1. 打开仓库 `Settings`。
2. 进入 `Actions` -> `General`。
3. 在 `Workflow permissions` 里选择 `Read and write permissions`。
4. 保存。

之后进入 `Actions` -> `Update product data`：

- 日常更新：选择 `update`，只更新 `data/products_candidates.json` 里的候选池行情和评分。
- 重新全市场扫描：选择 `scan`，先扫描全市场 ETF，刷新 `data/products_universe.json` 和 `data/products_candidates.json`，再更新评分。

默认计划是每周一自动运行 `update`，不会每周全市场扫描。

评分不是投资建议，只用于同一仓位内部比较。脚本优先使用近1月、近3月、近1年收益，同时考虑最大回撤、年化波动、费率和流动性。高收益仓会更偏向收益弹性，现金和债券仓会更重视回撤控制。

## 持仓成本和减仓提醒

持仓录入支持：

- 产品代码
- 当前金额
- 持仓成本
- 自定义止损提醒阈值
- 自定义止盈提醒阈值

页面会基于本地持仓和 `data/products.json` 的公开产品指标生成提醒，包括：

- 持仓收益跌破止损阈值
- 持仓收益超过止盈阈值
- 单一高收益产品占总资产过高
- 产品候选池评分偏低
- 近1月/近3月趋势明显恶化
- 高收益产品近一年回撤过深

提醒扫描在浏览器本地完成，持仓成本不会明文上传。页面打开后会每 5 分钟扫描一次，也可以点击“立即扫描”。可选开启浏览器通知。

限制：纯静态 PWA 不能保证在手机系统后台永久运行，所以它不能像券商 App 那样在完全关闭页面时持续推送。云端 GitHub Actions 只更新公开产品数据，不会解密或读取你的个人持仓。

## 默认目标仓位

| 类别 | 目标 | 允许区间 |
|---|---:|---:|
| 现金/货币基金 | 10% | 8%-12% |
| 债基/国债类 | 22% | 18%-26% |
| 红利低波/高股息 | 20% | 16%-24% |
| 宽基指数 | 25% | 21%-29% |
| 黄金 | 8% | 5%-11% |
| 高收益仓 | 15% | 10%-18% |

## 使用流程

1. 在“录入持仓”中按产品添加当前金额。
2. 在“录入历史”中记录收入、买入、卖出和再平衡。
3. 每次录入持仓或点击“保存今日快照”后，系统会保存一条资产快照。
4. 在“收益波动”中切换查看总资产、全部仓位或单个仓位的折线图。
5. 每月输入本月可投资金额，查看“下一步加仓建议”。
6. 每半年检查是否有仓位超过允许区间，必要时再平衡。
7. 定期点击“导出”保存 JSON 备份。
