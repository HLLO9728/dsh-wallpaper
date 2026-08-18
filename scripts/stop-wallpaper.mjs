#!/usr/bin/env node
/**
 * stop-wallpaper.mjs — 纯净启动：彻底禁用 dsh-wallpaper 插件
 *
 * 作用：把 dsh-wallpaper 从 DSH web profile 的 bundle 列表里移除，
 *       重启 DSH 后插件（host + 浏览器端）将完全不加载，最纯净、零风险。
 *
 * 用法：node ./scripts/stop-wallpaper.mjs
 * 注意：脚本只改配置并备份，最后需要你【手动重启 DSH】才生效。
 *       恢复请运行：node ./scripts/start-wallpaper.mjs
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
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

  if (!bundles.includes(NAME)) {
    console.log(`[${NAME}] 已经是停用状态（bundles 里没有 ${NAME}）。`)
    if (existsSync(`${file}.dsh-wallpaper.bak`)) console.log('备份文件仍存在，可用 start 脚本恢复。')
    process.exit(0)
  }

  // 备份原始文件（只在还没有备份时备份）
  const bak = `${file}.dsh-wallpaper.bak`
  if (!existsSync(bak)) {
    copyFileSync(file, bak)
    console.log(`[${NAME}] 已备份原配置到：${bak}`)
  }

  // 移除 bundles 里的 dsh-wallpaper
  json.dsh.profile.bundles = bundles.filter((b) => b !== NAME)

  writeFileSync(file, JSON.stringify(json, null, 2), 'utf8')
  console.log(`[${NAME}] 已从 web profile 的 bundles 中移除，插件将被停用。`)
  console.log('')
  console.log('下一步：请【手动重启 DSH】后生效（先停掉 dsh web，再重新启动）。')
  console.log(`恢复壁纸：node ./scripts/start-wallpaper.mjs 后同样重启 DSH。`)
  process.exit(0)
}

main()
