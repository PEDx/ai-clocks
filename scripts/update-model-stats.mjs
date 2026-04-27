#!/usr/bin/env node

import { readdir, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "..")
const modelsDir = path.join(rootDir, "models")
const indexPath = path.join(rootDir, "index.html")

function countMatches(input, pattern) {
  return [...input.matchAll(pattern)].length
}

function countCommentLines(source) {
  const marked = new Set()

  function markRange(start, end) {
    const before = source.slice(0, start)
    const block = source.slice(start, end)
    const startLine = before.split("\n").length
    const lineCount = block.split("\n").length

    for (let i = 0; i < lineCount; i += 1) {
      marked.add(startLine + i)
    }
  }

  for (const match of source.matchAll(/<!--[\s\S]*?-->/g)) {
    markRange(match.index, match.index + match[0].length)
  }

  for (const match of source.matchAll(/\/\*[\s\S]*?\*\//g)) {
    markRange(match.index, match.index + match[0].length)
  }

  const lineCommentPattern = /(^|[^:])\/\/[^\n\r]*/gm
  for (const match of source.matchAll(lineCommentPattern)) {
    const offset = match[1] ? 1 : 0
    markRange(match.index + offset, match.index + match[0].length)
  }

  return marked.size
}

function extractTagContents(source, tagName) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi")
  return [...source.matchAll(pattern)].map((match) => match[1])
}

function countFunctions(source) {
  const scriptSource = extractTagContents(source, "script").join("\n")
  const reservedWords = new Set(["catch", "for", "function", "if", "switch", "while"])
  const functionDeclarations = countMatches(scriptSource, /\bfunction\b/g)
  const arrowFunctions = countMatches(scriptSource, /=>/g)
  let methodShorthand = 0

  for (const match of scriptSource.matchAll(/\b(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g)) {
    const name = match[1]
    const prefix = scriptSource.slice(Math.max(0, match.index - 24), match.index)

    if (reservedWords.has(name)) continue
    if (/\bfunction\s*$/.test(prefix)) continue
    if (/\bfunction\s+\*\s*$/.test(prefix)) continue

    methodShorthand += 1
  }

  return functionDeclarations + arrowFunctions + methodShorthand
}

function collectStats(source) {
  const lines = source.split(/\r\n|\r|\n/)
  const trailingNewline = /\r\n$|\r$|\n$/.test(source)
  const lineCount = trailingNewline ? lines.length - 1 : lines.length
  const blankLines = lines.slice(0, lineCount).filter((line) => line.trim() === "").length
  const commentLines = countCommentLines(source)

  return {
    lines: lineCount,
    codeLines: Math.max(lineCount - blankLines - commentLines, 0),
    blankLines,
    commentLines,
    functions: countFunctions(source),
    scripts: countMatches(source, /<script\b/gi),
    styles: countMatches(source, /<style\b/gi),
    bytes: Buffer.byteLength(source, "utf8")
  }
}

function extractModelsArray(html) {
  const declaration = "const models = "
  const start = html.indexOf(declaration)

  if (start === -1) {
    throw new Error(`Cannot find "${declaration}" in ${indexPath}`)
  }

  const arrayStart = html.indexOf("[", start)
  if (arrayStart === -1) {
    throw new Error("Cannot find models array start")
  }

  let depth = 0
  let inString = false
  let quote = ""
  let escaped = false

  for (let i = arrayStart; i < html.length; i += 1) {
    const char = html[i]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === quote) {
        inString = false
      }
      continue
    }

    if (char === '"' || char === "'" || char === "`") {
      inString = true
      quote = char
      continue
    }

    if (char === "[") {
      depth += 1
    } else if (char === "]") {
      depth -= 1
      if (depth === 0) {
        return {
          start,
          end: i + 1,
          source: html.slice(arrayStart, i + 1)
        }
      }
    }
  }

  throw new Error("Cannot find models array end")
}

function readExistingModels(html) {
  const { source } = extractModelsArray(html)
  return Function(`"use strict"; return (${source});`)()
}

function makeModelName(folderName) {
  return folderName
    .split("-")
    .map((part) => {
      if (/^\d/.test(part)) return part.toUpperCase()
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join(" ")
    .replace(/\bGpt\b/g, "GPT")
    .replace(/\bGlm\b/g, "GLM")
    .replace(/\bQwen\b/g, "Qwen")
}

function formatModel(model) {
  const stats = Object.entries(model.stats)
    .map(([key, value]) => `${key}: ${value}`)
    .join(", ")

  return [
    "      {",
    `        name: ${JSON.stringify(model.name)},`,
    `        path: ${JSON.stringify(model.path)},`,
    `        stats: { ${stats} }`,
    "      }"
  ].join("\n")
}

async function discoverModelPages() {
  const entries = await readdir(modelsDir, { withFileTypes: true })
  const modelPages = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const htmlPath = path.join(modelsDir, entry.name, "index.html")
    try {
      const fileStat = await stat(htmlPath)
      if (fileStat.isFile()) {
        modelPages.push({
          folder: entry.name,
          absolutePath: htmlPath,
          webPath: `./models/${entry.name}/index.html`
        })
      }
    } catch {
      // Folders without an index.html are ignored by design.
    }
  }

  return modelPages.sort((a, b) => a.folder.localeCompare(b.folder))
}

async function main() {
  const html = await readFile(indexPath, "utf8")
  const existingModels = readExistingModels(html)
  const existingByPath = new Map(existingModels.map((model) => [model.path, model]))
  const existingOrder = new Map(existingModels.map((model, index) => [model.path, index]))
  const modelPages = await discoverModelPages()

  const models = await Promise.all(
    modelPages.map(async (page) => {
      const source = await readFile(page.absolutePath, "utf8")
      const existing = existingByPath.get(page.webPath)

      return {
        name: existing?.name || makeModelName(page.folder),
        path: page.webPath,
        stats: collectStats(source)
      }
    })
  )

  models.sort((a, b) => {
    const aOrder = existingOrder.get(a.path) ?? Number.MAX_SAFE_INTEGER
    const bOrder = existingOrder.get(b.path) ?? Number.MAX_SAFE_INTEGER

    if (aOrder !== bOrder) return aOrder - bOrder
    return a.path.localeCompare(b.path)
  })

  const modelsSource = `const models = [\n${models.map(formatModel).join(",\n")}\n    ]`
  const arrayRange = extractModelsArray(html)
  const nextHtml = html.slice(0, arrayRange.start) + modelsSource + html.slice(arrayRange.end)

  await writeFile(indexPath, nextHtml, "utf8")

  console.log(`Updated ${models.length} model stats in ${path.relative(rootDir, indexPath)}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
