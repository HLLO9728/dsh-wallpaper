#!/usr/bin/env node
/**
 * start-wallpaper.mjs — 恢复 dsh-wallpaper 壁纸插件
 *
 * 作用：把 dsh-wallpaper 加回 DSH web profile 的 bundle 列表，恢复壁纸功能。
 *
 * 用法：node ./scripts/start-wallpaper.mjs
 * 注意：脚本只改配置，最后需要你【手动重启 DSH】才生效。
 *       若你把 dsh-wallpaper 卸载了（node_modules 里没有），请先：
 *         dsh plugin --profile web add dsh-wallpaper  （或从 git 安装）
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const NAME = 'dsh-wallpaper'
function profilePkg() {
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'profiles', 'web', 'package.json')
}

function main() {
  const file = profilePkg()
  if (!existsSync(file)) {
    console.error(`[${NAME}] 找不到 web profile 的 package.json：${file}`)
    console.error('请确认 DSH 已安装，或设置环境变量 DSH_HOME。')
    process.exit(1)
  }

  const json = JSON.parse(readFileSync(file, 'utf8'))
  const bundles = Array.isArray(json?.dsh?.profile?.bundles) ? json.dsh.profile.bundles : []

  if (bundles.includes(NAME)) {
    console.log(`[${NAME}] 已经是启用状态（bundles 里已有 ${NAME}）。`)
    process.exit(0)
  }

  json.dsh.profile.bundles = [...bundles, NAME]
  writeFileSync(file, JSON.stringify(json, null, 2), 'utf8')
  console.log(`[${NAME}] 已把 ${NAME} 加回 web profile 的 bundles，壁纸功能将被恢复。`)
  console.log('')
  console.log('下一步：请【手动重启 DSH】后生效（停掉 dsh web，再重新启动）。')
  console.log('若重启后仍无壁纸，确认 media 目录下有 wallpaper.yml 与媒体文件。')
  process.exit(0)
}

main()
